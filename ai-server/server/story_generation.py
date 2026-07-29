"""SnapBag 그림일기 생성: 이야기는 Gemini, 일러스트는 SDXL LoRA로 만듭니다.

일러스트는 파인튜닝한 SDXL LoRA 서버(기본 127.0.0.1:8010)가 그립니다.
그림체는 kidsketch(AI Hub HTP 아동 연필화) LoRA가 주축이고,
kido(KIDO 컬러 아동 그림) LoRA를 약하게 섞어 채색을 보탭니다.
SDXL 서버가 꺼져 있거나 실패하면 기존 Gemini 이미지 모델로 자동 폴백해,
그림일기 기능이 한쪽 장애로 멈추지 않게 합니다.
"""

import base64
import json
import logging
import os
import re
from pathlib import Path
from typing import Any

import requests

logger = logging.getLogger(__name__)

# ai-server/.env 를 읽어 GEMINI_API_KEY 등을 불러온다.
# 덕분에 터미널에서 매번 export 하지 않아도 된다.
# (python-dotenv가 없으면 기존처럼 셸 환경 변수만 사용한다.)
try:
    from dotenv import load_dotenv

    # parents[1] = ai-server/ (이 파일은 ai-server/server/ 에 있다)
    load_dotenv(Path(__file__).resolve().parents[1] / ".env")
except ImportError:  # pragma: no cover - 선택적 의존성
    pass


# 구조화 출력(responseSchema)과 이미지 생성(responseModalities, imageConfig)은
# v1beta 서피스에서 지원됩니다. v1으로 보내면 해당 필드를 Unknown name으로 거부해
# 400 Bad Request가 발생하므로 반드시 v1beta를 사용합니다.
GEMINI_API_ROOT = "https://generativelanguage.googleapis.com/v1beta/models"
# 모델 ID는 환경 변수로 재정의할 수 있게 해, 코드 수정 없이 교체할 수 있습니다.
STORY_MODEL = os.environ.get("GEMINI_STORY_MODEL", "gemini-2.5-flash")
IMAGE_MODEL = os.environ.get("GEMINI_IMAGE_MODEL", "gemini-3.1-flash-image")
MAX_REFERENCE_IMAGES = 4
MAX_REFERENCE_IMAGE_BYTES = 8 * 1024 * 1024

# 일러스트를 그리는 SDXL LoRA 서버 (sdxl-server/sdxl_server.py, 별도 프로세스).
# kidsketch(AI Hub 연필화, 그림체 주축) + kido(KIDO 컬러, 채색 보조) 두 LoRA를 섞는다.
# 메인 서버의 /sdxl/* 프록시와 같은 환경 변수를 공유한다.
SDXL_SERVER_URL = os.environ.get("SDXL_SERVER_URL", "http://127.0.0.1:8010").rstrip("/")
SDXL_MODEL_NAME = "sdxl-base-1.0 + kidsketch-lora + kido-lora"
# 4090 기준 30 steps ≈ 3초. 그림일기 상단 배치에 맞춘 4:3 가로형(기존 Gemini와 같은 비율).
SDXL_STORY_STEPS = int(os.environ.get("SDXL_STORY_STEPS", "30"))
SDXL_STORY_WIDTH = 1024
SDXL_STORY_HEIGHT = 768
SDXL_TIMEOUT_SECONDS = 180

# 일러스트 백엔드 선택. 기본은 sdxl이고, 운영 중 문제가 생기면 코드 수정 없이
# STORY_IMAGE_BACKEND=gemini 로 예전 방식으로 되돌릴 수 있다.
STORY_IMAGE_BACKEND = os.environ.get("STORY_IMAGE_BACKEND", "sdxl").strip().lower()

# 이야기의 톤은 사용자가 고른 '오늘의 기분'에서 그대로 가져온다.
# (별도의 톤 선택 질문은 없앴다. 기분을 이미 물어봤으므로 한 번 더 묻지 않는다.)
EMOTION_GUIDES = {
    "happy": "밝고 즐거운 기분. 웃음이 나는 순간을 가볍고 경쾌하게 담는다.",
    "excited": "두근거리고 기대되는 기분. 들뜬 마음이 문장에서 느껴지게 한다.",
    "calm": "잔잔하고 포근한 기분. 조용한 여운을 남긴다.",
    "sad": "조금 쓸쓸한 기분. 담담하게 쓰되 마지막에는 작은 위로를 남긴다.",
    "angry": "속상하고 답답했던 기분. 격한 표현 대신 솔직하게 쓰고, 끝에서는 누그러지게 한다.",
    "tired": "지치고 노곤한 기분. 무겁지 않게, 하루를 다독이듯 마무리한다.",
}

