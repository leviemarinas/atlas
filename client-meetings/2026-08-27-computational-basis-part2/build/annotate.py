"""Draw numbered callout markers onto a capture using its recorded anchors.

Because the anchors come from the live DOM, a marker always lands on the field
it describes: no hand-placed arrows, nothing pointing at empty space.
"""
import json
import os

from PIL import Image, ImageDraw, ImageFont

SHOTS = "shots"
OUT = "shots/annotated"

MARK = (228, 87, 46)          # callout orange
MARK_SOFT = (228, 87, 46, 24)
WHITE = (255, 255, 255)
FONT_BOLD = r"C:\Windows\Fonts\seguisb.ttf"

_anchor_cache = {}


def anchors(*files):
    if not _anchor_cache:
        for f in files or ("shots/anchors-basis.json",):
            if os.path.exists(f):
                with open(f, encoding="utf-8") as fh:
                    _anchor_cache.update(json.load(fh))
    return _anchor_cache


def load_all():
    data = {}
    for name in sorted(os.listdir(SHOTS)):
        if name.startswith("anchors") and name.endswith(".json"):
            with open(os.path.join(SHOTS, name), encoding="utf-8") as fh:
                data.update(json.load(fh))
    return data


def _rounded(draw, box, radius, outline, width, fill=None):
    draw.rounded_rectangle(box, radius=radius, outline=outline, width=width, fill=fill)


def annotate(capture_name, marks, out_name=None, badge=54, data=None,
             box_pad=8, radius=10, side="left"):
    """`marks` is an ordered list of (anchor_key, label).

    `side` puts the numbered badge on the highlight's top-left or top-right
    corner. Form fields need "right": their label sits at the left edge and a
    badge there would cover the first word.
    """
    data = data or load_all()
    rec = data[capture_name]
    im = Image.open(rec["file"]).convert("RGB")
    overlay = Image.new("RGBA", im.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(overlay)
    font = ImageFont.truetype(FONT_BOLD, int(badge * 0.56))

    for key, label in marks:
        a = rec["anchors"].get(key)
        if not a:
            print(f"  ! {capture_name}: no anchor {key}")
            continue
        x, y, w, h = a["x"], a["y"], a["w"], a["h"]
        box = (x - box_pad, y - box_pad, x + w + box_pad, y + h + box_pad)
        # soft white halo so the ring reads on dark surfaces too
        _rounded(d, (box[0] - 3, box[1] - 3, box[2] + 3, box[3] + 3),
                 radius + 3, (255, 255, 255, 210), 6)
        _rounded(d, box, radius, MARK + (255,), 5, fill=MARK_SOFT)

        # badge straddles a top corner of the ring, kept inside the image
        edge = box[2] if side == "right" else box[0]
        bx = min(im.width - badge // 2 - 3, max(badge // 2 + 3, edge))
        by = max(badge // 2 + 3, box[1])
        d.ellipse((bx - badge // 2, by - badge // 2, bx + badge // 2, by + badge // 2),
                  fill=MARK + (255,), outline=(255, 255, 255, 255), width=4)
        tw = d.textbbox((0, 0), label, font=font)
        d.text((bx - (tw[2] - tw[0]) / 2 - tw[0], by - (tw[3] - tw[1]) / 2 - tw[1]),
               label, font=font, fill=WHITE + (255,))

    im = Image.alpha_composite(im.convert("RGBA"), overlay).convert("RGB")
    os.makedirs(OUT, exist_ok=True)
    path = os.path.join(OUT, (out_name or capture_name) + ".png")
    im.save(path)
    return path


def frame_shot(src, dst, radius=18, border=(232, 231, 237), shadow=True, pad=26):
    """Round the corners of a raw capture and give it a soft card shadow."""
    im = Image.open(src).convert("RGB")
    w, h = im.size
    canvas = Image.new("RGBA", (w + pad * 2, h + pad * 2), (0, 0, 0, 0))
    if shadow:
        sh = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
        ImageDraw.Draw(sh).rounded_rectangle(
            (pad, pad + 6, pad + w, pad + h + 6), radius=radius, fill=(60, 40, 90, 46))
        from PIL import ImageFilter
        canvas = Image.alpha_composite(canvas, sh.filter(ImageFilter.GaussianBlur(14)))
    mask = Image.new("L", (w, h), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, w - 1, h - 1), radius=radius, fill=255)
    canvas.paste(im, (pad, pad), mask)
    d = ImageDraw.Draw(canvas)
    d.rounded_rectangle((pad, pad, pad + w - 1, pad + h - 1), radius=radius,
                        outline=border + (255,), width=2)
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    canvas.convert("RGB").save(dst)
    return dst
