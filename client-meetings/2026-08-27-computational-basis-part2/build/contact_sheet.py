# -*- coding: utf-8 -*-
"""Tile the rendered slide PNGs into contact sheets, 15 slides at a time.

Reviewing 40+ slides one file at a time is slow and you miss rhythm problems —
three text-heavy pages in a row, a section with no screenshot, a colour that
drifts. One sheet per 15 slides shows the shape of the deck at a glance.

    python contact_sheet.py            # reads ./preview, writes ./preview/contact-N.png
"""
import glob
import os
import sys

from PIL import Image, ImageDraw, ImageFont

PER_SHEET = 15
COLS = 5
THUMB_W = 400


def _label_font():
    for path in (r"C:\Windows\Fonts\seguisb.ttf", r"C:\Windows\Fonts\arialbd.ttf",
                 "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
                 "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"):
        if os.path.exists(path):
            return ImageFont.truetype(path, 13)
    return ImageFont.load_default()


def build(src="preview", out=None):
    out = out or src
    files = sorted(glob.glob(os.path.join(src, "slide-*.png")))
    if not files:
        raise SystemExit(f"no slide PNGs in {src} — run render_preview.py first")

    first = Image.open(files[0])
    thumb_h = round(THUMB_W * first.height / first.width)
    pad, lab = 10, 18
    font = _label_font()

    sheets = 0
    for part in range(0, len(files), PER_SHEET):
        chunk = files[part:part + PER_SHEET]
        rows = -(-len(chunk) // COLS)
        sheet = Image.new("RGB",
                          (COLS * (THUMB_W + pad) + pad, rows * (thumb_h + pad + lab) + pad),
                          (235, 235, 238))
        draw = ImageDraw.Draw(sheet)
        for i, path in enumerate(chunk):
            r, c = divmod(i, COLS)
            x = pad + c * (THUMB_W + pad)
            y = pad + r * (thumb_h + pad + lab)
            sheet.paste(Image.open(path).resize((THUMB_W, thumb_h), Image.LANCZOS), (x, y + lab))
            draw.text((x + 2, y + 1), str(part + i + 1), font=font, fill=(60, 50, 80))
        sheets += 1
        sheet.save(os.path.join(out, f"contact-{sheets}.png"))
    print(f"{sheets} contact sheet(s) from {len(files)} slides -> {out}")


if __name__ == "__main__":
    build(sys.argv[1] if len(sys.argv) > 1 else "preview")
