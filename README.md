# SnapBag

숭실대학교 컴퓨터학부 소프트웨어공모전 2026 프로젝트

SnapBag은 하루 동안 마주친 물건을 사진으로 모으고, 가방처럼 쌓아 공유하는 SNS입니다.  
기존 SNS가 사진 전체의 구도, 인물, 배경을 중심으로 기록한다면 SnapBag은 사진 속 "객체 하나"에 집중합니다. 사용자는 예쁜 사진을 찍어야 한다는 부담보다, 오늘 발견한 사물들을 수집하듯 담아가는 재미를 경험할 수 있습니다.

<p align="center">
  <img src="assets/readme/snapbag-positioning.png" alt="SnapBag 서비스 방향 비교" width="900" />
</p>

## 프로젝트 소개

SnapBag은 카메라로 찍은 사진에서 AI가 물건을 분리하고, 분리된 객체를 사용자의 가방 안에 떨어뜨려 쌓는 앱입니다.  
가방 안의 물건들은 물리 엔진을 통해 서로 부딪히고, 휴대폰을 기울이거나 흔들면 실제 물건처럼 움직입니다.

친구의 가방을 구경하거나, 다른 사용자의 가방을 둘러보고, 하루의 물건들을 바탕으로 AI 그림일기를 생성하는 기능도 제공합니다.

## 핵심 차별점

| 기존 SNS | SnapBag |
| --- | --- |
| 사진 전체의 분위기, 구도, 인물을 중심으로 공유 | 사진 속 물건 하나하나를 중심으로 기록 |
| 예쁜 사진을 찍어야 한다는 부담이 큼 | 일상에서 발견한 물건을 가볍게 담을 수 있음 |
| 피드에 게시물이 시간순으로 쌓임 | 내 가방 안에 물건이 물리적으로 쌓임 |
| 하루를 텍스트나 사진첩 형태로 회고 | 오늘의 물건을 바탕으로 AI 그림일기 생성 |

## 주요 기능

### 1. 내 가방

- 사진 촬영 후 AI 서버가 사진 속 객체를 탐지합니다.
- 선택한 물건을 SAM2로 분리해 배경이 제거된 객체 이미지로 저장합니다.
- 저장된 물건은 내 가방 안에 떨어지고, Matter.js 물리 엔진을 통해 다른 물건과 상호작용합니다.
- 휴대폰의 기울기와 흔들림에 반응해 물건들이 움직입니다.
- 물건을 길게 누르면 상세 카드에서 제목, 기록, 촬영 위치를 확인할 수 있습니다.

### 2. 피드

- 친구들의 프로필을 가로 스크롤로 확인할 수 있습니다.
- 친구를 선택하면 해당 친구의 가방을 볼 수 있습니다.
- 친구의 물건을 길게 누르면 물건 상세 정보 카드를 확인할 수 있습니다.

### 3. 둘러보기

- 친구가 아니더라도 공개된 사용자들의 가방을 탐색할 수 있습니다.
- 카드형 캐러셀 UI로 여러 사용자의 가방을 넘겨볼 수 있습니다.

### 4. 이야기

- 오늘 찍은 물건들을 기반으로 하루의 이야기를 생성합니다.
- 사용자가 작성한 짧은 하루 기록과 가방 속 물건을 함께 활용합니다.
- 생성된 이야기는 그림일기 형태로 확인할 수 있습니다.

### 5. 설정

- Supabase Authentication과 연동된 로그인, 회원가입, 이메일 변경, 비밀번호 변경을 제공합니다.
- 프로필 사진을 촬영하거나 갤러리에서 선택해 변경할 수 있습니다.
- 친구 관리, 이용 안내, 문의하기 기능을 제공합니다.

## 기술 스택

### App

- Expo SDK 54
- React Native
- TypeScript
- Expo Router
- Matter.js
- Supabase JS SDK
- React Native Maps

### Backend / Storage

- Supabase Authentication
- Supabase Database
- Supabase Storage
- Supabase Row Level Security

