#!/usr/bin/env bash
# 데모 전 최종 점검: 모든 AI 엔드포인트를 실제로 호출해 봅니다.
#
#   bash ai-server/smoke-test.sh
#
# GEMINI_API_KEY 가 ai-server/.env 에 없으면 Gemini 의존 항목(/detect,
# /story/generate)은 건너뛰고 표시합니다.
set -uo pipefail

AI_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BASE=http://127.0.0.1:8000
IMG="$AI_DIR/sam2-server/images/ex.jpeg"
PY="$AI_DIR/.venv/bin/python"
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

PASS=0; FAIL=0; SKIP=0
ok()   { echo "  ✅ $1"; PASS=$((PASS+1)); }
bad()  { echo "  ❌ $1"; FAIL=$((FAIL+1)); }
skip() { echo "  ⏭  $1"; SKIP=$((SKIP+1)); }

json_field() { # file, python-expr(d)
  "$PY" - "$1" "$2" <<'EOF'
import json, sys
d = json.load(open(sys.argv[1]))
print(eval(sys.argv[2]))
EOF
}

echo "=== InMyBag AI 서버 점검 ($(date '+%H:%M:%S')) ==="

# 1. 헬스 체크
if curl -sf --max-time 5 "$BASE/healthy" > "$TMP/h.json"; then
  ok "GET /healthy — 메인 서버 응답"
else
  bad "GET /healthy — 메인 서버가 응답하지 않습니다. bash $AI_DIR/start-ai-servers.sh 먼저 실행하세요."
  echo; echo "결과: 통과 $PASS · 실패 $FAIL · 건너뜀 $SKIP"; exit 1
fi

# 2. SDXL 헬스
if curl -sf --max-time 10 "$BASE/sdxl/healthy" > "$TMP/sh.json" \
   && [[ "$(json_field "$TMP/sh.json" "d['status']")" == "ok" ]]; then
  ok "GET /sdxl/healthy — SDXL 서버 준비됨 ($(json_field "$TMP/sh.json" "d.get('model','')"))"
else
  bad "GET /sdxl/healthy — SDXL 서버 미준비: $(cat "$TMP/sh.json" 2>/dev/null | head -c 200)"
fi

# 3. SAM2 /segment (실제 이미지)
t0=$SECONDS
if curl -sf --max-time 60 -X POST "$BASE/segment" \
     -H "Content-Type: image/jpeg" --data-binary "@$IMG" > "$TMP/seg.json" \
   && [[ "$(json_field "$TMP/seg.json" "d['image'][:15]")" == "data:image/png;" ]]; then
  ok "POST /segment — SAM2 분리 성공 (score=$(json_field "$TMP/seg.json" "round(d['score'],3)"), $((SECONDS-t0))s)"
else
  bad "POST /segment — 실패: $(head -c 200 "$TMP/seg.json" 2>/dev/null)"
fi

# 4. SDXL /sdxl/generate (실제 생성, 빠른 설정)
t0=$SECONDS
if curl -sf --max-time 120 -X POST "$BASE/sdxl/generate" \
     -H "Content-Type: application/json" \
     -d '{"prompt":"a happy child drawing of a house and a sun","steps":12,"width":768,"height":768,"seed":42}' \
     > "$TMP/gen.json" \
   && [[ "$(json_field "$TMP/gen.json" "d['image'][:15]")" == "data:image/png;" ]]; then
  ok "POST /sdxl/generate — KIDO 그림 생성 성공 (seed=42, $((SECONDS-t0))s)"
else
  bad "POST /sdxl/generate — 실패: $(head -c 200 "$TMP/gen.json" 2>/dev/null)"
fi

# 5·6. Gemini 의존 엔드포인트
if grep -qE '^GEMINI_API_KEY=.+' "$AI_DIR/.env" 2>/dev/null; then
  t0=$SECONDS
  if curl -sf --max-time 90 -X POST "$BASE/detect" \
       -H "Content-Type: image/jpeg" --data-binary "@$IMG" > "$TMP/det.json" \
     && json_field "$TMP/det.json" "d['boxes']" > /dev/null 2>&1; then
    ok "POST /detect — Gemini+DINO 탐지 성공 (박스 $(json_field "$TMP/det.json" "len(d['boxes'])")개, $((SECONDS-t0))s)"
  else
    bad "POST /detect — 실패: $(head -c 300 "$TMP/det.json" 2>/dev/null)"
  fi

  t0=$SECONDS
  if curl -sf --max-time 180 -X POST "$BASE/story/generate" \
       -H "Content-Type: application/json" \
       -d '{"dailyMoment":"카페에서 공부했다","emotion":"happy","creativity":5,"objects":[{"label":"연필","locationName":"카페"}]}' \
       > "$TMP/story.json" \
     && [[ "$(json_field "$TMP/story.json" "d['image'][:11]")" == "data:image/" ]]; then
    ok "POST /story/generate — 그림일기 생성 성공 (제목: $(json_field "$TMP/story.json" "d['title']"), 일러스트: $(json_field "$TMP/story.json" "d['imageModel']"), $((SECONDS-t0))s)"
  else
    bad "POST /story/generate — 실패: $(head -c 300 "$TMP/story.json" 2>/dev/null)"
  fi
else
  skip "POST /detect — GEMINI_API_KEY 미설정으로 건너뜀"
  skip "POST /story/generate — GEMINI_API_KEY 미설정으로 건너뜀"
  echo "     → $AI_DIR/.env 에 키 입력 후 서버 재시작, 이 스크립트를 다시 실행하세요."
fi

echo
echo "결과: 통과 $PASS · 실패 $FAIL · 건너뜀 $SKIP"
[[ $FAIL -eq 0 ]] || exit 1
