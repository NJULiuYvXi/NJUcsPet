"""Normalize the six generated riding keyframes into 190px cells."""

from pathlib import Path
import argparse
from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
COLS = 6
CELL = 190


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    source = Image.open(args.input).convert("RGBA")
    frames: list[Image.Image] = []
    for col in range(COLS):
        left = round(col * source.width / COLS)
        right = round((col + 1) * source.width / COLS)
        rough = source.crop((left, 0, right, source.height))
        bbox = rough.getchannel("A").point(lambda value: 255 if value > 28 else 0).getbbox()
        if not bbox:
            raise RuntimeError(f"empty riding frame {col + 1}")
        frames.append(rough.crop(bbox))

    max_width = max(frame.width for frame in frames)
    max_height = max(frame.height for frame in frames)
    scale = min(170 / max_width, 154 / max_height, 1.0)
    strip = Image.new("RGBA", (COLS * CELL, CELL), (0, 0, 0, 0))
    for col, frame in enumerate(frames):
        resized = frame.resize(
            (round(frame.width * scale), round(frame.height * scale)),
            Image.Resampling.LANCZOS,
        )
        x = col * CELL + (CELL - resized.width) // 2
        y = 168 - resized.height
        strip.alpha_composite(resized, (x, y))

    strip.save(args.output, optimize=True)
    print(f"Wrote {args.output} ({strip.width}x{strip.height})")


if __name__ == "__main__":
    main()