### AI Server

- FastAPI
- Uvicorn
- Gemini API
- Grounding DINO
- SAM2

## 전체 흐름

```text
사용자 로그인
→ 내 가방에서 사진 촬영
→ AI 서버로 이미지 전송
→ Gemini + Grounding DINO로 객체 후보 탐지
→ 사용자가 물건 선택
→ SAM2로 객체 분리
→ Supabase Storage에 이미지 저장
→ Supabase Database에 메타데이터 저장
→ 내 가방 화면에 물건 표시
```

## 프로젝트 구조

```text
InMyBag/
├─ app/                         Expo Router 화면
├─ assets/                      이미지, 로고, README 이미지
├─ components/                  공통 UI 컴포넌트
├─ constants/                   색상/테마
├─ grounding dino/              Gemini + Grounding DINO 탐지 코드
├─ hooks/                       인증, 테마 등 공통 훅
├─ services/                    Supabase, AI 서버 API 호출 코드
├─ supabase/                    DB migration SQL
├─ sam2-server/                 FastAPI + SAM2 서버
│  └─ sam2/
│     ├─ sam2_image_server.py
│     ├─ checkpoints/
│     └─ sam2/
├─ package.json
├─ requirements.txt
└─ README.md
```

## 시작하기

### 준비물

- Node.js 20.19 이상
- Python 3.10 이상 권장
- Expo Go 또는 Expo Dev Client
- Gemini API Key
- Google Maps API Key
- Supabase 프로젝트
- SAM2 checkpoint 파일

Expo SDK 54는 Node.js 20.19.x 이상을 권장합니다.

### 앱 의존성 설치

```bash
npm install
```

### Python 가상환경 생성

macOS / Linux:

```bash
python3 -m venv sam2-server/venv
source sam2-server/venv/bin/activate
```

Windows PowerShell:

```powershell
py -3.11 -m venv sam2-server/venv
.\sam2-server\venv\Scripts\Activate.ps1
```

### AI 서버 의존성 설치

```bash
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
```

### SAM2 로컬 패키지 설치

macOS / Linux:

```bash
SAM2_BUILD_CUDA=0 python -m pip install -e sam2-server/sam2
```

Windows PowerShell:

```powershell
$env:SAM2_BUILD_CUDA="0"
python -m pip install -e sam2-server/sam2
```

## 환경변수

실제 API Key는 GitHub에 올리지 않습니다.  
로컬에서는 `.env.local` 또는 터미널 환경변수로 관리합니다.

```bash
GEMINI_API_KEY="본인_Gemini_API_Key"
GOOGLE_MAPS_API_KEY="본인_Google_Maps_API_Key"
EXPO_PUBLIC_SUPABASE_URL="본인_Supabase_URL"
EXPO_PUBLIC_SUPABASE_ANON_KEY="본인_Supabase_Anon_Key"
EXPO_PUBLIC_SAM2_SERVER_URL="http://노트북_IP주소:8000"
```

실기기에서 테스트할 때 `localhost`는 노트북이 아니라 휴대폰 자신을 의미합니다.  
휴대폰과 노트북을 같은 Wi-Fi에 연결한 뒤, 노트북의 IP 주소를 `EXPO_PUBLIC_SAM2_SERVER_URL`에 넣어야 합니다.

## AI 서버 실행

macOS / Linux:

```bash
cd "/본인경로/InMyBag"
source sam2-server/venv/bin/activate
export GEMINI_API_KEY="본인_Gemini_API_Key"

cd sam2-server/sam2
python -m uvicorn sam2_image_server:app --host 0.0.0.0 --port 8000
```

Windows PowerShell:

```powershell
cd C:\dev\InMyBag
.\sam2-server\venv\Scripts\Activate.ps1
$env:GEMINI_API_KEY="본인_Gemini_API_Key"

cd .\sam2-server\sam2
python -m uvicorn sam2_image_server:app --host 0.0.0.0 --port 8000
```

서버 상태 확인:

