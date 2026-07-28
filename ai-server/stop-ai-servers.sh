#!/usr/bin/env bash
# InMyBag AI 서버 일괄 중지. (학습 tmux 세션 등 다른 프로세스는 건드리지 않습니다)
set -uo pipefail

AI_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RUN_DIR="$AI_DIR/logs/run"

stop_one() { # pidfile, name
  local pidfile="$1" name="$2"
  if [[ -f "$pidfile" ]] && kill -0 "$(cat "$pidfile")" 2>/dev/null; then
    kill "$(cat "$pidfile")" 2>/dev/null
    echo "[중지] $name (pid $(cat "$pidfile"))"
  else
    echo "[없음] $name 은 실행 중이 아닙니다."
  fi
  rm -f "$pidfile"
}

stop_one "$RUN_DIR/ai-main.pid" "메인 AI 서버(8000)"
stop_one "$RUN_DIR/ai-sdxl.pid" "SDXL 서버(8010)"

# PID 파일이 유실된 경우를 대비한 뒷정리 (해당 포트의 uvicorn 만 정확히 종료)
pkill -f "uvicorn sam2_image_server:app.*--port 8000" 2>/dev/null && echo "[정리] 8000 잔여 프로세스 종료"
pkill -f "uvicorn sdxl_server:app.*--port 8010" 2>/dev/null && echo "[정리] 8010 잔여 프로세스 종료"

# 프로세스가 실제로 죽고 포트가 비워질 때까지 기다립니다.
# (kill 직후 바로 start 하면, 죽어가는 옛 서버가 헬스체크에 응답해
#  "준비 완료 (0s)" 로 착각하는 레이스가 생깁니다.)
wait_port_free() { # port
  local port="$1" waited=0
  while ss -tln 2>/dev/null | grep -q ":$port "; do
    sleep 1
    waited=$((waited + 1))
    if [[ $waited -ge 15 ]]; then
      echo "[강제] 포트 $port 프로세스가 15초 안에 안 죽어 SIGKILL 합니다."
      pkill -9 -f "uvicorn sam2_image_server:app.*--port $port" 2>/dev/null
      pkill -9 -f "uvicorn sdxl_server:app.*--port $port" 2>/dev/null
      sleep 2
      break
    fi
  done
}
wait_port_free 8000
wait_port_free 8010
echo "[완료] 포트 8000/8010 비워짐 — 이제 start 해도 안전합니다."
exit 0
