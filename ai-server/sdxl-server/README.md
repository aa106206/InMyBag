# SDXL LoRA 이미지 생성 서버

그림일기(`POST /story/generate`)의 일러스트를 그리는 서버입니다.
직접 파인튜닝한 SDXL LoRA 두 개를 섞어 씁니다.

- **kidsketch** (트리거 `kidsketch`) — AI Hub HTP 아동 연필화 데이터로 학습. **그림체의 주축**.
- **kido** (트리거 `kidodrawing`) — KIDO 아동 컬러 그림 데이터로 학습. 채색을 보태는 **보조** (기본 0.4 비율).

kidsketch 원본이 흑백 연필화이므로, 색은 kido 어댑터와 프롬프트('colored pencils')로 입힙니다.

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
- `checkpoints/kidsketch-lora/pytorch_lora_weights.safetensors` — kidsketch LoRA 가중치
- `checkpoints/kido-lora/pytorch_lora_weights.safetensors` — kido LoRA 가중치 (약 89MB)
  - git에는 올라가지 않습니다. SAM2 체크포인트처럼 Google Drive로 공유받아 넣어주세요.
  - 학습 머신에서는 `/workspace/sdxl-lora/outputs/<이름>` 폴백 경로에서 자동으로 찾습니다.
  - 한쪽 가중치만 있으면 그 어댑터만으로 동작합니다 (경고 로그 후 계속).

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
| `SDXL_SKETCH_LORA_DIR` | `checkpoints/kidsketch-lora` | kidsketch LoRA 폴더 |
| `SDXL_SKETCH_LORA_SCALE` | `1.0` | kidsketch(AI Hub 연필화 그림체) 비중 |
| `SDXL_LORA_DIR` | `checkpoints/kido-lora` | kido LoRA 폴더 |
| `SDXL_KIDO_LORA_SCALE` | `0.4` | kido(KIDO 컬러) 비중 — 올리면 색이 진해지고 KIDO 그림체가 강해짐 |
| `SDXL_WARMUP` | `1` | 시작 시 워밍업 생성 여부 |

CUDA GPU가 없으면 모델 로드에 실패하고 `/healthy` 가 사유를 알려줍니다.
이 경우에도 메인 서버의 그림일기는 Gemini 이미지 모델로 폴백해 계속 동작합니다.
