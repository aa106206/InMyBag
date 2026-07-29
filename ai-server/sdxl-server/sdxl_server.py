"""KIDO LoRA(SDXL) 이미지 생성 FastAPI 서버.

InMyBag의 그림일기 일러스트를 생성하는 서버입니다. 메인 AI 서버(포트 8000)와
torch 버전이 달라(2.5.1+ vs 2.4.1) 별도 프로세스(포트 8010)로 돌고,
앱 요청은 메인 서버의 /sdxl/generate 프록시와 /story/generate 를 거쳐 도착합니다.

실행 (ai-server/start-ai-servers.sh 가 자동으로 합니다):
    source /workspace/sdxl-lora/env.sh
    /workspace/sdxl-lora/.venv/bin/uvicorn sdxl_server:app \
        --app-dir /workspace/InMyBag/ai-server/sdxl-server --host 127.0.0.1 --port 8010

환경 변수:
    SDXL_SKETCH_LORA_DIR    kidsketch LoRA 디렉터리 (기본: checkpoints/kidsketch-lora)
    SDXL_SKETCH_LORA_SCALE  kidsketch(AI Hub 연필화 그림체) 비중 (기본 1.0)
    SDXL_LORA_DIR           kido LoRA 디렉터리 (기본: checkpoints/kido-lora)
    SDXL_KIDO_LORA_SCALE    kido(KIDO 컬러 그림) 비중 (기본 0.4, 채색 보조)
"""

import base64
import gc
import io
import logging
import os
import threading
import time
from pathlib import Path

import torch
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger("sdxl_server")

ROOT_DIR = Path(__file__).resolve().parent

BASE_REPO = "stabilityai/stable-diffusion-xl-base-1.0"
VAE_FIX_REPO = "madebyollin/sdxl-vae-fp16-fix"

# 두 LoRA를 섞어 씁니다.
#   - kidsketch (AI Hub HTP 아동 연필화): 그림체의 주축. 선·형태·아이 손그림 느낌.
#     흑백 연필화로 학습됐으므로 색은 프롬프트와 kido로 보탭니다.
#   - kido (KIDO 컬러 아동 그림): 채색을 보태는 보조 어댑터. 약하게 섞습니다.
# 비율은 환경 변수로 조절합니다 (kidsketch를 더 크게 = AI Hub 그림체가 더 강함).
SKETCH_LORA_SCALE = float(os.environ.get("SDXL_SKETCH_LORA_SCALE", "1.0"))
KIDO_LORA_SCALE = float(
    os.environ.get("SDXL_KIDO_LORA_SCALE", os.environ.get("SDXL_LORA_SCALE", "0.4"))
)

# LoRA 가중치 위치. 우선순위:
#   1) 환경 변수 (SDXL_SKETCH_LORA_DIR / SDXL_LORA_DIR)
#   2) 이 폴더의 checkpoints/<이름> (repo 표준 위치, 가중치는 Drive로 공유)
#   3) 학습 작업 공간의 원본 출력 (/workspace/sdxl-lora/outputs/<이름>)
_SKETCH_DIR_CANDIDATES = [
    os.environ.get("SDXL_SKETCH_LORA_DIR"),
    str(ROOT_DIR / "checkpoints" / "kidsketch-lora"),
    "/workspace/sdxl-lora/outputs/kidsketch-lora",
]
_KIDO_DIR_CANDIDATES = [
    os.environ.get("SDXL_LORA_DIR"),
    str(ROOT_DIR / "checkpoints" / "kido-lora"),
    "/workspace/sdxl-lora/outputs/kido-lora",
]


def _resolve_lora_dir(candidates: list[str | None]) -> Path | None:
    for candidate in candidates:
        if candidate and (Path(candidate) / "pytorch_lora_weights.safetensors").exists():
            return Path(candidate)
    return None


SKETCH_LORA_DIR = _resolve_lora_dir(_SKETCH_DIR_CANDIDATES)
KIDO_LORA_DIR = _resolve_lora_dir(_KIDO_DIR_CANDIDATES)