```bash
curl http://localhost:8000/healthy
```

## 앱 실행

AI 서버를 켜둔 상태에서 새 터미널을 열고 실행합니다.

```bash
npx expo start
```

실행 방법:

- iPhone / Android 실기기: Expo Go 또는 Dev Client로 QR 코드 스캔
- iOS Simulator: 터미널에서 `i`
- Android Emulator: 터미널에서 `a`
- Web: 터미널에서 `w`

## Supabase 설정

SnapBag은 Supabase를 다음 용도로 사용합니다.

- Authentication: 회원가입, 로그인, 이메일 변경, 비밀번호 변경
- Database: 가방 아이템, 친구 관계, 문의 내역, 공개 범위 등 메타데이터 저장
- Storage: 분리된 물건 이미지, 프로필 이미지 저장
- RLS: 사용자별 데이터 접근 제어

필요한 SQL은 `supabase/migrations/` 폴더에 있습니다.

대표 migration:

```text
202607170001_bag_item_persistence.sql
202607200001_bag_item_location_columns.sql
202607200003_explore_public_bags.sql
202607210001_support_inquiries.sql
202607280001_remove_friend.sql
202607280002_profile_privacy.sql
```

Supabase Dashboard의 SQL Editor에서 필요한 migration을 실행하면 됩니다.

## GitHub에 올리지 않는 파일

아래 파일은 용량이 크거나 로컬 환경마다 달라 GitHub에 올리지 않습니다.

```text
node_modules/
sam2-server/venv/
sam2-server/sam2/venv/
sam2-server/sam2/checkpoints/*.pt
.env
.env.local
__pycache__/
*.pyc
*.pt
*.pth
*.onnx
*.safetensors
*.bin
*.ckpt
```

SAM2 checkpoint는 GitHub에 올리지 않고 별도로 공유합니다.

## 자주 나는 문제

### 휴대폰에서 AI 서버 연결 실패

휴대폰에서 `localhost`는 노트북이 아니라 휴대폰 자신입니다.  
노트북 IP 주소를 확인한 뒤 앱 실행 전에 지정합니다.

```bash
EXPO_PUBLIC_SAM2_SERVER_URL="http://노트북_IP주소:8000"
```

### `Grounding DINO detection failed`

주요 원인:

- `GEMINI_API_KEY`가 설정되지 않음
- Gemini API Key가 잘못됨
- Gemini API 할당량 또는 네트워크 문제
- AI 서버가 꺼져 있음

### `No such file or directory: sam2.1_hiera_large.pt`

SAM2 checkpoint가 없는 상태입니다.  
공유받은 checkpoint 파일을 아래 위치에 넣어주세요.

```text
sam2-server/sam2/checkpoints/
```

### Supabase Storage에 이미지가 저장되지 않음

`bag-items` Storage bucket과 RLS 정책이 필요합니다.  
`supabase/migrations/202607170001_bag_item_persistence.sql`을 Supabase SQL Editor에서 실행한 뒤 앱을 다시 실행합니다.

```bash
npx expo start --clear
```

## 팀 협업 방식

각 팀원은 본인 브랜치에서 작업한 뒤 Pull Request로 main에 반영합니다.

```bash
git switch feature/본인이름
git pull origin main
git add .
git commit -m "작업 내용"
git push origin feature/본인이름
```

충돌이 생기면 main을 직접 덮어쓰지 않고, 충돌 파일을 확인한 뒤 필요한 부분만 정리해서 커밋합니다.

## 프로젝트 의의

SnapBag은 사진을 "잘 찍는 것"보다 "오늘 무엇을 만났는지"에 집중합니다.  
사용자는 하루 동안 본 물건을 수집하고, 가방 속에 쌓인 물건을 통해 자신의 일상을 독특한 방식으로 표현할 수 있습니다.

사진 전체가 아니라 객체 하나를 중심으로 기록한다는 점에서, SnapBag은 기존 SNS와 다른 가볍고 수집적인 공유 경험을 제안합니다.