DEFAULT_EMOTION = "calm"

# 기분 선택이 없던 시절에 만들어진 요청(mood만 보내는 앱)을 위한 대응표.
MOOD_TO_EMOTION = {
    "warm": "calm",
    "adventure": "excited",
    "comedy": "happy",
    "mystery": "tired",
}


# SDXL 프롬프트(영어)에 기분을 녹일 때 쓰는 표현.
EMOTION_PROMPT_EN = {
    "happy": "bright, joyful and warm",
    "excited": "excited, lively and colorful",
    "calm": "calm, cozy and peaceful",
    "sad": "a little lonely but gently comforting",
    "angry": "frustrated but slowly softening",
    "tired": "sleepy, slow and softly warm",
}

# 모든 SDXL 프롬프트 끝에 붙는 그림체 지시.
# 그림체의 주축은 kidsketch(AI Hub 아동 연필화) LoRA다. 다만 원본 데이터가 흑백이므로,
# '색연필로 꽉 칠한 색'을 강하게 요구해 연필 그림체를 유지하면서 컬러로 나오게 한다.
# 무엇을 그렸는지 한눈에 알아볼 수 있도록 또렷한 선/단순한 형태/깔끔한 구도도 명시한다.
SDXL_STYLE_SUFFIX = (
    "cute simple children's pencil drawing on white paper, "
    "fully colored in with bright colored pencils, vivid colorful colors everywhere, "
    "clear outlines, simple recognizable shapes, clean composition"
)

# 그림일기 일러스트 전용 네거티브 프롬프트.
# sdxl_server.py 의 기본값에 '어지러운 낙서/추상/알아볼 수 없는 형태'를 추가로 막는다.
# 연필 그림체 자체는 원하는 스타일이므로 막지 않되,
# 색을 안 칠한 흑백/회색 결과만 강하게 차단한다.
SDXL_STORY_NEGATIVE = (
    "black and white, monochrome, grayscale, uncolored, pale washed-out colors, "
    "photo, photorealistic, 3d render, text, watermark, signature, blurry, "
    "messy scribbles, chaotic lines, abstract, unrecognizable shapes, "
    "distorted, deformed, cluttered background"
)


def _resolve_emotion(payload: dict[str, Any]) -> str:
    emotion = str(payload.get("emotion") or "").strip()
    if emotion not in EMOTION_GUIDES:
        emotion = MOOD_TO_EMOTION.get(str(payload.get("mood") or ""), DEFAULT_EMOTION)
    return emotion


def _emotion_guide(payload: dict[str, Any]) -> str:
    return EMOTION_GUIDES[_resolve_emotion(payload)]


def _api_key() -> str:
    key = os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")
    if not key:
        raise RuntimeError(
            "Gemini API key is missing. Set GEMINI_API_KEY or GOOGLE_API_KEY first."
        )
    return key


def _model_url(model: str) -> str:
    normalized_model = model.removeprefix("models/")
    return f"{GEMINI_API_ROOT}/{normalized_model}:generateContent?key={_api_key()}"


def _response_parts(data: dict[str, Any]) -> list[dict[str, Any]]:
    candidates = data.get("candidates") or []
    if not candidates:
        feedback = data.get("promptFeedback") or data.get("prompt_feedback") or {}
        raise RuntimeError(f"Gemini returned no candidates: {feedback}")

    return candidates[0].get("content", {}).get("parts", [])


def _json_from_text(text: str) -> dict[str, Any]:
    cleaned = text.strip()
    fenced = re.search(r"```(?:json)?\s*(.*?)\s*```", cleaned, re.DOTALL)
    if fenced:
        cleaned = fenced.group(1).strip()

    start = cleaned.find("{")
    end = cleaned.rfind("}")
    if start >= 0 and end > start:
        cleaned = cleaned[start : end + 1]

    parsed = json.loads(cleaned)
    if not isinstance(parsed, dict):
        raise RuntimeError("Gemini story response is not a JSON object.")
    return parsed


