"""Expand the six riding keyframes to an 18-frame seamless loop."""

from importlib.util import module_from_spec, spec_from_file_location
from pathlib import Path
import argparse
import numpy as np
from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
CELL = 190
KEYS = 6
TWEENS = 2

spec = spec_from_file_location("sprite_tween", Path(__file__).with_name("tween-sprites.py"))
sprite_tween = module_from_spec(spec)
assert spec and spec.loader
spec.loader.exec_module(sprite_tween)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    strip = np.array(Image.open(args.input).convert("RGBA"))
    keys = [strip[:, col * CELL : (col + 1) * CELL].copy() for col in range(KEYS)]
    timeline: list[np.ndarray] = []
    for index, first in enumerate(keys):
        second = keys[(index + 1) % KEYS]
        timeline.append(first)
        for tween_index in range(1, TWEENS + 1):
            timeline.append(sprite_tween.tween(first, second, tween_index / (TWEENS + 1)))

    output = np.concatenate(timeline, axis=1)
    Image.fromarray(output, "RGBA").save(args.output, optimize=True)
    print(f"Wrote {args.output} ({len(timeline)} seamless riding frames)")


if __name__ == "__main__":
    main()
