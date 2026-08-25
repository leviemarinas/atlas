"""Assemble the walkthrough GIFs from captured frames.

Frames are captured at 2x for stills; GIFs are downscaled and palette-quantised
so PowerPoint can stream them without a multi-megabyte payload per slide.
"""
import glob
import os

from PIL import Image

OUT = os.path.join("..", "evidence")
TARGET_W = 1180


def build(folder, name, frame_ms=110, tail_ms=1500, width=TARGET_W):
    files = sorted(glob.glob(os.path.join(folder, "f*.png")))
    if not files:
        raise SystemExit(f"no frames in {folder}")
    frames = []
    size = None
    for f in files:
        im = Image.open(f).convert("RGB")
        if size is None:
            h = round(im.height * width / im.width)
            size = (width, h)
        if im.size != size:
            im = im.resize(size, Image.LANCZOS)
        frames.append(im)

    # one shared palette keeps the UI colours stable instead of shimmering
    base = frames[0].quantize(colors=200, method=Image.MEDIANCUT)
    quant = [f.quantize(palette=base, dither=Image.Dither.NONE) for f in frames]

    durations = [frame_ms] * len(quant)
    durations[-1] = tail_ms
    durations[0] = max(frame_ms, 700)

    os.makedirs(OUT, exist_ok=True)
    path = os.path.join(OUT, name)
    quant[0].save(path, save_all=True, append_images=quant[1:],
                  duration=durations, loop=0, optimize=True, disposal=1)
    kb = os.path.getsize(path) / 1024
    print(f"{name}: {len(quant)} frames  {size[0]}x{size[1]}  {kb:.0f} KB")
    return path


if __name__ == "__main__":
    build("gif-create", "computation-creation-walkthrough.gif", frame_ms=120, tail_ms=2200)
    build("gif-assign", "client-assignment-walkthrough.gif", frame_ms=140, tail_ms=2200)
