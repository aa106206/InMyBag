# InMyBag / SnapBag

숭실대학교 컴퓨터학부 소프트웨어공모전 2026 프로젝트입니다.

사용자가 사진을 찍으면 AI 서버가 이미지 속 물건 후보를 찾고, 사용자가 선택한 물건을 SAM2로 분리합니다. 분리된 물건은 앱의 가방 화면에 쌓이고, 친구들의 가방과 랭킹도 확인할 수 있습니다. 하루의 물건들로 그림일기(이야기: Gemini, 일러스트: 직접 파인튜닝한 SDXL KIDO LoRA)도 만들 수 있습니다.

## 1. 프로젝트 구성

코드는 크게 **frontend(Expo 앱)** 와 **ai-server(AI 서버)** 두 부분으로 나뉩니다.

```text
InMyBag/
├─ frontend/                       Expo(React Native) 앱 — 노트북에서 실행
│  ├─ app/                         Expo Router 화면
│  ├─ components/                  공통 UI 컴포넌트
│  ├─ constants/                   색상/테마
│  ├─ hooks/                       인증 등 공통 훅
│  ├─ services/                    Supabase, AI 서버 API 호출 코드
│  ├─ assets/                      이미지, 로고
│  ├─ supabase/                    DB schema / 마이그레이션 SQL
│  ├─ package.json                 앱 의존성
│  └─ .env                         앱 환경변수 (.env.example 참고)
│
├─ ai-server/                      AI 서버 — RunPod(GPU) 또는 로컬에서 실행
│  ├─ start-ai-servers.sh          ★ 서버 일괄 시작 (이것만 실행하면 됨)
│  ├─ stop-ai-servers.sh           서버 일괄 중지
│  ├─ smoke-test.sh                데모 전 전체 엔드포인트 점검
│  ├─ sam2-server/
│  │  └─ sam2/
│  │     ├─ sam2_image_server.py   메인 AI 서버 (포트 8000)
│  │     ├─ story_generation.py    그림일기 생성 (이야기: Gemini / 일러스트: SDXL)
│  │     ├─ checkpoints/           SAM2 모델 파일 위치 (Drive로 공유)
│  │     └─ sam2/                  SAM2 패키지 코드
│  ├─ sdxl-server/                 SDXL KIDO LoRA 일러스트 서버 (포트 8010, 별도 venv)
│  │  ├─ sdxl_server.py
│  │  └─ checkpoints/kido-lora/    파인튜닝한 LoRA 가중치 (Drive로 공유)
│  ├─ grounding-dino/              Gemini + Grounding DINO bbox 탐지 코드
│  ├─ requirements.txt             메인 AI 서버 의존성
│  └─ .env                         AI 서버 환경변수 (GEMINI_API_KEY)
│
└─ README.md
```

실행 흐름:

```text
노트북 (frontend, Expo 앱)
   │  EXPO_PUBLIC_SAM2_SERVER_URL=https://<RunPod 포드 ID>-8000.proxy.runpod.net
   ▼
RunPod 포트 8000 — 메인 AI 서버 (/detect, /segment, /story/generate)
   └─ 내부 8010 — SDXL KIDO LoRA 서버 (일러스트. 죽어 있으면 Gemini로 자동 폴백)
```

## 2. GitHub에 올리지 않는 파일

아래 파일은 용량이 크거나 로컬 환경마다 달라서 GitHub에 올리지 않습니다.

```text
frontend/node_modules/
ai-server/.venv/  (모든 venv)
ai-server/logs/
ai-server/sam2-server/sam2/checkpoints/*.pt
ai-server/sdxl-server/checkpoints/kido-lora/*.safetensors
.env (모든 위치)
__pycache__/, *.pyc
```

모델 파일은 Google Drive로 따로 공유합니다. 받은 파일을 아래 위치에 넣어주세요.

```text
ai-server/sam2-server/sam2/checkpoints/
├─ download_ckpts.sh
├─ sam2.1_hiera_small.pt      ← 기본 사용
└─ sam2.1_hiera_large.pt      ← SAM2_MODEL=large 로 선택 가능

ai-server/sdxl-server/checkpoints/kido-lora/
└─ pytorch_lora_weights.safetensors
```

## 3. 준비물

- (frontend) Node.js 20.19 이상, Expo Go 앱 또는 시뮬레이터
- (ai-server) Python 3.10 이상, Gemini API Key
- (ai-server, 일러스트) CUDA GPU — 없으면 SDXL은 건너뛰고 Gemini 폴백으로 동작
- Google Maps API Key
- Google Drive로 공유받은 모델 파일들

## 4. AI 서버 설치 (RunPod 또는 로컬)

### 4-1. 메인 AI 서버 venv

```bash
cd InMyBag
python3 -m venv ai-server/.venv
source ai-server/.venv/bin/activate
python -m pip install --upgrade pip wheel
python -m pip install -r ai-server/requirements.txt
SAM2_BUILD_CUDA=0 python -m pip install -e ai-server/sam2-server/sam2
```

### 4-2. SDXL 서버 venv (선택 — 그림일기 일러스트용, GPU 필요)