# 학습 때 캡션 앞에 붙인 트리거 워드. 프롬프트에 없으면 자동으로 앞에 붙입니다.
# (kidsketch: AI Hub 연필화 / kidodrawing: KIDO 컬러 그림)
# 실제로 붙는 목록은 로드에 성공한 어댑터에 따라 startup에서 채워집니다.
_active_triggers: list[str] = []
_active_adapters: list[tuple[str, float]] = []

# 아동 크레파스 그림체에서 빼고 싶은 요소들. 요청에서 덮어쓸 수 있습니다.
DEFAULT_NEGATIVE = "photo, photorealistic, 3d render, text, watermark, signature, blurry"

app = FastAPI(title="InMyBag SDXL KIDO LoRA Server")

# GPU 는 하나이므로 생성 요청을 순차 처리합니다 (동시 실행 시 VRAM 초과 방지).
_generate_lock = threading.Lock()
_pipe = None
_pipe_error: str | None = None


class GenerateInput(BaseModel):
    prompt: str = Field(min_length=1, max_length=2000)
    negativePrompt: str = Field(default=DEFAULT_NEGATIVE, max_length=2000)
    steps: int = Field(default=30, ge=4, le=60)
    guidance: float = Field(default=7.0, ge=1.0, le=15.0)
    width: int = Field(default=1024, ge=512, le=1344)
    height: int = Field(default=1024, ge=512, le=1344)
    seed: int = Field(default=-1, description="-1 이면 랜덤")
    addTrigger: bool = Field(default=True, description="트리거 워드 자동 추가 여부")


def _load_pipeline():
    """SDXL base + fp16-fix VAE + LoRA(kidsketch 주 + kido 보조)를 한 번만 로드해 재사용합니다."""
    global _pipe, _pipe_error
    from diffusers import AutoencoderKL, StableDiffusionXLPipeline

    try:
        if not torch.cuda.is_available():
            raise RuntimeError("CUDA GPU를 찾을 수 없습니다.")

        # 사용할 어댑터 목록. (이름, 경로, 스케일, 트리거) 순.
        # kidsketch가 그림체의 주축이므로 앞에 둔다 (트리거 순서에도 반영).
        adapter_plan = [
            ("kidsketch", SKETCH_LORA_DIR, SKETCH_LORA_SCALE, "kidsketch"),
            ("kido", KIDO_LORA_DIR, KIDO_LORA_SCALE, "kidodrawing"),
        ]
        available = [
            (name, path, scale, trigger)
            for name, path, scale, trigger in adapter_plan
            if path is not None and scale > 0
        ]
        if not available:
            raise RuntimeError(
                "LoRA 가중치를 찾을 수 없습니다. checkpoints/kidsketch-lora 또는 "
                "checkpoints/kido-lora 에 pytorch_lora_weights.safetensors 를 넣어주세요."
            )
        for name, path, _, _ in adapter_plan:
            if path is None:
                logger.warning("LoRA %s 가중치가 없어 건너뜁니다.", name)

        dtype = torch.float16
        logger.info("VAE 로드: %s", VAE_FIX_REPO)
        vae = AutoencoderKL.from_pretrained(VAE_FIX_REPO, torch_dtype=dtype)

        logger.info("파이프라인 로드: %s", BASE_REPO)
        t0 = time.time()
        pipe = StableDiffusionXLPipeline.from_pretrained(
            BASE_REPO,
            vae=vae,
            torch_dtype=dtype,
            variant="fp16",
            use_safetensors=True,
            add_watermarker=False,
        )
        pipe.to("cuda")

        for name, path, scale, _ in available:
            logger.info("LoRA 적용: %s <- %s (scale=%s)", name, path, scale)
            pipe.load_lora_weights(str(path), adapter_name=name)

        # 두 어댑터를 지정 비율로 활성화한 뒤 fuse해 추론 오버헤드를 없앱니다.
        pipe.set_adapters(
            [name for name, _, _, _ in available],
            adapter_weights=[scale for _, _, scale, _ in available],
        )
        pipe.fuse_lora(adapter_names=[name for name, _, _, _ in available])
        pipe.unload_lora_weights()

        _active_adapters.clear()
        _active_adapters.extend((name, scale) for name, _, scale, _ in available)
        _active_triggers.clear()
        _active_triggers.extend(trigger for _, _, _, trigger in available)

        logger.info(
            "SDXL + LoRA 준비 완료 (%.1fs): %s",
            time.time() - t0,
            ", ".join(f"{name}={scale}" for name, scale in _active_adapters),
        )
        _pipe = pipe
        _pipe_error = None
    except Exception as exc:  # noqa: BLE001 - 준비 실패 사유를 /healthy 로 보여주기 위함
        logger.exception("SDXL 파이프라인 로드 실패")
        _pipe_error = str(exc)


