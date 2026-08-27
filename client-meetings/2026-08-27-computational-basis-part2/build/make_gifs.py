# -*- coding: utf-8 -*-
"""Assemble walkthrough GIFs from captured frame folders.

    python make_gifs.py gif-create:creation-walkthrough.gif gif-assign:assignment.gif

Frames are captured at 2x for stills; GIFs are downscaled and palette-quantised
so PowerPoint streams them without a multi-megabyte payload per slide. Identical
consecutive frames collapse into one frame with a longer duration, which is how
a `hold` in the capture script turns into a pause in the animation.
"""
import glob
import os
import sys

from PIL import Image

OUT = os.path.join("..", "evidence")
TARGET_W = 1180


def build(folder, name, frame_ms=120, tail_ms=2200, width=TARGET_W, out_dir=OUT):
    files = sorted(glob.glob(os.path.join(folder, "f*.png")))
    if not files:
        raise SystemExit(f"no frames in {folder}")

    frames, size = [], None
    for path in files:
        im = Image.open(path).convert("RGB")
        if size is None:
            size = (width, round(im.height * width / im.width))
        if im.size != size:
            im = im.resize(size, Image.LANCZOS)
        frames.append(im)

    # one shared palette keeps the UI colours stable instead of shimmering
    base = frames[0].quantize(colors=200, method=Image.MEDIANCUT)
    quant = [f.quantize(palette=base, dither=Image.Dither.NONE) for f in frames]

    durations = [frame_ms] * len(quant)
    durations[0] = max(frame_ms, 700)     # let the opening state register
    durations[-1] = tail_ms               # hold the result before looping

    os.makedirs(out_dir, exist_ok=True)
    path = os.path.join(out_dir, name)
    quant[0].save(path, save_all=True, append_images=quant[1:],
                  duration=durations, loop=0, optimize=True, disposal=1)
    kb = os.path.getsize(path) / 1024
    print(f"{name}: {len(quant)} frames  {size[0]}x{size[1]}  {kb:.0f} KB")
    if kb > 1500:
        print(f"  ! {name} is heavy — lower `width` or capture a tighter window")
    return path


if __name__ == "__main__":
    jobs = sys.argv[1:]
    if not jobs:
        sys.exit("usage: python make_gifs.py <frames-folder>:<output.gif> [...]")
    for job in jobs:
        folder, _, name = job.partition(":")
        build(folder, name or (os.path.basename(folder) + ".gif"))
