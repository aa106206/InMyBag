"""KIDO LoRA(SDXL) 이미지 생성 FastAPI 서버.

InMyBag의 그림일기 일러스트를 생성하는 서버입니다. 메인 AI 서버(포트 8000)와
torch 버전이 달라(2.5.1+ vs 2.4.1) 별도 프로세스(포트 8010)로 돌고,
앱 요청은 메인 서버의 /sdxl/generate 프록시와 /story/generate 를 거쳐 도착합니다.

실행 (ai-server/start-ai-servers.sh 가 자동으로 합니다):
    source /workspace/sdxl-lora/env.sh
    /workspace/sdxl-lora/.venv/bin/uvicorn sdxl_server:app \
        --app-dir /workspace/InMyBag/ai-server/sdxl-server --host 127.0.0.1 --port 8010

환경 변수:
    SDXL_LORA_DIR    LoRA 디렉터리 (기본: 이 폴더의 checkpoints/kido-lora)
    SDXL_LORA_SCALE  fuse 가중치 (기본 1.0)
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
LORA_SCALE = float(os.environ.get("SDXL_LORA_SCALE", "1.0"))

# LoRA 가중치 위치. 우선순위:
#   1) SDXL_LORA_DIR 환경 변수
#   2) 이 폴더의 checkpoints/kido-lora (repo 표준 위치, 가중치는 Drive로 공유)
#   3) 학습 작업 공간의 원본 출력 (/workspace/sdxl-lora/outputs/kido-lora)
_LORA_DIR_CANDIDATES = [
    os.environ.get("SDXL_LORA_DIR"),
    str(ROOT_DIR / "checkpoints" / "kido-lora"),
    "/workspace/sdxl-lora/outputs/kido-lora",
]


def _resolve_lora_dir() -> Path:
    for candidate in _LORA_DIR_CANDIDATES:
        if candidate and (Path(candidate) / "pytorch_lora_weights.safetensors").exists():
            return Path(candidate)
    # 어디에도 없으면 첫 후보를 그대로 반환해, 로드 단계에서 명확한 에러 메시지를 남긴다.
    return Path(_LORA_DIR_CANDIDATES[0] or _LORA_DIR_CANDIDATES[1])


LORA_DIR = _resolve_lora_dir()

# 학습 때 캡션 앞에 붙인 트리거 워드. 프롬프트에 없으면 자동으로 앞에 붙입니다.
TRIGGER_WORD = "kidodrawing"

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
    """SDXL base + fp16-fix VAE + KIDO LoRA 를 한 번만 로드해 재사용합니다."""
    global _pipe, _pipe_error
    from diffusers import AutoencoderKL, StableDiffusionXLPipeline

    try:
        if not torch.cuda.is_available():
            raise RuntimeError("CUDA GPU를 찾을 수 없습니다.")

        lora_weights = LORA_DIR / "pytorch_lora_weights.safetensors"
        if not lora_weights.exists():
            raise RuntimeError(f"LoRA 가중치가 없습니다: {lora_weights}")

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

        logger.info("LoRA 적용: %s (scale=%s)", LORA_DIR, LORA_SCALE)
        pipe.load_lora_weights(str(LORA_DIR))
        pipe.fuse_lora(lora_scale=LORA_SCALE)
        # fuse 후에는 어댑터 상태가 필요 없으므로 정리해 추론 오버헤드를 없앱니다.
        pipe.unload_lora_weights()

        logger.info("SDXL + KIDO LoRA 준비 완료 (%.1fs)", time.time() - t0)
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
                prompt=f"{TRIGGER_WORD}, a child's drawing of a sun",
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
        return {"status": "ok", "model": "sdxl-base-1.0 + kido-lora", "loraScale": LORA_SCALE}
    return {"status": "error", "detail": _pipe_error or "모델이 아직 로드되지 않았습니다."}


@app.post("/generate")
def generate(payload: GenerateInput) -> dict:
    """프롬프트를 받아 KIDO 그림체 이미지를 PNG data URI 로 반환합니다."""
    if _pipe is None:
        raise HTTPException(status_code=503, detail=_pipe_error or "모델이 로드되지 않았습니다.")

    prompt = payload.prompt.strip()
    if payload.addTrigger and TRIGGER_WORD not in prompt.lower():
        prompt = f"{TRIGGER_WORD}, {prompt}"

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
