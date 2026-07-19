"""Normalize the exact 6x5 generated cat keyframe grid into 190px cells."""

from pathlib import Path
from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "assets" / "cat-spritesheet.png"
OUTPUT = ROOT / "assets" / "cat-spritesheet-normalized.png"
COLS = 6
ROWS = 5
CELL = 190
ALPHA_THRESHOLD = 28


def occupied_runs(values: list[bool], max_gap: int = 13) -> list[tuple[int, int]]:
    raw: list[tuple[int, int]] = []
    start = None
    for index, occupied in enumerate(values + [False]):
        if occupied and start is None:
            start = index
        elif not occupied and start is not None:
            raw.append((start, index))
            start = None

    merged: list[list[int]] = []
    for start, end in raw:
        if merged and start - merged[-1][1] <= max_gap:
            merged[-1][1] = end
        else:
            merged.append([start, end])
    return [(start, end) for start, end in merged if end - start >= 18]


def content_bbox(image: Image.Image) -> tuple[int, int, int, int]:
    alpha = image.getchannel("A").point(lambda value: 255 if value > ALPHA_THRESHOLD else 0)
    bbox = alpha.getbbox()
    if bbox is None:
        raise RuntimeError("empty sprite frame")
    return bbox


def column_splits(alpha: Image.Image, top: int, bottom: int) -> list[int]:
    """Place each split in the emptiest vertical gutter near the ideal grid line."""
    width = alpha.width
    nominal_cell = width / COLS
    search_radius = max(12, round(nominal_cell * 0.22))
    splits = [0]
    for col in range(1, COLS):
        expected = round(col * nominal_cell)
        start = max(splits[-1] + 20, expected - search_radius)
        end = min(width - (COLS - col) * 20, expected + search_radius)
        candidates: list[tuple[int, int, int]] = []
        for x in range(start, end + 1):
            column = alpha.crop((x, top, x + 1, bottom))
            occupied = sum(value > ALPHA_THRESHOLD for value in column.getdata())
            candidates.append((occupied, abs(x - expected), x))
        splits.append(min(candidates)[2])
    return splits + [width]


def main() -> None:
    source = Image.open(SOURCE).convert("RGBA")
    sheet_width, sheet_height = source.size
    frames: list[list[Image.Image]] = [[] for _ in range(ROWS)]
    alpha = source.getchannel("A")
    y_occupied = [
        alpha.crop((0, y, sheet_width, y + 1)).getextrema()[1] > ALPHA_THRESHOLD
        for y in range(sheet_height)
    ]
    y_runs = occupied_runs(y_occupied)
    if len(y_runs) != ROWS:
        raise RuntimeError(f"expected {ROWS} sprite rows, found {y_runs}")

    for row, (top, bottom) in enumerate(y_runs):
        splits = column_splits(alpha, top, bottom)
        for col in range(COLS):
            left = splits[col]
            right = splits[col + 1]
            rough = source.crop((left, max(0, top - 2), right, min(sheet_height, bottom + 2)))
            bbox = content_bbox(rough)
            frames[row].append(rough.crop(bbox))
        print(f"row {row + 1} column splits: {splits}")

    normalized = Image.new("RGBA", (COLS * CELL, ROWS * CELL), (0, 0, 0, 0))
    row_scales: list[float] = []
    for row in range(ROWS):
        max_width = max(frame.width for frame in frames[row])
        max_height = max(frame.height for frame in frames[row])
        row_scales.append(min(166 / max_width, 164 / max_height, 1.0))

    for row, row_frames in enumerate(frames):
        scale = row_scales[row]
        for col, frame in enumerate(row_frames):
            resized = frame.resize(
                (max(1, round(frame.width * scale)), max(1, round(frame.height * scale))),
                Image.Resampling.LANCZOS,
            )
            # Align every animation to the same visual ground line. Dragging frames
            # are vertically centered because their legs dangle below the grab point.
            target_bottom = 168 if row != 3 else 178
            paste_x = col * CELL + (CELL - resized.width) // 2
            paste_y = row * CELL + target_bottom - resized.height
            normalized.alpha_composite(resized, (paste_x, paste_y))

    normalized.save(OUTPUT, optimize=True)
    print(f"Wrote {OUTPUT} ({normalized.width}x{normalized.height})")
    for index, scale in enumerate(row_scales, start=1):
        sizes = ", ".join(f"{frame.width}x{frame.height}" for frame in frames[index - 1])
        print(f"row {index}: scale={scale:.3f}; frames={sizes}")


if __name__ == "__main__":
    main()
