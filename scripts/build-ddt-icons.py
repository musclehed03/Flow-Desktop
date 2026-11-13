#!/usr/bin/env python3
"""Build the DDT lock-mark icon set (pink variant — the baked OS icon).

Renders the mark from the same geometry as src/components/common/Logo.tsx
(24x24 viewBox), supersampled 4x and downscaled with LANCZOS. DDT lettering
at >= 32px, F-only below (it mushes at 16px). Deterministic: same input, same
bytes apart from PNG timestamps.

Writes, under src-tauri/icons/:
  icon.png (512), 128x128.png, 128x128@2x.png (256), 64x64.png, 32x32.png,
  icon.ico (16/32/48/256 PNG entries), icon.icns (16/32/64/128/256/512/1024),
  Square*.png + StoreLogo.png, and every PNG under android/ + ios/ at its own
  size (foreground/round launcher icons get the padded placement upstream used).
"""

import struct
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

REPO = Path(__file__).resolve().parent.parent
ICONS = REPO / "src-tauri" / "icons"
FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"

CONTAINER = (255, 30, 137, 255)  # neon pink #FF1E89 (baked OS icon)
MARK = (0, 207, 255, 255)  # cyber cyan #00CFFF

# Container bounds in viewBox units (the YouTube shape from Logo.tsx).
BOX = (1.96, 4.77, 22.04, 19.99)
RADIUS = 3.4
# Slanted F, full size (F-only small mark).
F_FULL = [(10, 7), (18, 7), (17.2, 9.5), (12.8, 9.5), (12.2, 11.5),
          (16, 11.5), (15.2, 14), (11.5, 14), (10.5, 17), (7.5, 17)]
# Same F, scaled down and shifted up to make room for the DDT lettering.
F_LETTERED = [(10.44, 6.5), (16.68, 6.5), (16.06, 8.45), (12.62, 8.45),
              (12.16, 10.01), (15.12, 10.01), (14.5, 11.96), (11.61, 11.96),
              (10.83, 14.3), (8.49, 14.3)]
DDT_SIZE = 3.5
DDT_TRACKING = 0.35
DDT_BASELINE = 18.0

SS = 4  # supersample factor


def draw_mark(size: int, lettered: bool) -> Image.Image:
    """Render the mark at `size` px on a transparent square."""
    big = size * SS
    u = big / 24.0
    img = Image.new("RGBA", (big, big), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle(
        [BOX[0] * u, BOX[1] * u, BOX[2] * u, BOX[3] * u],
        radius=RADIUS * u,
        fill=CONTAINER,
    )
    pts = F_LETTERED if lettered else F_FULL
    d.polygon([(x * u, y * u) for x, y in pts], fill=MARK)
    if lettered:
        font = ImageFont.truetype(FONT, int(round(DDT_SIZE * u)))
        text = "DDT"
        widths = [font.getlength(ch) for ch in text]
        total = sum(widths) + DDT_TRACKING * u * (len(text) - 1)
        x = 12 * u - total / 2
        for ch, w in zip(text, widths):
            d.text((x, DDT_BASELINE * u), ch, font=font, fill=MARK,
                   anchor="ls")
            x += w + DDT_TRACKING * u
    return img.resize((size, size), Image.LANCZOS)


def write_ico(path: Path, sizes: list[int]) -> None:
    """ICO with one PNG entry per size (Vista-style, 32-bit)."""
    blobs = []
    for s in sizes:
        im = draw_mark(s, lettered=s >= 32)
        import io
        buf = io.BytesIO()
        im.save(buf, "PNG")
        blobs.append((s, buf.getvalue()))
    count = len(blobs)
    header = struct.pack("<HHH", 0, 1, count)
    offset = 6 + 16 * count
    entries = b""
    data = b""
    for size, blob in blobs:
        dim = 0 if size >= 256 else size
        entries += struct.pack("<BBBBHHII", dim, dim, 0, 0, 1, 32,
                               len(blob), offset)
        data += blob
        offset += len(blob)
    path.write_bytes(header + entries + data)


def write_icns(path: Path, sizes: list[tuple[str, int]]) -> None:
    """Modern .icns: PNG payloads in icp4/icp5/icp6/ic07/ic08/ic09/ic10."""
    elements = b""
    for tag, size in sizes:
        import io
        im = draw_mark(size, lettered=size >= 32)
        buf = io.BytesIO()
        im.save(buf, "PNG")
        payload = buf.getvalue()
        elements += tag.encode() + struct.pack(">I", 8 + len(payload)) + payload
    path.write_bytes(b"icns" + struct.pack(">I", 8 + len(elements)) + elements)


def paste_padded(master: Image.Image, size: int, frac: float) -> Image.Image:
    """Master scaled to `frac` of the canvas, centered on transparency."""
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    side = int(round(size * frac))
    small = master.resize((side, side), Image.LANCZOS)
    canvas.paste(small, ((size - side) // 2, (size - side) // 2), small)
    return canvas


def main() -> int:
    master_lettered = draw_mark(1024, lettered=True)
    master_fonly = draw_mark(1024, lettered=False)

    def master_for(size: int) -> Image.Image:
        return master_lettered if size >= 32 else master_fonly

    written: list[str] = []

    def save_png(im: Image.Image, path: Path) -> None:
        im.save(path, "PNG")
        written.append(f"{path.relative_to(REPO)} {im.size[0]}x{im.size[1]}")

    # Core Tauri set.
    save_png(draw_mark(512, lettered=True), ICONS / "icon.png")
    save_png(draw_mark(128, lettered=True), ICONS / "128x128.png")
    save_png(draw_mark(256, lettered=True), ICONS / "128x128@2x.png")
    save_png(draw_mark(64, lettered=True), ICONS / "64x64.png")
    save_png(draw_mark(32, lettered=True), ICONS / "32x32.png")

    write_ico(ICONS / "icon.ico", [16, 32, 48, 256])
    written.append("src-tauri/icons/icon.ico 16/32/48/256")
    write_icns(ICONS / "icon.icns", [
        ("icp4", 16), ("icp5", 32), ("icp6", 64), ("ic07", 128),
        ("ic08", 256), ("ic09", 512), ("ic10", 1024),
    ])
    written.append("src-tauri/icons/icon.icns 16/32/64/128/256/512/1024")

    # Windows tile logos + store logo: plain resizes at each file's own size.
    for path in sorted(ICONS.glob("Square*.png")) + [ICONS / "StoreLogo.png"]:
        size = Image.open(path).size[0]
        save_png(master_for(size).resize((size, size), Image.LANCZOS), path)

    # Android + iOS sets: plain resizes, except the launcher foreground/round
    # icons, which keep upstream's padded placement.
    for path in sorted(ICONS.rglob("*.png")):
        if path.parent == ICONS:
            continue
        size = Image.open(path).size[0]
        master = master_for(size)
        if path.name == "ic_launcher_foreground.png":
            im = paste_padded(master, size, 0.84)
        elif path.name == "ic_launcher_round.png":
            im = paste_padded(master, size, 0.78)
        else:
            im = master.resize((size, size), Image.LANCZOS)
        save_png(im, path)

    # Verify: every written PNG reopens at the size claimed.
    for line in written:
        rel = line.split(" ")[0]
        Image.open(REPO / rel).verify()
    print(f"wrote {len(written)} icon files:")
    for line in written:
        print(f"  {line}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
