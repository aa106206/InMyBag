# SDXL KIDO LoRA 이미지 생성 서버

그림일기(`POST /story/generate`)의 일러스트를 그리는 서버입니다.
AI Hub KIDO 아동 그림 데이터로 파인튜닝한 SDXL LoRA(트리거 워드 `kidodrawing`)를 사용합니다.

## 구조

```
앱 → 메인 AI 서버(8000) /story/generate
        ├─ 이야기 텍스트: Gemini (gemini-2.5-flash)
        └─ 일러스트: 이 서버(127.0.0.1:8010) /generate  ← SDXL + KIDO LoRA
             (SDXL 서버가 죽어 있으면 Gemini 이미지 모델로 자동 폴백)
```

메인 서버와 torch 버전이 달라(2.5.1+ vs 2.4.1) **별도 프로세스/별도 venv**로 실행합니다.
앱은 메인 서버 주소(8000) 하나만 알면 됩니다.

## 파일

- `sdxl_server.py` — FastAPI 서버 (`/healthy`, `/generate`)
- `requirements-sdxl.txt` — 의존성 (별도 venv 필수)
- `checkpoints/kido-lora/pytorch_lora_weights.safetensors` — LoRA 가중치 (약 89MB)
  - git에는 올라가지 않습니다. SAM2 체크포인트처럼 Google Drive로 공유받아 넣어주세요.

## 실행

RunPod에서는 `bash ai-server/start-ai-servers.sh` 가 메인 서버와 함께 자동으로 띄웁니다.

수동 실행:

```bash
/workspace/sdxl-lora/.venv/bin/uvicorn sdxl_server:app \
  --app-dir /workspace/InMyBag/ai-server/sdxl-server --host 127.0.0.1 --port 8010
```

확인:

```bash
curl http://127.0.0.1:8010/healthy
# {"status":"ok","model":"sdxl-base-1.0 + kido-lora","loraScale":1.0}
```

## 환경 변수

| 변수 | 기본값 | 설명 |
|---|---|---|
| `SDXL_LORA_DIR` | `checkpoints/kido-lora` | LoRA 가중치 폴더 (없으면 `/workspace/sdxl-lora/outputs/kido-lora` 폴백) |
| `SDXL_LORA_SCALE` | `1.0` | LoRA fuse 가중치 |
| `SDXL_WARMUP` | `1` | 시작 시 워밍업 생성 여부 |

CUDA GPU가 없으면 모델 로드에 실패하고 `/healthy` 가 사유를 알려줍니다.
이 경우에도 메인 서버의 그림일기는 Gemini 이미지 모델로 폴백해 계속 동작합니다.
