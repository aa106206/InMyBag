import base64
import json
import mimetypes
import os
import re
from functools import lru_cache
from io import BytesIO
from typing import Any

import requests
import torch
from PIL import Image, ImageDraw, ImageFont
from transformers import AutoModelForZeroShotObjectDetection, AutoProcessor


IMAGE_PATH = "test2.jpeg"
OUTPUT_PATH = "result.jpg"
GEMINI_MODEL = "gemini-2.5-flash"
GROUNDING_DINO_MODEL = "IDEA-Research/grounding-dino-base"
KOREAN_FONT_PATH = "/System/Library/Fonts/AppleSDGothicNeo.ttc"
BOX_THRESHOLD = 0.35
TEXT_THRESHOLD = 0.3


def extract_json(text):
    text = text.strip()

    fenced = re.search(r"```(?:json)?\s*(.*?)\s*```", text, re.DOTALL)
    if fenced:
        text = fenced.group(1).strip()

    start = text.find("[")
    end = text.rfind("]")
    if start != -1 and end != -1:
        text = text[start : end + 1]

    return json.loads(text)


def get_gemini_object_candidates(image_path):
    api_key = os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")
    if not api_key:
        raise RuntimeError(
            "Gemini API key is missing. Set GEMINI_API_KEY or GOOGLE_API_KEY first."
        )

    mime_type = mimetypes.guess_type(image_path)[0] or "image/jpeg"
    with open(image_path, "rb") as image_file:
        image_data = base64.b64encode(image_file.read()).decode("utf-8")

    prompt = """
You are helping an object detection pipeline.

Given the image, list the visible foreground objects that the user likely intended to capture.
There may be one or more target objects.

Only include objects that are almost entirely visible in the image.
The user is expected to upload a photo where the intended objects are fully contained.

Exclude:
- objects cut off by the image border
- objects where a meaningful part is hidden, cropped, or outside the frame
- background furniture, shelves, walls, floors, desks, mats, surfaces, or decoration
- objects shown only on a screen, in a reflection, or in a picture/poster
- partial objects that are only useful as context

For example, if a laptop or mouse pad is cropped by the image edge, do NOT include it.
If an iPad and a mouse are fully visible, include them.

Return ONLY a JSON array. Each item must have:
- generic_label_ko: broad Korean object name useful for detection, e.g. "자동차", "휴대폰", "사람"
- specific_label_ko: most specific Korean/product/model name if inferable, e.g. "테슬라 사이버트럭", "아이폰 16 프로"; otherwise same as generic_label_ko
- dino_label_en: broad English label to pass to Grounding DINO, singular, lowercase, no article, e.g. "car", "smartphone", "person"
- aliases_en: 1-4 English aliases from specific to generic
- visibility_score: number from 0 to 1, where 1 means the full object is visible and not cropped

Prefer detection-stable generic labels for dino_label_en.
Only return items with visibility_score >= 0.85.
For example, if the object is a Tesla Cybertruck:
[
  {
    "generic_label_ko": "자동차",
    "specific_label_ko": "테슬라 사이버트럭",
    "dino_label_en": "car",
    "aliases_en": ["tesla cybertruck", "cybertruck", "electric pickup truck", "car"],
    "visibility_score": 0.95
  }
]
""".strip()

    url = (
        "https://generativelanguage.googleapis.com/v1beta/models/"
        f"{GEMINI_MODEL}:generateContent?key={api_key}"
    )
    payload = {
        "contents": [
            {
                "parts": [
                    {"text": prompt},
                    {"inline_data": {"mime_type": mime_type, "data": image_data}},
                ]
            }
        ],
        "generationConfig": {
            "temperature": 0.1,
            "response_mime_type": "application/json",
        },
    }

    response = requests.post(url, json=payload, timeout=60)
    response.raise_for_status()
    data = response.json()
    text = data["candidates"][0]["content"]["parts"][0]["text"]
    candidates = extract_json(text)

    if not isinstance(candidates, list) or not candidates:
        raise RuntimeError("Gemini returned no object candidates.")

    return candidates