def _object_context(objects: list[dict[str, Any]]) -> str:
    lines = []
    for index, item in enumerate(objects, start=1):
        label = str(item.get("label") or f"이름 미등록 물건 {index}").strip()
        location = str(item.get("locationName") or "위치 정보 없음").strip()
        lines.append(f"{index}. {label} (수집 장소: {location})")
    return "\n".join(lines)


def _generate_story(payload: dict[str, Any]) -> dict[str, str]:
    objects = payload["objects"]
    daily_moment = str(payload.get("dailyMoment") or "").strip()
    creativity = int(payload.get("creativity") or 5)
    creativity_ratio = (creativity - 1) / 8
    # 물건이 없으면 물건 언급 규칙 대신 '없이 써 달라'는 안내로 대체한다.
    object_context = _object_context(objects) or (
        "(오늘 기록한 물건 없음 - 물건 언급 없이 오늘 있었던 일과 기분만으로 써 줘)"
    )
    emotion_guide = _emotion_guide(payload)

    prompt = f"""
너는 초등학교 1~2학년 아이가 되어, 오늘 하루를 그림일기로 쓰는 거야.

[출력 형식 — 가장 중요, 반드시 지켜]
본문은 딱 3문장이야. 4문장부터는 실패야. 각 문장의 역할은 정해져 있어:
1번째 문장: '나는 오늘 ~했다.' (오늘 있었던 일)
2번째 문장: 함께한 물건이 등장하는 있었던 일 하나. ('~먹었다', '~썼다', '~들었다')
3번째 문장: 솔직한 기분 한 마디. ('참 재미있었다.', '기분 좋은 하루였다.', '조금 속상했다.')

[좋은 예시 — 이런 글을 써야 해]
제목: 동아리방에서 공부
본문: 나는 오늘 동아리방에서 조용히 공부했다. 중간중간 맛있는 간식과 음료수를 먹었다. 기분 좋은 하루였다.

제목: 비 오는 날
본문: 나는 오늘 우산을 쓰고 학교에 갔다. 새로 산 파란 우산 덕분에 비를 하나도 안 맞았다. 참 다행이었다.

[나쁜 예시 — 이런 문장이 하나라도 있으면 실패야]
- '따스한 햇살이 창문으로 스며들어 마음까지 포근해지는 기분이었어.' (어른스러운 꾸밈말, '~했어' 말투)
- '잔잔하고 평화로운 여운이 가득 남았단다.' (여운 남기기, '~단다' 말투)
- '시원한 음료수 한 모금이 목을 타고 넘어가며 작은 행복을 주었어.' (문학적 비유)

[오늘 있었던 일 — 일기의 중심]
{daily_moment or '(사용자가 쓴 내용 없음 - 아래 물건과 장소만으로 오늘 하루를 상상해서 써 줘)'}

[오늘의 기분]
{emotion_guide}

[상상을 더하는 정도]
9단계 중 {creativity}단계 (현재 상상 비율 {creativity_ratio:.2f})
- 1에 가까울수록 실제 있었던 일을 그대로 쓰고, 9에 가까울수록 물건이 말을 걸었다는 식의 아이다운 상상을 더해.
- 상상을 더해도 말투는 그대로 아이의 반말 일기체야.

[함께한 물건 — 반드시 모두 일기에 등장]
{object_context}

[작성 규칙]
- 위 '함께한 물건'을 하나도 빠뜨리지 말고 2번째 문장(필요하면 1번째 문장에도)에 자연스럽게 넣어.
- 문장 끝은 전부 '~했다', '~갔다', '~였다'로 끝내. '~했어', '~했지', '~단다', '~했어요'는 전부 금지야.
- 비유, 꾸밈말, 여운 금지. 눈에 보이는 사실과 솔직한 기분만 써.
- 오늘의 기분이 3번째 문장의 감정으로 드러나게 해.
- 제목은 12자 이내로 아이답게 단순하게. (예: '동아리방에서 공부', '비 오는 날')
- 폭력적이거나 무서운 내용, 실제 브랜드 이름은 피해.
- JSON 외의 설명은 출력하지 마.
""".strip()

    body = {
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {
            # 아이 말투 지시를 안정적으로 지키도록 상한을 낮게 유지한다.
            # (상상력은 temperature보다 프롬프트의 '상상을 더하는 정도'가 주로 결정한다.)
            "temperature": 0.3 + creativity_ratio * 0.4,
            "responseMimeType": "application/json",
            "responseSchema": {
                "type": "OBJECT",
                "properties": {
                    "title": {"type": "STRING"},
                    "body": {"type": "STRING"},
                },
                "required": ["title", "body"],
            },
        },
    }

    response = requests.post(_model_url(STORY_MODEL), json=body, timeout=90)
    response.raise_for_status()
    parts = _response_parts(response.json())
    text = "".join(str(part.get("text") or "") for part in parts)
    story = _json_from_text(text)
    title = str(story.get("title") or "").strip()
    story_body = str(story.get("body") or "").strip()
    if not title or not story_body:
        raise RuntimeError("Gemini returned an empty story title or body.")

    return {"title": title, "body": story_body}