@app.on_event("startup")
def startup() -> None:
    _load_pipeline()
    if _pipe is not None and os.environ.get("SDXL_WARMUP", "1") == "1":
        # 첫 요청의 CUDA 커널 초기화 지연을 없애기 위해 작은 이미지를 한 장 만들어 둡니다.
        logger.info("워밍업 생성 시작")
        t0 = time.time()
        with torch.inference_mode():
            _pipe(
                prompt=f"{', '.join(_active_triggers)}, a child's drawing of a sun",
                num_inference_steps=4,
                width=512,
                height=512,
                guidance_scale=7.0,
            )
        torch.cuda.empty_cache()
        logger.info("워밍업 완료 (%.1fs)", time.time() - t0)


@app.get("/healthy")
def healthy() -> dict:
    if _pipe is not None:
        return {
            "status": "ok",
            "model": "sdxl-base-1.0 + " + " + ".join(name for name, _ in _active_adapters),
            "adapters": {name: scale for name, scale in _active_adapters},
        }
    return {"status": "error", "detail": _pipe_error or "모델이 아직 로드되지 않았습니다."}


@app.post("/generate")
def generate(payload: GenerateInput) -> dict:
    """프롬프트를 받아 KIDO 그림체 이미지를 PNG data URI 로 반환합니다."""
    if _pipe is None:
        raise HTTPException(status_code=503, detail=_pipe_error or "모델이 로드되지 않았습니다.")

    prompt = payload.prompt.strip()
    if payload.addTrigger:
        # 로드된 어댑터의 트리거 워드 중 빠진 것을 앞에 붙입니다 (kidsketch 우선).
        missing = [word for word in _active_triggers if word not in prompt.lower()]
        if missing:
            prompt = f"{', '.join(missing)}, {prompt}"

    # SDXL 은 8의 배수 해상도만 허용합니다.
    width = payload.width - payload.width % 8
    height = payload.height - payload.height % 8

    seed = payload.seed if payload.seed >= 0 else int(torch.seed() % (2**31))

    with _generate_lock:
        generator = torch.Generator(device="cuda").manual_seed(seed)
        t0 = time.time()
        try:
            with torch.inference_mode():
                image = _pipe(
                    prompt=prompt,
                    negative_prompt=payload.negativePrompt,
                    num_inference_steps=payload.steps,
                    guidance_scale=payload.guidance,
                    width=width,
                    height=height,
                    generator=generator,
                ).images[0]
        except torch.cuda.OutOfMemoryError as exc:
            gc.collect()
            torch.cuda.empty_cache()
            raise HTTPException(status_code=507, detail=f"VRAM 부족: {exc}") from exc
        elapsed_ms = (time.time() - t0) * 1000

    output = io.BytesIO()
    image.save(output, format="PNG")
    encoded = base64.b64encode(output.getvalue()).decode("ascii")

    logger.info("생성 완료 seed=%s %dx%d steps=%d %.0fms", seed, width, height, payload.steps, elapsed_ms)
    return {
        "image": f"data:image/png;base64,{encoded}",
        "prompt": prompt,
        "seed": seed,
        "width": width,
        "height": height,
        "steps": payload.steps,
        "guidance": payload.guidance,
        "elapsedMs": round(elapsed_ms),
    }
