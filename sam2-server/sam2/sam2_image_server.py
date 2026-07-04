import base64
import importlib.util
import io
import logging
from functools import lru_cache
from pathlib import Path
from typing import Any

import numpy as np
import torch
from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image

from sam2.build_sam import build_sam2
from sam2.sam2_image_predictor import SAM2ImagePredictor

logger = logging.getLogger(__name__)

# 이 파일이 있는 sam2 폴더를 기준으로 체크포인트 파일을 찾습니다.
APP_ROOT = Path(__file__).resolve().parent
PROJECT_ROOT = APP_ROOT.parents[1]
DINO_PATH = PROJECT_ROOT / "grounding dino" / "dino.py"

# 너무 큰 이미지는 추론 시간이 길어지므로 긴 변을 1024px로 줄여서 처리합니다.
MAX_IMAGE_SIZE = 1024

# 앱에서 박스 좌표를 보내지 않으면 이미지 가장자리 15%를 제외한 중앙 영역을 사용합니다.
# 점 하나보다 박스가 "색이 나뉜 같은 객체"를 하나로 묶어 잡는 데 더 안정적입니다.
DEFAULT_BOX_PADDING_RATIO = 0.15

# 너무 작은 마스크는 뚜껑/라벨/그림자 같은 부분 영역일 가능성이 높아서 제외합니다.
MIN_MASK_BOX_AREA_RATIO = 0.20

app = FastAPI(title="InMyBag SAM2 Image Server")

# Expo 앱/휴대폰/시뮬레이터에서 이 서버로 요청할 수 있도록 CORS를 열어둡니다.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@lru_cache(maxsize=1)
def get_dino_module():
    """공백이 있는 grounding dino 폴더의 dino.py를 동적으로 로딩합니다."""
    if not DINO_PATH.exists():
        raise RuntimeError(f"Grounding DINO script not found: {DINO_PATH}")

    spec = importlib.util.spec_from_file_location("inmybag_grounding_dino", DINO_PATH)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Failed to load Grounding DINO script: {DINO_PATH}")

    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


@lru_cache(maxsize=1)
def get_predictor() -> SAM2ImagePredictor:
    """SAM2 모델은 무겁기 때문에 서버 실행 중 한 번만 로딩해서 재사용합니다."""
    # checkpoint = APP_ROOT / "checkpoints/sam2.1_hiera_small.pt"
    # model_cfg = "configs/sam2.1/sam2.1_hiera_s.yaml"

    checkpoint = APP_ROOT / "checkpoints/sam2.1_hiera_large.pt"
    model_cfg = "configs/sam2.1/sam2.1_hiera_l.yaml"

    if not checkpoint.exists():
        raise RuntimeError(f"SAM2 checkpoint not found: {checkpoint}")

    # Mac Apple Silicon은 mps, NVIDIA GPU는 cuda, 그 외 환경은 cpu를 사용합니다.
    if torch.backends.mps.is_available():
        device = "mps"
    elif torch.cuda.is_available():
        device = "cuda"
    else:
        device = "cpu"

    logger.info("Loading SAM2 image predictor on %s", device)
    model = build_sam2(model_cfg, str(checkpoint), device=device)
    return SAM2ImagePredictor(model)


def _mask_bbox(mask: np.ndarray) -> tuple[int, int, int, int] | None:
    """마스크가 차지하는 최소 사각 영역을 구합니다."""
    ys, xs = np.where(mask > 0)
    if xs.size == 0 or ys.size == 0:
        return None
    return int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1


