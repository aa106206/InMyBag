"""Gemini로 SnapBag 그림일기의 이야기와 일러스트를 생성합니다."""

import base64
import json
import os
import re
from typing import Any

import requests


# 구조화 출력(responseSchema)과 이미지 생성(responseModalities, imageConfig)은
# v1beta 서피스에서 지원됩니다. v1으로 보내면 해당 필드를 Unknown name으로 거부해
# 400 Bad Request가 발생하므로 반드시 v1beta를 사용합니다.
GEMINI_API_ROOT = "https://generativelanguage.googleapis.com/v1beta/models"
# 모델 ID는 환경 변수로 재정의할 수 있게 해, 코드 수정 없이 교체할 수 있습니다.
STORY_MODEL = os.environ.get("GEMINI_STORY_MODEL", "gemini-2.5-flash")
IMAGE_MODEL = os.environ.get("GEMINI_IMAGE_MODEL", "gemini-3.1-flash-image")
MAX_REFERENCE_IMAGES = 4
MAX_REFERENCE_IMAGE_BYTES = 8 * 1024 * 1024

MOOD_GUIDES = {
    "warm": "따뜻하고 포근한 하루. 잔잔한 감동과 긍정적인 여운을 남긴다.",
    "adventure": "명랑하고 즐거운 모험. 물건들이 협력하며 작은 사건을 해결한다.",
    "comedy": "엉뚱하고 유쾌한 코미디. 예상 밖의 행동과 사랑스러운 반전을 넣는다.",
    "mystery": "해로운 신비감이 있는 미스터리. 무서운 표현 대신 호기심을 자극한다.",
}


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
    mood = str(payload.get("mood") or "warm")
    creativity = int(payload.get("creativity") or 5)
    creativity_ratio = (creativity - 1) / 8
    object_context = _object_context(objects)
    mood_guide = MOOD_GUIDES.get(mood, MOOD_GUIDES["warm"])

    prompt = f"""
너는 일상의 작은 순간을 그림일기로 만드는 한국어 동화 작가야.
아래 사용자의 세 가지 답변과 오늘 수집한 물건을 반드시 모두 활용해 하나의 완결된 이야기를 작성해.

[사용자의 답변]
1. 오늘 어떤 일이 있었나요?: {daily_moment or '답변 없음 - 물건과 장소로 자연스럽게 유추'}
2. 어떤 이야기로 만들까요?: {mood_guide}
3. 상상을 얼마나 더할까요?: 9단계 중 {creativity}단계
   - 1에 가까울수록 실제 하루를 충실히 기록하고, 9에 가까울수록 물건이 말하고 세계가 변하는 판타지를 크게 더해.
   - 현재 상상 비율: {creativity_ratio:.2f}

[오늘 수집한 물건]
{object_context}

[작성 규칙]
- 제목은 24자 이내의 자연스러운 한국어로 작성해.
- 본문은 그림일기에 어울리는 3~4개 문단, 공백 포함 450~700자로 작성해.
- 물건을 나열만 하지 말고, 각 물건이 이야기의 사건이나 해결에 의미 있게 기여하게 해.
- 사용자가 입력한 실제 사건을 존중하되, 선택한 상상 단계만큼만 각색해.
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
