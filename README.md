# InMyBag / SnapBag

숭실대학교 컴퓨터학부 소프트웨어공모전 2026 프로젝트입니다.

사용자가 사진을 찍으면 AI 서버가 이미지 속 물건 후보를 찾고, 사용자가 선택한 물건을 SAM2로 분리합니다. 분리된 물건은 앱의 가방 화면에 쌓이고, 친구들의 가방과 랭킹도 확인할 수 있습니다.

## 1. 프로젝트 구성

```text
InMyBag/
├─ app/                         Expo Router 화면
├─ assets/                      이미지, 로고, 더미 객체 이미지
├─ components/                  공통 UI 컴포넌트
├─ constants/                   색상/테마
├─ grounding dino/              Gemini + Grounding DINO bbox 탐지 코드
├─ services/                    Supabase, AI 서버 API 호출 코드
├─ supabase/                    DB schema
├─ sam2-server/                 FastAPI + SAM2 서버
│  └─ sam2/
│     ├─ sam2_image_server.py   AI 서버 실행 파일
│     ├─ checkpoints/           SAM2 모델 파일 위치
│     └─ sam2/                  SAM2 패키지 코드
├─ package.json                 Expo 앱 의존성
├─ requirements.txt             Python AI 서버 의존성
└─ README.md
```

## 2. GitHub에 올리지 않는 파일

아래 파일은 용량이 크거나 로컬 환경마다 달라서 GitHub에 올리지 않습니다.

```text
node_modules/
sam2-server/venv/
sam2-server/sam2/venv/
sam2-server/sam2/checkpoints/*.pt
.env
__pycache__/
*.pyc
*.pt
*.pth
*.onnx
*.safetensors
*.bin
*.ckpt
```

SAM2 checkpoint는 Google Drive로 따로 공유합니다.

Drive에서 받은 파일은 아래 위치에 넣어주세요.

```text
InMyBag/sam2-server/sam2/checkpoints/
```

최종 구조는 이렇게 되어야 합니다.

```text
sam2-server/sam2/checkpoints/
├─ download_ckpts.sh
├─ sam2.1_hiera_base_plus.pt
├─ sam2.1_hiera_large.pt
├─ sam2.1_hiera_small.pt
└─ sam2.1_hiera_tiny.pt
```

현재 서버는 기본적으로 `sam2.1_hiera_large.pt`를 사용합니다.

## 3. 준비물

- Node.js 20.19 이상
- Python 3.10 이상
- Expo Go 앱 또는 iOS Simulator / Android Emulator
- Gemini API Key
- Google Maps API Key
- Google Drive로 공유받은 `checkpoints` 폴더

Expo SDK 54는 Node.js `20.19.x` 이상을 권장합니다.

## 4. 처음 설치하기

터미널을 열고 프로젝트 폴더로 이동합니다.

```bash
cd "/본인경로/InMyBag"
```

### 4-1. 앱 의존성 설치

```bash
npm install
```

### 4-2. Python 가상환경 생성

```bash
python3 -m venv sam2-server/venv
source sam2-server/venv/bin/activate
```

터미널 앞에 `(venv)`가 보이면 성공입니다.

### 4-3. AI 서버 의존성 설치

```bash
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
```

### 4-4. SAM2 로컬 패키지 설치

Mac에서는 CUDA를 쓰지 않으므로 아래처럼 설치합니다.

```bash
SAM2_BUILD_CUDA=0 python -m pip install -e sam2-server/sam2
```

설치 중 CUDA 관련 warning이 나와도 Mac 로컬 테스트에서는 보통 괜찮습니다.

## 5. 환경변수 설정

실제 API Key는 GitHub에 올리지 않습니다.

### 5-1. AI 서버용 Gemini Key

AI 서버를 실행하는 터미널에서 입력합니다.

```bash
export GEMINI_API_KEY="본인_Gemini_API_Key"
```

그림일기는 기본적으로 이야기에 `gemini-2.5-flash`, 이미지에
`gemini-2.5-flash-image`를 사용합니다. 프로젝트에서 다른 Gemini 모델을 사용하려면
서버 실행 전에 아래 환경변수를 지정합니다.

```bash
export GEMINI_STORY_MODEL="gemini-2.5-flash"
export GEMINI_IMAGE_MODEL="gemini-2.5-flash-image"
```

이미지 모델 사용 권한과 할당량은 Gemini API 키가 속한 Google AI 프로젝트에서
활성화되어 있어야 합니다.

### 5-2. 앱용 환경변수

앱을 실행하는 터미널에서 입력합니다.

```bash
export GOOGLE_MAPS_API_KEY="본인_Google_Maps_API_Key"
```

Supabase 값을 직접 바꾸고 싶으면 아래도 설정할 수 있습니다.

```bash
export EXPO_PUBLIC_SUPABASE_URL="본인_Supabase_URL"
export EXPO_PUBLIC_SUPABASE_ANON_KEY="본인_Supabase_Anon_Key"
```

휴대폰에서 AI 서버 연결이 안 되면 노트북 IP를 직접 지정합니다.

```bash
export EXPO_PUBLIC_SAM2_SERVER_URL="http://노트북_IP주소:8000"
```