def _build_prompt_box(
    width: int,
    height: int,
    box_x0: float | None,
    box_y0: float | None,
    box_x1: float | None,
    box_y1: float | None,
    source_width: float | None,
    source_height: float | None,
) -> np.ndarray:
    """앱에서 받은 박스가 있으면 쓰고, 없으면 이미지 중앙 박스를 만듭니다."""
    has_custom_box = None not in (box_x0, box_y0, box_x1, box_y1)

    if has_custom_box:
        # 앱의 bbox는 원본 사진 좌표입니다.
        # 서버는 이미지를 MAX_IMAGE_SIZE 안으로 줄여서 추론하므로, 좌표도 같은 비율로 줄여야 합니다.
        scale_x = width / source_width if source_width and source_width > 0 else 1.0
        scale_y = height / source_height if source_height and source_height > 0 else 1.0

        x0 = float(box_x0)
        y0 = float(box_y0)
        x1 = float(box_x1)
        y1 = float(box_y1)
        x0 *= scale_x
        y0 *= scale_y
        x1 *= scale_x
        y1 *= scale_y
    else:
        # 자동 박스가 아직 없을 때 쓰는 기본값입니다.
        # 사진 중앙에 물건을 두고 찍는 흐름에서는 점 prompt보다 안정적으로 동작합니다.
        x_padding = width * DEFAULT_BOX_PADDING_RATIO
        y_padding = height * DEFAULT_BOX_PADDING_RATIO
        x0 = x_padding
        y0 = y_padding
        x1 = width - x_padding
        y1 = height - y_padding

    # 좌표 순서가 뒤집혀 들어와도 정상 박스로 보정합니다.
    left = max(0.0, min(width - 1.0, min(x0, x1)))
    top = max(0.0, min(height - 1.0, min(y0, y1)))
    right = max(1.0, min(float(width), max(x0, x1)))
    bottom = max(1.0, min(float(height), max(y0, y1)))

    if right <= left:
        right = min(float(width), left + 1.0)
    if bottom <= top:
        bottom = min(float(height), top + 1.0)

    return np.array([left, top, right, bottom], dtype=np.float32)


def _box_area(box: np.ndarray | tuple[int, int, int, int]) -> float:
    """[x0, y0, x1, y1] 박스의 면적을 구합니다."""
    x0, y0, x1, y1 = box
    return max(0.0, float(x1) - float(x0)) * max(0.0, float(y1) - float(y0))


def _box_intersection_area(
    a: np.ndarray | tuple[int, int, int, int],
    b: np.ndarray | tuple[int, int, int, int],
) -> float:
    """두 박스가 겹치는 면적을 구합니다."""
    ax0, ay0, ax1, ay1 = a
    bx0, by0, bx1, by1 = b
    x0 = max(float(ax0), float(bx0))
    y0 = max(float(ay0), float(by0))
    x1 = min(float(ax1), float(bx1))
    y1 = min(float(ay1), float(by1))
    return max(0.0, x1 - x0) * max(0.0, y1 - y0)


def _make_mask_overlay(image: Image.Image, mask: np.ndarray) -> Image.Image:
    """원본 위에 선택된 segment 영역을 반투명 색으로 덮어 사용자가 결과를 확인하게 합니다."""
    base = image.convert("RGBA")
    mask_bool = mask.astype(bool)
    mask_uint8 = mask_bool.astype(np.uint8)

    overlay_array = np.zeros((mask_uint8.shape[0], mask_uint8.shape[1], 4), dtype=np.uint8)
    overlay_array[mask_bool] = [1, 69, 242, 112]
    overlay = Image.fromarray(overlay_array, mode="RGBA")

    # 마스크 가장자리만 한 번 더 진하게 표시해 어느 부분이 잘렸는지 더 잘 보이게 합니다.
    padded = np.pad(mask_uint8, 1, mode="constant", constant_values=0)
    neighbor_count = (
        padded[:-2, 1:-1]
        + padded[2:, 1:-1]
        + padded[1:-1, :-2]
        + padded[1:-1, 2:]
    )
    edge = mask_bool & (neighbor_count < 4)
    edge_array = np.zeros_like(overlay_array)
    edge_array[edge] = [0, 0, 0, 230]
    edge_overlay = Image.fromarray(edge_array, mode="RGBA")

    return Image.alpha_composite(Image.alpha_composite(base, overlay), edge_overlay)