torch 버전이 메인 서버와 달라 **반드시 별도 venv**를 씁니다.
자세한 내용은 `ai-server/sdxl-server/README.md` 참고.
venv가 없으면 시작 스크립트가 SDXL만 건너뛰고, 일러스트는 Gemini로 폴백합니다.

### 4-3. 환경변수

```bash
cp ai-server/.env.example ai-server/.env
# GEMINI_API_KEY=본인_키  한 줄만 채우면 됩니다 (서버가 자동으로 읽음)
```

## 5. AI 서버 실행

```bash
bash ai-server/start-ai-servers.sh
```

메인 서버(8000)와 SDXL 서버(8010)를 모두 띄우고, 모델 로드/워밍업까지 기다립니다.

점검과 중지:

```bash
bash ai-server/smoke-test.sh      # 모든 엔드포인트 실호출 점검
bash ai-server/stop-ai-servers.sh # 일괄 중지
tail -50 ai-server/logs/ai-main.log   # 메인 서버 로그
tail -50 ai-server/logs/ai-sdxl.log   # SDXL 서버 로그
```

수동 실행(메인 서버만):

```bash
cd ai-server/sam2-server/sam2
../../.venv/bin/python -m uvicorn sam2_image_server:app --host 0.0.0.0 --port 8000
```

## 6. 앱(frontend) 실행

### 6-1. 설치

```bash
cd frontend
npm install
```

### 6-2. 환경변수

```bash
cp .env.example .env
```

`frontend/.env` 에서 AI 서버 주소를 설정합니다.

- RunPod 사용 시: `EXPO_PUBLIC_SAM2_SERVER_URL=https://<포드 ID>-8000.proxy.runpod.net`
- 노트북에서 서버까지 돌릴 때: `EXPO_PUBLIC_SAM2_SERVER_URL=http://노트북IP:8000`
  (Mac에서 IP 확인: `ipconfig getifaddr en0`)

Supabase 값을 직접 바꾸고 싶으면 `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY` 도 설정할 수 있습니다.

### 6-3. 실행

```bash
cd frontend
npx expo start
```

- iPhone/Android 실기기: Expo Go로 QR 코드 스캔 (노트북과 같은 Wi-Fi 필요)
- iOS Simulator: `i` / Android Emulator: `a` / Web: `w`

## 7. 데모데이 순서 (RunPod)

1. RunPod 포드 시작 (HTTP 포트 8000 노출 확인)
2. `ai-server/.env` 의 `GEMINI_API_KEY` 확인
3. `bash ai-server/start-ai-servers.sh`
4. `bash ai-server/smoke-test.sh` — 전부 ✅ 이면 준비 끝
5. 노트북 `frontend/.env` 에 RunPod 주소 설정 후 `npx expo start`

## 8. 앱 사용 흐름

```text
로그인 → 내 가방 → 사진 찍기 → 객체 후보 탐지(Gemini + Grounding DINO)
→ 물건 선택 → SAM2로 객체 분리 → 가방에 추가
→ (이야기 탭) 오늘의 물건으로 그림일기 생성 (이야기: Gemini / 일러스트: SDXL KIDO LoRA)
```

## 9. 자주 나는 문제

### 분리한 객체가 Supabase Storage에 저장되지 않음

Supabase Dashboard의 SQL Editor에서 아래 마이그레이션 파일 전체를 실행합니다.

```text
frontend/supabase/migrations/202607170001_bag_item_persistence.sql
```

적용 후 Expo 개발 서버를 캐시 초기화해 다시 실행합니다: `npx expo start --clear`

### `No such file or directory: sam2.1_hiera_small.pt`

SAM2 checkpoint가 없는 상태입니다. Drive에서 받은 파일을
`ai-server/sam2-server/sam2/checkpoints/` 에 넣어주세요.

### `ModuleNotFoundError: No module named 'sam2'`

SAM2 로컬 패키지를 설치하지 않은 상태입니다.

```bash
source ai-server/.venv/bin/activate
SAM2_BUILD_CUDA=0 python -m pip install -e ai-server/sam2-server/sam2
```

### `Grounding DINO detection failed`

- `ai-server/.env` 의 `GEMINI_API_KEY` 미설정/오타
- Gemini API 일시 오류(503) 또는 네트워크 문제

### 그림일기 일러스트가 Gemini로 나옴 (SDXL이 아님)

SDXL 서버(8010)가 죽어 있으면 자동 폴백된 것입니다.

```bash
curl http://127.0.0.1:8010/healthy
tail -50 ai-server/logs/ai-sdxl.log
```

### 휴대폰에서 AI 서버 연결 실패

휴대폰에서 `localhost` 는 휴대폰 자신입니다. `frontend/.env` 에
노트북 IP 또는 RunPod 주소를 넣고 `npx expo start` 를 다시 실행하세요.

## 10. GitHub에 올리기 전 확인

```bash
git status
```

`node_modules/`, `venv/`, `checkpoints/*.pt`, `*.safetensors`, `.env`, `__pycache__/` 가
커밋 목록에 있으면 안 됩니다. 큰 파일 확인:

```bash
find . -type f -size +50M -not -path "./.git/*" -not -path "*/node_modules/*" -not -path "*/.venv/*"
```