# ---------------------------------------------------------------------------
# SDXL LoRA 일러스트 (kidsketch 주 + kido 보조)
#
# 두 LoRA 모두 영어 캡션(트리거 워드 kidsketch / kidodrawing)으로 학습했으므로,
# 한국어 이야기를 그대로 보내면 장면을 이해하지 못한다.
# 그래서 이미 사용 중인 Gemini 텍스트 모델로 이야기를 짧은 영어 장면 묘사로
# 요약해 SDXL 프롬프트로 쓰고, 이 요약마저 실패하면 감정 기반 기본 프롬프트로
# 대체해 일러스트 생성이 끊기지 않게 한다.
# (트리거 워드는 sdxl_server.py 가 자동으로 앞에 붙인다.)
# ---------------------------------------------------------------------------

def _fallback_sdxl_prompt(payload: dict[str, Any]) -> str:
    """Gemini 요약이 실패했을 때 쓰는 안전한 기본 영어 프롬프트."""
    mood = EMOTION_PROMPT_EN[_resolve_emotion(payload)]
    return (
        f"a child's drawing of a {mood} moment of everyday life, "
        "one child with their favorite belongings, simple shapes, colorful"
    )


def _sanitize_sdxl_prompt(prompt: str) -> str:
    """SDXL 텍스트 인코더가 모르는 비ASCII 문자를 제거하고 공백을 정리한다."""
    ascii_only = prompt.encode("ascii", "ignore").decode("ascii")
    return re.sub(r"\s+", " ", ascii_only).strip()


def _build_sdxl_prompt(payload: dict[str, Any], story: dict[str, str]) -> str:
    """Gemini로 이야기를 SDXL용 짧은 영어 장면 묘사로 요약한다. 실패 시 기본 프롬프트.

    사용자가 앱에서 직접 고르고 쓴 세 가지(감정, 줄거리, 상상력)를 그대로 반영한다.
    - 줄거리(dailyMoment): 장면의 1순위 재료. 이야기 본문보다 우선한다.
    - 감정(emotion): 색감/날씨/표정으로 드러나게 한다.
    - 상상력(creativity): 1이면 쓴 그대로의 일상, 9면 판타지 요소를 더한다.
    """
    objects = payload["objects"]
    labels = [str(item.get("label") or "물건").strip() for item in objects]
    daily_moment = str(payload.get("dailyMoment") or "").strip()
    creativity = int(payload.get("creativity") or 5)
    mood = EMOTION_PROMPT_EN[_resolve_emotion(payload)]

    prompt = f"""
You write short English prompts for a text-to-image model that draws in a child's colored-pencil-drawing style.

Turn the user's day below into ONE drawable scene description in English.

What the user wrote about today (the most important source — draw this moment):
{daily_moment or '(nothing written - imagine one scene from the story and objects below)'}

Story title: {story['title']}
Story: {story['body']}
Objects the user carried today (Korean names): {', '.join(labels) or '(none - draw only the child and the scene)'}
Today's mood: {mood}
Imagination level: {creativity} of 9 (1 = draw the day exactly as the user wrote it, a realistic everyday scene; 9 = add playful fantasy such as talking objects or magical places)

Rules:
- English only. 50 words or fewer. One sentence fragment, no line breaks.
- Start with "a child's drawing of".
- The scene MUST include exactly one child as the main character, doing what the diary describes.
- Draw ONE clear moment: one place, the one child, and the carried objects.
- Every carried object MUST appear in the scene as a simple drawn item the child is using or has nearby (e.g. 음료수 -> a drink bottle on the desk), translated into simple English.
- If there are more than four objects, pick the four that fit the diary best so the scene stays clean.
- Keep the scene simple and easy to recognize at a glance. Never crowded, cluttered, or abstract.
- Name concrete colors for at least three things in the scene (e.g. yellow desk, blue bottle, green tree) so the drawing is fully colored, never black-and-white.
- Let the mood show through colors, weather, and the child's facial expression.
- Describe only visible things (place, objects, weather, the one child).
- No letters, numbers, text, brand names, or quotation marks in the scene.
""".strip()

    body = {
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {
            "temperature": 0.3,
            "responseMimeType": "application/json",
            "responseSchema": {
                "type": "OBJECT",
                "properties": {"prompt": {"type": "STRING"}},
                "required": ["prompt"],
            },
        },
    }

    try:
        response = requests.post(_model_url(STORY_MODEL), json=body, timeout=45)
        response.raise_for_status()
        parts = _response_parts(response.json())
        text = "".join(str(part.get("text") or "") for part in parts)
        summarized = _sanitize_sdxl_prompt(str(_json_from_text(text).get("prompt") or ""))
        # 너무 짧으면 요약이 깨진 것이므로 기본 프롬프트로 대체한다.
        if len(summarized) >= 20:
            return summarized[:1500]
        logger.warning("SDXL prompt summary too short (%r). Using fallback prompt.", summarized)
    except Exception:
        logger.exception("SDXL prompt summary via Gemini failed. Using fallback prompt.")

    return _fallback_sdxl_prompt(payload)


