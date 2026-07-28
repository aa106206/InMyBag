#!/usr/bin/env bash
# InMyBag AI 서버 일괄 시작.
#
#   bash ai-server/start-ai-servers.sh
#
# 뜨는 프로세스:
#   1) 메인 AI 서버 (0.0.0.0:8000) — SAM2 분리 + Grounding DINO 탐지 +
#      그림일기(이야기: Gemini, 일러스트: SDXL). venv: ai-server/.venv
#   2) SDXL KIDO LoRA 생성 서버 (127.0.0.1:8010) — 코드: ai-server/sdxl-server
#      venv: torch 버전이 달라 별도 (기본 /workspace/sdxl-lora/.venv,
#      SDXL_PYTHON 환경 변수로 변경 가능)
#
# SDXL venv 가 없으면 SDXL 서버는 건너뛰고 메인 서버만 뜹니다.
# 이 경우 그림일기 일러스트는 Gemini 이미지 모델로 자동 폴백됩니다.
#
# 로그: ai-server/logs/ai-main.log, ai-server/logs/ai-sdxl.log
# 중지: bash ai-server/stop-ai-servers.sh
# 점검: bash ai-server/smoke-test.sh

set -uo pipefail

AI_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_DIR="$AI_DIR/logs"
RUN_DIR="$LOG_DIR/run"
mkdir -p "$LOG_DIR" "$RUN_DIR"

MAIN_DIR="$AI_DIR/sam2-server/sam2"
MAIN_PY="$AI_DIR/.venv/bin/python"
SDXL_PY="${SDXL_PYTHON:-/workspace/sdxl-lora/.venv/bin/python}"

if [[ ! -x "$MAIN_PY" ]]; then
  echo "[실패] 메인 서버 venv 가 없습니다: $MAIN_PY"
  echo "       ai-server/ 에서 venv 를 만들고 requirements.txt 를 설치하세요. (README 4장 참고)"
  exit 1
fi

wait_healthy() { # url, seconds, name
  local url="$1" timeout="$2" name="$3" waited=0
  until curl -sf --max-time 3 "$url" > /dev/null 2>&1; do
    sleep 2
    waited=$((waited + 2))
    if [[ $waited -ge $timeout ]]; then
      echo "  [실패] $name 이 ${timeout}s 안에 준비되지 않았습니다. 로그를 확인하세요:"
      echo "         tail -50 $LOG_DIR/${name}.log"
      return 1
    fi
  done
  echo "  [OK] $name 준비 완료 (${waited}s)"
}

already_running() { # pidfile
  local pidfile="$1"
  [[ -f "$pidfile" ]] && kill -0 "$(cat "$pidfile")" 2>/dev/null
}

# ---------- 1. 메인 AI 서버 (8000) ----------
if already_running "$RUN_DIR/ai-main.pid"; then
  echo "[1/2] 메인 AI 서버는 이미 실행 중입니다 (pid $(cat "$RUN_DIR/ai-main.pid"))"
else
  echo "[1/2] 메인 AI 서버 시작 (SAM2 + DINO + 그림일기, 포트 8000)"
  (
    cd "$MAIN_DIR"
    # HF 캐시가 영구 볼륨에 준비돼 있으면 사용한다 (RunPod).
    [[ -d /workspace/hf-cache ]] && export HF_HOME="${HF_HOME:-/workspace/hf-cache}"
    export HF_HUB_ENABLE_HF_TRANSFER=1
    export TOKENIZERS_PARALLELISM=false
    export SAM2_MODEL="${SAM2_MODEL:-small}"
    nohup "$MAIN_PY" -m uvicorn sam2_image_server:app \
      --host 0.0.0.0 --port 8000 \
      >> "$LOG_DIR/ai-main.log" 2>&1 &
    echo $! > "$RUN_DIR/ai-main.pid"
  )
  # 워밍업(SAM2 + DINO 로드)이 끝나야 /healthy 가 응답합니다.
  wait_healthy http://127.0.0.1:8000/healthy 180 ai-main || exit 1
fi

# ---------- 2. SDXL KIDO LoRA 생성 서버 (8010) ----------
if already_running "$RUN_DIR/ai-sdxl.pid"; then
  echo "[2/2] SDXL 서버는 이미 실행 중입니다 (pid $(cat "$RUN_DIR/ai-sdxl.pid"))"
elif [[ ! -x "$SDXL_PY" ]]; then
  echo "[2/2] SDXL venv 가 없어 SDXL 서버를 건너뜁니다: $SDXL_PY"
  echo "      (그림일기 일러스트는 Gemini 이미지 모델로 자동 폴백됩니다.)"
  echo "      venv 준비 방법: ai-server/sdxl-server/requirements-sdxl.txt 참고,"
  echo "      다른 경로를 쓰려면 SDXL_PYTHON=/경로/venv/bin/python 으로 지정하세요."
else
  echo "[2/2] SDXL KIDO LoRA 서버 시작 (포트 8010)"
  (
    [[ -f /workspace/sdxl-lora/env.sh ]] && source /workspace/sdxl-lora/env.sh
    nohup "$SDXL_PY" -m uvicorn sdxl_server:app \
      --app-dir "$AI_DIR/sdxl-server" \
      --host 127.0.0.1 --port 8010 \
      >> "$LOG_DIR/ai-sdxl.log" 2>&1 &
    echo $! > "$RUN_DIR/ai-sdxl.pid"
  )
  # SDXL 로드 + 워밍업 생성까지 기다립니다.
  wait_healthy http://127.0.0.1:8010/healthy 300 ai-sdxl || exit 1
fi

# ---------- 상태 요약 ----------
echo
echo "=== 준비 상태 ==="
echo "메인 서버:  $(curl -sf --max-time 5 http://127.0.0.1:8000/healthy || echo '응답 없음')"
echo "SDXL 프록시: $(curl -sf --max-time 10 http://127.0.0.1:8000/sdxl/healthy || echo '응답 없음 (SDXL 미기동 시 정상)')"

if ! grep -qE '^GEMINI_API_KEY=.+' "$AI_DIR/.env" 2>/dev/null; then
  echo
  echo "⚠️  GEMINI_API_KEY 가 비어 있습니다. /detect 와 /story/generate 가 동작하지 않습니다."
  echo "   $AI_DIR/.env 에 키를 넣고 서버를 재시작하세요:"
  echo "   bash $AI_DIR/stop-ai-servers.sh && bash $AI_DIR/start-ai-servers.sh"
fi

echo
echo "노트북 앱 설정 (frontend/.env):"
echo "  EXPO_PUBLIC_SAM2_SERVER_URL=https://<RunPod 포드 ID>-8000.proxy.runpod.net"