Mac에서 노트북 IP 확인:

```bash
ipconfig getifaddr en0
```

## 6. AI 서버 실행하기

터미널 1개를 열고 실행합니다.

```bash
cd "/본인경로/InMyBag"
source sam2-server/venv/bin/activate
export GEMINI_API_KEY="본인_Gemini_API_Key"

cd sam2-server/sam2
python -m uvicorn sam2_image_server:app --host 0.0.0.0 --port 8000
```

정상 실행 확인:

```bash
curl http://localhost:8000/healthy
```

정상이라면 JSON 응답이 나옵니다.

## 7. Expo 앱 실행하기

AI 서버는 켜둔 상태로 새 터미널을 엽니다.

```bash
cd "/본인경로/InMyBag"
npx expo start
```

실행 방법:

- iPhone/Android 실기기: Expo Go로 QR 코드 스캔
- iOS Simulator: 터미널에서 `i`
- Android Emulator: 터미널에서 `a`
- Web: 터미널에서 `w`

실기기로 테스트할 때는 노트북과 휴대폰이 같은 Wi-Fi에 있어야 합니다.

## 8. 앱 사용 흐름

```text
로그인
→ 내 가방
→ 사진 찍기
→ 객체 후보 탐지
→ 물건 선택하기
→ SAM2로 객체 분리
→ 가방에 추가
```

객체 후보 탐지에는 Gemini API와 Grounding DINO가 사용됩니다.

객체 분리에는 SAM2가 사용됩니다.

## 9. 자주 나는 문제

### 분리한 객체가 Supabase Storage에 저장되지 않음

Supabase Dashboard의 SQL Editor에서 아래 마이그레이션 파일 전체를 실행합니다.

```text
supabase/migrations/202607170001_bag_item_persistence.sql
```

적용하면 private `bag-items` Storage 버킷, 업로드/조회/삭제 RLS 정책,
`bag_items` 메타데이터 컬럼이 생성됩니다. 이후 Expo 개발 서버를 캐시 초기화해 다시 실행합니다.

```bash
npx expo start --clear
```

### `No such file or directory: sam2.1_hiera_large.pt`

SAM2 checkpoint가 없는 상태입니다.

Google Drive에서 받은 `checkpoints` 폴더를 아래 위치에 넣어주세요.

```text
InMyBag/sam2-server/sam2/checkpoints/
```

### `./venv/bin/python: no such file or directory`

가상환경을 만들지 않았거나 다른 경로에 만든 상태입니다.

```bash
cd "/본인경로/InMyBag"
python3 -m venv sam2-server/venv
source sam2-server/venv/bin/activate
```

### `Grounding DINO detection failed`

주요 원인:

- `GEMINI_API_KEY`를 설정하지 않음
- Gemini API Key가 잘못됨
- Gemini API가 일시적으로 503 응답을 줌
- 인터넷 연결 문제

확인:

```bash
echo $GEMINI_API_KEY
```

### 휴대폰에서 AI 서버 연결 실패

휴대폰에서 `localhost`는 노트북이 아니라 휴대폰 자신을 의미합니다.

노트북 IP를 확인한 뒤 Expo 실행 전에 지정하세요.

```bash
export EXPO_PUBLIC_SAM2_SERVER_URL="http://노트북_IP주소:8000"
npx expo start
```

### `ModuleNotFoundError: No module named 'sam2'`

SAM2 로컬 패키지를 설치하지 않은 상태입니다.

```bash
cd "/본인경로/InMyBag"
source sam2-server/venv/bin/activate
SAM2_BUILD_CUDA=0 python -m pip install -e sam2-server/sam2
```

## 10. GitHub에 올리기 전 확인

커밋 전에 꼭 확인합니다.

```bash
git status
```

아래 항목이 `Changes to be committed`에 있으면 안 됩니다.

```text
node_modules/
sam2-server/venv/
sam2-server/sam2/venv/
sam2-server/sam2/checkpoints/*.pt
.env
__pycache__/
*.pyc
```

큰 파일이 있는지 확인:

```bash
find . -type f -size +50M -not -path "./.git/*" -not -path "./node_modules/*"
```

`checkpoints/*.pt`, `venv`, `node_modules` 안 파일이 나오면 GitHub에 올리면 안 됩니다.

## 11. 현재 maintainer 주의사항

현재 `sam2-server/sam2` 폴더는 내부에 별도 `.git`이 있는 상태일 수 있습니다.

팀원들이 GitHub에서 AI 서버 코드까지 바로 받게 하려면, 최종 push 전에 `sam2-server/sam2`를 일반 폴더로 정리해야 합니다.

안전한 처리 순서:

```bash
mv sam2-server/sam2/.git /tmp/sam2-inner-git-backup
git rm --cached sam2-server/sam2
git add sam2-server/sam2
git status
```

이때 `checkpoints/*.pt`, `venv`, `__pycache__`가 커밋 목록에 보이면 멈추고 `.gitignore`를 먼저 확인해야 합니다.

문제 없으면 커밋합니다.

```bash
git add .gitignore README.md requirements.txt
git commit -m "프로젝트 실행 문서와 AI 서버 의존성 정리"
git push origin feature/dongjun
```
