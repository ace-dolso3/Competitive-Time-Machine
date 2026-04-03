from pathlib import Path
from PIL import Image, ImageFilter

BASE = Path("captures/target")
CHECKOUT_DIR = BASE / "checkout" / "2026-03-27"


def rename_capture_set() -> None:
    for page_dir in sorted(BASE.iterdir()):
        if not page_dir.is_dir():
            continue
        for date_dir in sorted(page_dir.iterdir()):
            if not date_dir.is_dir():
                continue
            pngs = sorted(path for path in date_dir.iterdir() if path.suffix.lower() == ".png")
            for path in pngs:
                with Image.open(path) as image:
                    target_name = "desktop.png" if image.width > 1000 else "mobile.png"
                target_path = date_dir / target_name
                if path != target_path:
                    if target_path.exists():
                        target_path.unlink()
                    path.rename(target_path)


def blur_regions(image_path: Path, boxes: list[tuple[int, int, int, int]], radius: int = 18) -> None:
    with Image.open(image_path) as image:
        for box in boxes:
            region = image.crop(box).filter(ImageFilter.GaussianBlur(radius=radius))
            image.paste(region, box)
        image.save(image_path)


def redact_checkout() -> None:
    blur_regions(
        CHECKOUT_DIR / "desktop.png",
        [
            (300, 1460, 980, 1695),
            (300, 2070, 1210, 2550),
            (1825, 1245, 2565, 1465),
        ],
    )
    blur_regions(
        CHECKOUT_DIR / "mobile.png",
        [
            (18, 1465, 280, 1640),
            (12, 1975, 450, 2440),
            (240, 5340, 525, 5515),
        ],
    )


if __name__ == "__main__":
    rename_capture_set()
    redact_checkout()
    print("Renamed target screenshots and blurred checkout personal information.")