def _generate_illustration_sdxl(payload: dict[str, Any], story: dict[str, str]) -> str:
    """SDXL KIDO LoRA 서버로 일러스트를 생성해 PNG data URI를 반환한다."""
    scene = _build_sdxl_prompt(payload, story)
    # 장면 묘사 + 그림체 지시를 합쳐 최종 프롬프트를 만든다.
    prompt = f"{scene}, {SDXL_STYLE_SUFFIX}"

    response = requests.post(
        f"{SDXL_SERVER_URL}/generate",
        json={
            "prompt": prompt,
            "negativePrompt": SDXL_STORY_NEGATIVE,
            "steps": SDXL_STORY_STEPS,
            "width": SDXL_STORY_WIDTH,
            "height": SDXL_STORY_HEIGHT,
        },
        timeout=SDXL_TIMEOUT_SECONDS,
    )
    response.raise_for_status()
    data = response.json()

    image = str(data.get("image") or "")
    if not image.startswith("data:image/"):
        raise RuntimeError("SDXL server returned no image data.")

    logger.info(
        "SDXL illustration done (seed=%s, %sms, prompt=%r)",
        data.get("seed"),
        data.get("elapsedMs"),
        prompt[:120],
    )
    return image


def _load_reference_image(url: str) -> tuple[str, str] | None:
    if not url:
        return None

    if url.startswith("data:"):
        match = re.match(r"^data:([^;,]+);base64,(.+)$", url, re.DOTALL)
        if not match:
            return None
        mime_type, encoded = match.groups()
        if len(encoded) * 3 // 4 > MAX_REFERENCE_IMAGE_BYTES:
            return None
        return mime_type, encoded

    if not url.startswith(("http://", "https://")):
        return None

    response = requests.get(url, timeout=20)
    response.raise_for_status()
    content = response.content
    if len(content) > MAX_REFERENCE_IMAGE_BYTES:
        return None
    mime_type = (response.headers.get("content-type") or "image/png").split(";")[0]
    return mime_type, base64.b64encode(content).decode("ascii")


