"""Build a multi-size Windows icon from the first normalized cat frame."""

from pathlib import Path
from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "assets" / "cat-spritesheet-normalized.png"
OUTPUT = ROOT / "assets" / "app-icon.ico"


def main() -> None:
    sheet = Image.open(SOURCE).convert("RGBA")
    cat = sheet.crop((0, 0, 190, 190))
    alpha_box = cat.getchannel("A").getbbox()
    if not alpha_box:
        raise RuntimeError("The source sprite is empty")

    cat = cat.crop(alpha_box)
    canvas = Image.new("RGBA", (256, 256), (0, 0, 0, 0))
    cat.thumbnail((224, 224), Image.Resampling.LANCZOS)
    canvas.alpha_composite(cat, ((256 - cat.width) // 2, 256 - cat.height - 12))
    canvas.save(OUTPUT, format="ICO", sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
    print(f"Wrote {OUTPUT}")


if __name__ == "__main__":
    main()
