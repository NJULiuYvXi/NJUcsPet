"""Normalize a generated 6x3 native-frame grid into an 18x1 runtime strip."""

from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image


FRAME_COUNT = 18
SOURCE_COLS = 6
SOURCE_ROWS = 3
CELL = 190
ALPHA_THRESHOLD = 28


def content_bbox(image: Image.Image) -> tuple[int, int, int, int]:
    alpha = image.getchannel("A").point(
        lambda value: 255 if value > ALPHA_THRESHOLD else 0
    )
    bbox = alpha.getbbox()
    if bbox is None:
        raise RuntimeError("generated frame contains no visible sprite")
    return bbox


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--max-width", required=True, type=int)
    parser.add_argument("--max-height", required=True, type=int)
    parser.add_argument("--bottom", required=True, type=int)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    source = Image.open(args.input).convert("RGBA")
    frames: list[Image.Image] = []

    for row in range(SOURCE_ROWS):
        top = round(row * source.height / SOURCE_ROWS)
        bottom = round((row + 1) * source.height / SOURCE_ROWS)
        for col in range(SOURCE_COLS):
            left = round(col * source.width / SOURCE_COLS)
            right = round((col + 1) * source.width / SOURCE_COLS)
            cell = source.crop((left, top, right, bottom))
            frames.append(cell.crop(content_bbox(cell)))

    if len(frames) != FRAME_COUNT:
        raise RuntimeError(f"expected {FRAME_COUNT} frames, found {len(frames)}")

    # One common scale preserves apparent mass and prevents per-frame size pulsing.
    max_source_width = max(frame.width for frame in frames)
    max_source_height = max(frame.height for frame in frames)
    scale = min(
        args.max_width / max_source_width,
        args.max_height / max_source_height,
    )

    strip = Image.new("RGBA", (FRAME_COUNT * CELL, CELL), (0, 0, 0, 0))
    normalized_sizes: list[str] = []
    for index, frame in enumerate(frames):
        width = max(1, round(frame.width * scale))
        height = max(1, round(frame.height * scale))
        resized = frame.resize((width, height), Image.Resampling.LANCZOS)
        x = index * CELL + (CELL - width) // 2
        y = args.bottom - height
        strip.alpha_composite(resized, (x, y))
        normalized_sizes.append(f"{width}x{height}")

    args.output.parent.mkdir(parents=True, exist_ok=True)
    strip.save(args.output, optimize=True)
    print(f"Wrote {args.output} ({strip.width}x{strip.height})")
    print(f"Common scale: {scale:.4f}")
    print("Frame sizes: " + ", ".join(normalized_sizes))


if __name__ == "__main__":
    main()
