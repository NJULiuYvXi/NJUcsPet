"""Replace walking and dragging rows in the five-row runtime sprite sheet."""

from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
CELL = 190
FRAMES = 18
WIDTH = CELL * FRAMES
MAIN_SHEET = ROOT / "assets" / "cat-spritesheet-smooth.png"
WALK_STRIP = ROOT / "assets" / "cat-walk-native18.png"
DRAG_STRIP = ROOT / "assets" / "cat-drag-native18.png"


def load_expected(path: Path, size: tuple[int, int]) -> Image.Image:
    image = Image.open(path).convert("RGBA")
    if image.size != size:
        raise RuntimeError(f"{path.name}: expected {size}, found {image.size}")
    return image


def main() -> None:
    sheet = load_expected(MAIN_SHEET, (WIDTH, CELL * 5))
    walk = load_expected(WALK_STRIP, (WIDTH, CELL))
    drag = load_expected(DRAG_STRIP, (WIDTH, CELL))

    sheet.paste((0, 0, 0, 0), (0, CELL, WIDTH, CELL * 2))
    sheet.alpha_composite(walk, (0, CELL))
    sheet.paste((0, 0, 0, 0), (0, CELL * 3, WIDTH, CELL * 4))
    sheet.alpha_composite(drag, (0, CELL * 3))
    sheet.save(MAIN_SHEET, optimize=True)
    print(f"Updated native walking row 2 and dragging row 4 in {MAIN_SHEET}")


if __name__ == "__main__":
    main()