def _generate_illustration(
    payload: dict[str, Any], story: dict[str, str]
) -> tuple[str, str]:
    objects = payload["objects"]
    creativity = int(payload.get("creativity") or 5)
    daily_moment = str(payload.get("dailyMoment") or "").strip()
    emotion_guide = _emotion_guide(payload)
    labels = [str(item.get("label") or "물건").strip() for item in objects]
    image_prompt = f"""
한 장의 세로형 그림일기에 넣을 가로형 4:3 일러스트를 그려줘.

사용자가 직접 쓴 오늘 이야기 (장면의 1순위 재료):
{daily_moment or '(없음 - 아래 이야기와 물건으로 장면을 상상해 줘)'}

오늘의 기분: {emotion_guide}
이야기 제목: {story['title']}
이야기: {story['body']}
오늘 함께한 물건: {', '.join(labels) or '(없음 - 물건 없이 주인공과 장면만 그려 줘)'}
상상력: 9단계 중 {creativity}단계 (1이면 쓴 그대로의 일상 장면, 9면 물건이 말하고 세계가 변하는 판타지)

스타일 가이드:
- 어린아이가 연필로 그리고 색연필로 칠한 그림처럼 표현해. 선은 또렷하게, 형태는 단순하게.
- 반드시 알록달록한 색연필 색으로 꽉 채워 칠해. 흑백이나 색을 안 칠한 선 그림은 절대 안 돼.
- 무엇을 그렸는지 한눈에 알아볼 수 있어야 해. 어지러운 낙서나 추상적인 표현은 절대 쓰지 마.
- 일기의 주인공인 어린이 한 명이 반드시 그림에 등장해서, 일기에 쓴 일을 하고 있어야 해.
- 하나의 분명한 순간만 그려. 장소 하나, 주인공 어린이 한 명, 그리고 어울리는 물건 몇 개.
- '오늘 함께한 물건'은 빠짐없이 장면 속 소품으로 그려 넣어. 주인공이 쓰고 있거나 곁에 둔 모습으로.
  (예: 음료수 → 책상 위의 음료수 병) 4개가 넘으면 일기와 가장 어울리는 4개만 골라.
- 그려 넣은 물건은 참고 이미지의 대략적인 모양과 색을 유지해.
- 물건을 단순히 줄지어 나열하지 말고, 주인공이 쓰거나 곁에 둔 것처럼 배치해.
- 오늘의 기분이 색감과 날씨, 인물의 표정에서 드러나게 해.
- 인물의 실사 얼굴, 상표, 로고, 워터마크, 글자나 제목은 이미지 안에 그리지 마.
- 그림일기 상단에 사용할 수 있게 중심 구도와 여백을 균형 있게 잡아.
""".strip()

    parts: list[dict[str, Any]] = [{"text": image_prompt}]
    for item in objects[:MAX_REFERENCE_IMAGES]:
        try:
            loaded = _load_reference_image(str(item.get("imageUrl") or ""))
        except requests.RequestException:
            loaded = None
        if loaded:
            mime_type, encoded = loaded
            parts.append({"inlineData": {"mimeType": mime_type, "data": encoded}})

    body = {
        "contents": [{"parts": parts}],
        "generationConfig": {
            "responseModalities": ["IMAGE"],
            "imageConfig": {
                "aspectRatio": "4:3",
                "imageSize": "1K",
            },
        },
    }
    response = requests.post(_model_url(IMAGE_MODEL), json=body, timeout=150)
    response.raise_for_status()

    for part in _response_parts(response.json()):
        inline_data = part.get("inlineData") or part.get("inline_data")
        if inline_data and inline_data.get("data"):
            mime_type = inline_data.get("mimeType") or inline_data.get("mime_type") or "image/png"
            return mime_type, str(inline_data["data"])

    raise RuntimeError("Gemini returned no generated illustration.")


def generate_story_diary(payload: dict[str, Any]) -> dict[str, Any]:
    story = _generate_story(payload)

    image_data_uri: str | None = None
    image_model = IMAGE_MODEL

    # 기본: 파인튜닝한 SDXL KIDO LoRA로 일러스트를 그린다.
    # SDXL 서버가 죽어 있거나 실패하면 Gemini 이미지 모델로 폴백해 기능을 유지한다.
    if STORY_IMAGE_BACKEND != "gemini":
        try:
            image_data_uri = _generate_illustration_sdxl(payload, story)
            image_model = SDXL_MODEL_NAME
        except Exception:
            logger.exception(
                "SDXL illustration failed (%s). Falling back to Gemini image model.",
                SDXL_SERVER_URL,
            )

    if image_data_uri is None:
        mime_type, encoded_image = _generate_illustration(payload, story)
        image_data_uri = f"data:{mime_type};base64,{encoded_image}"
        image_model = IMAGE_MODEL

    return {
        "title": story["title"],
        "body": story["body"],
        "image": image_data_uri,
        "textModel": STORY_MODEL,
        "imageModel": image_model,
    }