def get_gemini_object_candidates_from_bytes(image_bytes, mime_type="image/jpeg"):
    api_key = os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")
    if not api_key:
        raise RuntimeError(
            "Gemini API key is missing. Set GEMINI_API_KEY or GOOGLE_API_KEY first."
        )

    image_data = base64.b64encode(image_bytes).decode("utf-8")
    prompt = """
You are helping an object detection pipeline.

Given the image, list the visible foreground objects that the user likely intended to capture.
There may be one or more target objects.

Only include objects that are almost entirely visible in the image.
Exclude background furniture, shelves, walls, floors, desks, mats, surfaces, or decoration.
Exclude objects cut off by the image border.

Return ONLY a JSON array. Each item must have:
- generic_label_ko
- specific_label_ko
- dino_label_en: broad English label, singular, lowercase, no article
- aliases_en: 1-4 English aliases
- visibility_score: number from 0 to 1

Only return items with visibility_score >= 0.85.
""".strip()

    url = (
        "https://generativelanguage.googleapis.com/v1beta/models/"
        f"{GEMINI_MODEL}:generateContent?key={api_key}"
    )
    payload = {
        "contents": [
            {
                "parts": [
                    {"text": prompt},
                    {"inline_data": {"mime_type": mime_type, "data": image_data}},
                ]
            }
        ],
        "generationConfig": {
            "temperature": 0.1,
            "response_mime_type": "application/json",
        },
    }

    response = requests.post(url, json=payload, timeout=60)
    response.raise_for_status()
    data = response.json()
    text = data["candidates"][0]["content"]["parts"][0]["text"]
    candidates = extract_json(text)

    if not isinstance(candidates, list) or not candidates:
        raise RuntimeError("Gemini returned no object candidates.")

    return candidates


def build_dino_prompt(candidates):
    labels = []
    seen = set()

    for candidate in candidates:
        visibility_score = float(candidate.get("visibility_score", 1.0))
        if visibility_score < 0.85:
            continue

        label = str(candidate.get("dino_label_en", "")).strip().lower()
        if not label or label in seen:
            continue
        seen.add(label)
        labels.append(label)

    if not labels:
        raise RuntimeError("No usable dino_label_en values returned from Gemini.")

    return ". ".join(labels) + "."


def build_display_label_map(candidates):
    label_map = {}

    for candidate in candidates:
        dino_label = str(candidate.get("dino_label_en", "")).strip().lower()
        generic_label = str(candidate.get("generic_label_ko", "")).strip()
        fallback_label = generic_label or dino_label

        if dino_label:
            label_map[dino_label] = fallback_label

        for alias in candidate.get("aliases_en", []):
            alias = str(alias).strip().lower()
            if alias:
                label_map[alias] = generic_label or alias

    return label_map