def _select_best_mask(
    masks: np.ndarray,
    scores: np.ndarray,
    prompt_box: np.ndarray,
) -> tuple[int, np.ndarray, tuple[int, int, int, int] | None]:
    """SAM2 후보 중 작은 부분/그림자보다 박스 안의 주 객체에 가까운 마스크를 고릅니다."""
    prompt_area = max(1.0, _box_area(prompt_box))
    best_idx = 0
    best_rank = float("-inf")
    best_bbox: tuple[int, int, int, int] | None = None

    for idx, mask in enumerate(masks):
        candidate = mask.astype(bool)
        bbox = _mask_bbox(candidate)
        if bbox is None:
            continue

        mask_area = float(candidate.sum())
        mask_area_ratio = mask_area / prompt_area
        bbox_area = max(1.0, _box_area(bbox))
        bbox_prompt_overlap = _box_intersection_area(bbox, prompt_box) / bbox_area

        # SAM2 score만 쓰면 로고/그림자처럼 작고 선명한 영역이 이길 수 있습니다.
        # bbox 대비 너무 작은 후보는 "하나의 물체 전체"가 아닐 가능성이 높아 아예 제외합니다.
        if mask_area_ratio < MIN_MASK_BOX_AREA_RATIO:
            continue

        # 면적과 bbox 겹침을 함께 보며, 박스 안의 주 객체에 가까운 후보를 고릅니다.
        area_bonus = min(mask_area_ratio, 1.0)
        rank = float(scores[idx]) + area_bonus * 0.45 + bbox_prompt_overlap * 0.2

        if rank > best_rank:
            best_rank = rank
            best_idx = idx
            best_bbox = bbox

    if best_bbox is None:
        # 모든 후보가 너무 작게 걸러진 경우에는, 그래도 가장 넓은 후보를 fallback으로 씁니다.
        fallback_idx = int(np.argmax([mask.astype(bool).sum() for mask in masks]))
        fallback_mask = masks[fallback_idx].astype(bool)
        return fallback_idx, fallback_mask, _mask_bbox(fallback_mask)

    return best_idx, masks[best_idx].astype(bool), best_bbox


def _crop_with_padding(
    image: Image.Image,
    mask: np.ndarray,
    bbox: tuple[int, int, int, int],
    padding: int = 0,
) -> Image.Image:
    """원본 이미지에 마스크를 알파 채널로 입혀 객체 바깥을 투명하게 자릅니다."""
    width, height = image.size
    x0, y0, x1, y1 = bbox
    x0 = max(0, x0 - padding)
    y0 = max(0, y0 - padding)
    x1 = min(width, x1 + padding)
    y1 = min(height, y1 + padding)

    rgba = image.convert("RGBA")
    alpha = Image.fromarray((mask.astype(np.uint8) * 255), mode="L")
    rgba.putalpha(alpha)
    return rgba.crop((x0, y0, x1, y1))


def _png_data_uri(image: Image.Image) -> str:
    """앱에서 바로 Image uri로 사용할 수 있도록 PNG를 data URI 문자열로 변환합니다."""
    output = io.BytesIO()
    image.save(output, format="PNG")
    encoded = base64.b64encode(output.getvalue()).decode("ascii")
    return f"data:image/png;base64,{encoded}"


