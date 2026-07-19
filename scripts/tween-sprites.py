"""Create smooth cyclic in-between frames with bidirectional optical flow."""

from pathlib import Path
import cv2
import numpy as np
from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "assets" / "cat-spritesheet-normalized.png"
OUTPUT = ROOT / "assets" / "cat-spritesheet-smooth.png"
KEY_COLS = 6
ROWS = 5
CELL = 190
TWEENS_PER_EDGE = 2
OUTPUT_COLS = KEY_COLS * (TWEENS_PER_EDGE + 1)


def visual_gray(frame: np.ndarray) -> np.ndarray:
    """Give transparent pixels a stable color so optical flow follows the cat edge."""
    rgb = frame[:, :, :3].astype(np.float32)
    alpha = frame[:, :, 3:4].astype(np.float32) / 255.0
    composite = rgb * alpha + 230.0 * (1.0 - alpha)
    return cv2.cvtColor(composite.astype(np.uint8), cv2.COLOR_RGB2GRAY)


def remap(image: np.ndarray, flow: np.ndarray, amount: float) -> np.ndarray:
    height, width = image.shape[:2]
    grid_x, grid_y = np.meshgrid(np.arange(width), np.arange(height))
    map_x = (grid_x - flow[:, :, 0] * amount).astype(np.float32)
    map_y = (grid_y - flow[:, :, 1] * amount).astype(np.float32)
    return cv2.remap(
        image,
        map_x,
        map_y,
        interpolation=cv2.INTER_LINEAR,
        borderMode=cv2.BORDER_CONSTANT,
        borderValue=(0, 0, 0, 0),
    )


def tween(first: np.ndarray, second: np.ndarray, amount: float) -> np.ndarray:
    first_gray = visual_gray(first)
    second_gray = visual_gray(second)
    flow_forward = cv2.calcOpticalFlowFarneback(
        first_gray, second_gray, None, 0.5, 4, 25, 4, 7, 1.5, 0
    )
    flow_backward = cv2.calcOpticalFlowFarneback(
        second_gray, first_gray, None, 0.5, 4, 25, 4, 7, 1.5, 0
    )
    warped_first = remap(first, flow_forward, amount).astype(np.float32)
    warped_second = remap(second, flow_backward, 1.0 - amount).astype(np.float32)

    # Premultiplied-alpha blending avoids dark fringes around cream-colored fur.
    alpha_a = warped_first[:, :, 3:4] / 255.0
    alpha_b = warped_second[:, :, 3:4] / 255.0
    weight_a = (1.0 - amount) * alpha_a
    weight_b = amount * alpha_b
    alpha = weight_a + weight_b
    rgb = np.divide(
        warped_first[:, :, :3] * weight_a + warped_second[:, :, :3] * weight_b,
        np.maximum(alpha, 1e-5),
    )
    result = np.concatenate((rgb, np.clip(alpha * 255.0, 0, 255)), axis=2)
    return np.clip(result, 0, 255).astype(np.uint8)


def main() -> None:
    sheet = np.array(Image.open(SOURCE).convert("RGBA"))
    output = np.zeros((ROWS * CELL, OUTPUT_COLS * CELL, 4), dtype=np.uint8)

    for row in range(ROWS):
        keys = [
            sheet[row * CELL : (row + 1) * CELL, col * CELL : (col + 1) * CELL].copy()
            for col in range(KEY_COLS)
        ]
        timeline: list[np.ndarray] = []
        for index, first in enumerate(keys):
            second = keys[(index + 1) % KEY_COLS]
            timeline.append(first)
            for tween_index in range(1, TWEENS_PER_EDGE + 1):
                amount = tween_index / (TWEENS_PER_EDGE + 1)
                timeline.append(tween(first, second, amount))

        for col, frame in enumerate(timeline):
            output[row * CELL : (row + 1) * CELL, col * CELL : (col + 1) * CELL] = frame

    Image.fromarray(output, "RGBA").save(OUTPUT, optimize=True)
    print(f"Wrote {OUTPUT} ({OUTPUT_COLS} frames per action, including last-to-first tweens)")


if __name__ == "__main__":
    main()
