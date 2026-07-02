# InMyBag

숭실대학교 컴퓨터학부 소프트웨어공모전 2026 프로젝트입니다.

사용자가 사진을 찍으면 Grounding DINO로 이미지 속 객체 후보 bbox를 찾고, 선택한 bbox를 SAM2에 전달해 객체를 분리합니다. 분리된 객체는 앱의 Bag Stack 화면에 쌓이며, 친구들의 Bag을 보는 Feed 기능도 함께 제공합니다.

## 기술 스택

- 앱: Expo SDK 54, React Native, Expo Router, TypeScript
- 백엔드/DB: Supabase
- AI 서버: FastAPI, SAM2, Grounding DINO, Gemini API
- 주요 색상: `#0145F2`, `#EDF1F5`

## 준비물

- Node.js 20.19 이상
- Python 3.10 이상
- Expo Go 앱 또는 iOS Simulator / Android Emulator
- Gemini API Key
- SAM2 checkpoint 파일

## 앱 실행

```bash
npm install
npx expo start
```

Expo 개발 서버가 켜지면 다음 중 하나로 실행합니다.

- iPhone/Android 실기기: Expo Go로 QR 코드 스캔
- iOS Simulator: 터미널에서 `i`
- Android Emulator: 터미널에서 `a`
- Web: 터미널에서 `w`

## AI 서버 설치

처음 한 번만 설치하면 됩니다.

```bash
python3 -m venv sam2-server/venv
source sam2-server/venv/bin/activate

python -m pip install --upgrade pip
python -m pip install -r requirements.txt
SAM2_BUILD_CUDA=0 python -m pip install -e sam2-server/sam2
```

SAM2 checkpoint는 GitHub에 올리지 않습니다. 각자 아래 폴더에 직접 넣어야 합니다.

```bash
sam2-server/sam2/checkpoints/sam2.1_hiera_large.pt
```

checkpoint 다운로드 스크립트가 있는 경우:

```bash
cd sam2-server/sam2/checkpoints
bash download_ckpts.sh
```

## AI 서버 실행

새 터미널에서 실행합니다.

```bash
cd "/본인경로/InMyBag/sam2-server/sam2"
source ../venv/bin/activate

export GEMINI_API_KEY="본인_Gemini_API_Key"
python -m uvicorn sam2_image_server:app --host 0.0.0.0 --port 8000
```

서버가 정상 실행되는지 확인:

```bash
curl http://localhost:8000/healthy
```

휴대폰에서 테스트할 때는 노트북과 휴대폰이 같은 Wi-Fi에 있어야 합니다. 연결이 안 되면 Expo 실행 전에 AI 서버 주소를 직접 지정합니다.

```bash
export EXPO_PUBLIC_SAM2_SERVER_URL="http://노트북_IP주소:8000"
npx expo start
```

Mac에서 노트북 IP 확인:

```bash
ipconfig getifaddr en0
```

## 지도 API

지도 기능을 사용할 때는 Google Maps API Key가 필요합니다.

```bash
export GOOGLE_MAPS_API_KEY="본인_Google_Maps_API_Key"
npx expo start
```

## 자주 나는 문제

### `./venv/bin/python: no such file or directory`

가상환경 경로가 다르거나 아직 생성되지 않은 상태입니다.

```bash
python3 -m venv sam2-server/venv
source sam2-server/venv/bin/activate
```

### `Grounding DINO detection failed`

주로 Gemini API Key가 없거나, Gemini API가 일시적으로 503 응답을 준 경우입니다. API Key를 확인하고 잠시 후 다시 시도합니다.

### 휴대폰에서 AI 서버 연결 실패

`localhost`는 휴대폰 자기 자신을 의미합니다. 휴대폰 테스트에서는 노트북 IP를 사용해야 합니다.

```bash
export EXPO_PUBLIC_SAM2_SERVER_URL="http://노트북_IP주소:8000"
```

## Git 주의사항

아래 파일은 GitHub에 올리지 않습니다.

- `node_modules/`
- `sam2-server/venv/`
- `sam2-server/sam2/venv/`
- `sam2-server/sam2/checkpoints/`
- `.env`
- `*.pt`, `*.pth`, `*.onnx`
- `__pycache__/`, `*.pyc`

이미 Git에 들어간 대용량 파일이나 캐시 파일은 `.gitignore`만으로 빠지지 않습니다. 그런 경우에는 팀원과 확인한 뒤 `git rm --cached`로 추적만 제거해야 합니다.
