"""Gemini로 SnapBag 그림일기의 이야기와 일러스트를 생성합니다."""

import base64
import json
import os
import re
from pathlib import Path
from typing import Any

import requests

# 저장소 루트의 .env를 읽어 GEMINI_API_KEY 등을 불러온다.
# 덕분에 터미널에서 매번 export 하지 않아도 된다.
# (python-dotenv가 없으면 기존처럼 셸 환경 변수만 사용한다.)
try:
    from dotenv import load_dotenv

    load_dotenv(Path(__file__).resolve().parents[2] / ".env")
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


def _emotion_guide(payload: dict[str, Any]) -> str:
    emotion = str(payload.get("emotion") or "").strip()
    if emotion not in EMOTION_GUIDES:
        emotion = MOOD_TO_EMOTION.get(str(payload.get("mood") or ""), DEFAULT_EMOTION)
    return EMOTION_GUIDES[emotion]


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
    object_context = _object_context(objects)
    emotion_guide = _emotion_guide(payload)

    prompt = f"""
너는 일상의 작은 순간을 그림일기로 만드는 한국어 동화 작가야.
사용자가 직접 쓴 오늘의 이야기를 중심으로, 짧고 완결된 그림일기를 작성해.

[오늘 있었던 일 — 이야기의 중심]
{daily_moment or '(사용자가 쓴 내용 없음 - 아래 물건과 장소만으로 하루를 자연스럽게 상상해서 써 줘)'}

[오늘의 기분]
{emotion_guide}

[상상을 더하는 정도]
9단계 중 {creativity}단계 (현재 상상 비율 {creativity_ratio:.2f})
- 1에 가까울수록 실제 하루를 그대로 기록하고, 9에 가까울수록 물건이 말하고 세계가 변하는 판타지를 크게 더해.

[함께한 물건 — 배경에 자연스럽게 녹이기]
{object_context}

[작성 규칙]
- 본문은 5~6문장으로 짧게 써. 문단을 나누지 말고 하나의 흐름으로 이어 줘.
- 사용자가 쓴 '오늘 있었던 일'이 이야기의 뼈대야. 사건도 감정도 그 내용에서 출발해.
- 물건은 주인공이 아니라 그 순간을 함께한 존재야. 목록처럼 나열하지 말고 문장 속에 자연스럽게 스며들게 해.
- 5~6문장 안에 다 담기지 않으면 모든 물건을 억지로 넣지 않아도 돼. 이야기의 흐름이 우선이야.
- 장소 이름은 배경 참고용이야. 꼭 필요할 때 한 번만 쓰고, 물건마다 반복해서 붙이지 마.
- 오늘의 기분이 문장의 온도로 드러나게 해.
- 제목은 24자 이내의 자연스러운 한국어로 작성해.
- 어린이도 읽을 수 있게 폭력적이거나 무서운 내용, 실제 브랜드 폄하 표현은 피해.
- 한국어 조사가 어색하지 않게 물건 이름을 자연스럽게 활용해.
- JSON 외의 설명은 출력하지 마.
""".strip()

    body = {
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {
            "temperature": 0.35 + creativity_ratio * 0.65,
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
    labels = [str(item.get("label") or "물건").strip() for item in objects]
    image_prompt = f"""
한 장의 세로형 그림일기에 넣을 가로형 4:3 일러스트를 그려줘.

이야기 제목: {story['title']}
이야기: {story['body']}
반드시 등장할 물건: {', '.join(labels)}
상상력: 9단계 중 {creativity}단계

스타일 가이드:
- 참고 이미지로 제공된 물건의 대략적인 모양과 색을 유지해.
- 모든 물건이 자연스러운 하나의 장면 안에 보이게 해. 물건을 단순히 줄지어 놓지 마.
- 따뜻한 파스텔 과슈, 손으로 그린 동화책, 부드러운 종이 질감으로 표현해.
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
    mime_type, encoded_image = _generate_illustration(payload, story)
    return {
        "title": story["title"],
        "body": story["body"],
        "image": f"data:{mime_type};base64,{encoded_image}",
        "textModel": STORY_MODEL,
        "imageModel": IMAGE_MODEL,
    }