def load_label_font(image):
    font_size = max(24, min(image.size) // 35)
    try:
        return ImageFont.truetype(KOREAN_FONT_PATH, font_size)
    except OSError:
        return ImageFont.load_default()


def draw_label(draw, box, label, font):
    padding_x = 8
    padding_y = 5
    x0, y0, _, _ = box
    text_bbox = draw.textbbox((0, 0), label, font=font, stroke_width=1)
    text_w = text_bbox[2] - text_bbox[0]
    text_h = text_bbox[3] - text_bbox[1]

    label_x = x0
    label_y = max(0, y0 - text_h - padding_y * 2 - 2)
    background = [
        label_x,
        label_y,
        label_x + text_w + padding_x * 2,
        label_y + text_h + padding_y * 2,
    ]

    draw.rectangle(background, fill="red")
    draw.text(
        (label_x + padding_x, label_y + padding_y),
        label,
        fill="white",
        font=font,
        stroke_width=1,
        stroke_fill="black",
    )


def draw_detection_results(image, results, label_map):
    draw = ImageDraw.Draw(image)
    font = load_label_font(image)
    result = results[0]

    for box, score, text_label in zip(
        result["boxes"], result["scores"], result["text_labels"]
    ):
        box = [round(x, 2) for x in box.tolist()]
        detected_label = str(text_label).strip().lower()
        display_label = label_map.get(detected_label, text_label)
        draw.rectangle(box, outline="white", width=8)
        draw.rectangle(box, outline="red", width=5)
        draw_label(draw, box, display_label, font)
        print(
            f"Detected {display_label} ({text_label}) with confidence "
            f"{round(score.item(), 3)} at location {box}"
        )


@lru_cache(maxsize=1)
def get_grounding_dino():
    device = "cuda" if torch.cuda.is_available() else "cpu"
    processor = AutoProcessor.from_pretrained(GROUNDING_DINO_MODEL)
    model = AutoModelForZeroShotObjectDetection.from_pretrained(
        GROUNDING_DINO_MODEL
    ).to(device)
    return processor, model, device


def _box_area(box):
    x0, y0, x1, y1 = box
    return max(0.0, x1 - x0) * max(0.0, y1 - y0)


def detect_image_bytes(image_bytes: bytes, mime_type: str = "image/jpeg") -> dict[str, Any]:
    """이미지 바이트를 받아 Grounding DINO bbox 후보를 JSON으로 반환합니다."""
    image = Image.open(BytesIO(image_bytes)).convert("RGB")
    width, height = image.size
    candidates = get_gemini_object_candidates_from_bytes(image_bytes, mime_type=mime_type)
    text = build_dino_prompt(candidates)
    label_map = build_display_label_map(candidates)
    processor, model, device = get_grounding_dino()

    inputs = processor(images=image, text=text, return_tensors="pt").to(device)
    with torch.no_grad():
        outputs = model(**inputs)

    results = processor.post_process_grounded_object_detection(
        outputs,
        inputs.input_ids,
        threshold=BOX_THRESHOLD,
        text_threshold=TEXT_THRESHOLD,
        target_sizes=[image.size[::-1]],
    )

    detections = []
    result = results[0]
    for index, (box, score, text_label) in enumerate(
        zip(result["boxes"], result["scores"], result["text_labels"])
    ):
        x0, y0, x1, y1 = [float(value) for value in box.tolist()]
        x0 = max(0.0, min(float(width), x0))
        y0 = max(0.0, min(float(height), y0))
        x1 = max(0.0, min(float(width), x1))
        y1 = max(0.0, min(float(height), y1))

        if x1 <= x0 or y1 <= y0:
            continue

        detected_label = str(text_label).strip().lower()
        display_label = label_map.get(detected_label, detected_label)
        detections.append(
            {
                "id": f"dino-{index}",
                "label": display_label,
                "dinoLabel": detected_label,
                "score": float(score.item()),
                "box": {
                    "x0": x0,
                    "y0": y0,
                    "x1": x1,
                    "y1": y1,
                },
                "area": _box_area((x0, y0, x1, y1)),
            }
        )

    detections.sort(key=lambda item: item["score"], reverse=True)

    return {
        "width": width,
        "height": height,
        "prompt": text,
        "candidates": candidates,
        "boxes": detections,
    }


def main():
    device = "cuda" if torch.cuda.is_available() else "cpu"
    image = Image.open(IMAGE_PATH).convert("RGB")

    candidates = get_gemini_object_candidates(IMAGE_PATH)
    print("Gemini object candidates:")
    print(json.dumps(candidates, ensure_ascii=False, indent=2))

    text = build_dino_prompt(candidates)
    label_map = build_display_label_map(candidates)
    print(f"Grounding DINO prompt: {text}")

    processor = AutoProcessor.from_pretrained(GROUNDING_DINO_MODEL)
    model = AutoModelForZeroShotObjectDetection.from_pretrained(
        GROUNDING_DINO_MODEL
    ).to(device)

    inputs = processor(images=image, text=text, return_tensors="pt").to(device)
    with torch.no_grad():
        outputs = model(**inputs)

    results = processor.post_process_grounded_object_detection(
        outputs,
        inputs.input_ids,
        threshold=0.35,
        text_threshold=0.3,
        target_sizes=[image.size[::-1]],
    )

    draw_detection_results(image, results, label_map)
    image.save(OUTPUT_PATH)
    print(f"Saved result image to {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