def segment_image_bytes(
    image_bytes: bytes,
    box_x0: float | None,
    box_y0: float | None,
    box_x1: float | None,
    box_y1: float | None,
    source_width: float | None,
    source_height: float | None,
) -> dict[str, Any]:
    """이미지 바이트를 받아 SAM2로 객체를 분리하고 앱이 사용할 JSON을 만듭니다."""
    image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    image.thumbnail((MAX_IMAGE_SIZE, MAX_IMAGE_SIZE))
    image_array = np.array(image)

    height, width = image_array.shape[:2]

    # SAM2에 점 하나를 주면 색/질감이 다른 영역을 별도 객체로 볼 수 있습니다.
    # 그래서 사람의 얼굴+머리카락, 복합 물건처럼 색이 나뉜 객체는 박스 prompt로 감싸서 보냅니다.
    prompt_box = _build_prompt_box(
        width,
        height,
        box_x0,
        box_y0,
        box_x1,
        box_y1,
        source_width,
        source_height,
    )

    predictor = get_predictor()
    with torch.inference_mode():
        predictor.set_image(image_array)
        center_x = (prompt_box[0] + prompt_box[2]) / 2
        center_y = (prompt_box[1] + prompt_box[3]) / 2
        # multimask_output=True라서 SAM2가 후보 마스크 여러 개와 점수를 반환합니다.
        # box에 중심 positive point를 함께 주면 박스 안의 작은 색 영역보다 중심 물체를 더 강하게 봅니다.
        masks, scores, _ = predictor.predict(
            point_coords=np.array([[center_x, center_y]], dtype=np.float32),
            point_labels=np.array([1], dtype=np.int32),
            box=prompt_box,
            multimask_output=True,
        )

    # SAM2 점수 1등이 항상 "하나의 물체 전체"는 아닙니다.
    # 그림자/로고/색 영역처럼 작은 후보를 피하기 위해 면적 기반 후처리로 다시 고릅니다.
    best_idx, best_mask, bbox = _select_best_mask(masks, scores, prompt_box)

    if bbox is None:
        # 마스크가 비어 있으면 앱이 깨지지 않도록 원본 전체를 반환합니다.
        cutout = image.convert("RGBA")
        overlay_image = image.convert("RGBA")
        bbox_list = [0, 0, width, height]
    else:
        cutout = _crop_with_padding(image, best_mask, bbox)
        overlay_image = _make_mask_overlay(image, best_mask)
        bbox_list = list(bbox)

    cutout_width, cutout_height = cutout.size

    return {
        "image": _png_data_uri(cutout),
        "overlayImage": _png_data_uri(overlay_image),
        "score": float(scores[best_idx]),
        "bbox": bbox_list,
        "promptBox": prompt_box.tolist(),
        "width": width,
        "height": height,
        "cutoutWidth": cutout_width,
        "cutoutHeight": cutout_height,
    }


@app.get("/healthy")
def healthy() -> dict[str, str]:
    """서버가 켜져 있는지 확인하는 간단한 헬스 체크 API입니다."""
    return {"status": "ok"}


@app.post("/detect")
async def detect(request: Request) -> dict[str, Any]:
    """Grounding DINO로 이미지 속 객체 bbox 후보들을 반환합니다."""
    image_bytes = await request.body()
    if not image_bytes:
        raise HTTPException(status_code=400, detail="Image body is empty")

    try:
        content_type = request.headers.get("content-type") or "image/jpeg"
        dino = get_dino_module()
        return dino.detect_image_bytes(image_bytes, mime_type=content_type)
    except Exception as exc:
        logger.exception("Grounding DINO detection failed")
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.post("/segment")
async def segment(
    request: Request,
    box_x0: float | None = Query(default=None),
    box_y0: float | None = Query(default=None),
    box_x1: float | None = Query(default=None),
    box_y1: float | None = Query(default=None),
    image_width: float | None = Query(default=None),
    image_height: float | None = Query(default=None),
) -> dict[str, Any]:
    """Expo 앱에서 보낸 이미지 요청을 받아 객체 분리 결과를 반환합니다."""
    image_bytes = await request.body()
    if not image_bytes:
        raise HTTPException(status_code=400, detail="Image body is empty")

    try:
        return segment_image_bytes(
            image_bytes,
            box_x0=box_x0,
            box_y0=box_y0,
            box_x1=box_x1,
            box_y1=box_y1,
            source_width=image_width,
            source_height=image_height,
        )
    except Exception as exc:
        logger.exception("SAM2 segmentation failed")
        raise HTTPException(status_code=500, detail=str(exc)) from exc
