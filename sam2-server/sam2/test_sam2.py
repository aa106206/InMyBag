import torch
import numpy as np
from PIL import Image
import matplotlib.pyplot as plt

from sam2.build_sam import build_sam2
from sam2.sam2_image_predictor import SAM2ImagePredictor

checkpoint = "checkpoints/sam2.1_hiera_small.pt"
model_cfg = "configs/sam2.1/sam2.1_hiera_s.yaml"
image_path = "../images/ex.jpeg"

image = Image.open(image_path).convert("RGB")
image.thumbnail((1024, 1024))
image = np.array(image)

device = "mps" if torch.backends.mps.is_available() else "cpu"

model = build_sam2(model_cfg, checkpoint, device=device)
predictor = SAM2ImagePredictor(model)

predictor.set_image(image)

# 테스트용 터치 좌표: 이미지 중앙
h, w = image.shape[:2]
# input_point = np.array([[w // 2, h // 2]])
input_point = np.array([[700, 550]])
input_label = np.array([1])

masks, scores, logits = predictor.predict(
    point_coords=input_point,
    point_labels=input_label,
    multimask_output=True,
)

best_idx = np.argmax(scores)
best_mask = masks[best_idx]

print("scores:", scores)
print("best mask shape:", best_mask.shape)

plt.figure(figsize=(10, 10))
plt.imshow(image)
plt.imshow(np.ma.masked_where(best_mask == 0, best_mask), alpha=0.5)
plt.scatter(input_point[:, 0], input_point[:, 1])
plt.axis("off")
plt.savefig("../images/point_result.png", bbox_inches="tight", pad_inches=0)

print("저장 완료: ../images/point_result.png")