# -*- coding: utf-8 -*-
"""Produce every deck image: annotate the field guides from the content spec,
then round and shadow all screens so they sit on a slide as cards."""
import os
import shutil

from annotate import annotate, frame_shot, load_all
from content import FIELD_GUIDES, PLAIN

OUT = "deck-assets"


def main():
    shutil.rmtree(OUT, ignore_errors=True)
    os.makedirs(OUT, exist_ok=True)
    data = load_all()

    for key, spec in FIELD_GUIDES.items():
        if spec.get("annotate") is False:
            src = data[spec["capture"]]["file"]
        else:
            labels = spec.get("labels") or [str(i + 1) for i in range(len(spec["marks"]))]
            marks = [(anchor, labels[i]) for i, (anchor, _, _) in enumerate(spec["marks"])]
            # A table-header anchor takes a smaller badge: the ring has to hug
            # the header row so it does not cover the data beneath, which leaves
            # the badge sitting on the column name unless it is scaled down.
            src = annotate(spec["capture"], marks, out_name=key, data=data,
                           badge=spec.get("badge", 58),
                           side=spec.get("side", "left"))
        frame_shot(src, os.path.join(OUT, key + ".png"))
        print("  ", key)

    for name in PLAIN:
        rec = data.get(name)
        if not rec:
            print("  ! missing capture", name)
            continue
        frame_shot(rec["file"], os.path.join(OUT, name + ".png"))
        print("  ", name)

    print(f"{len(os.listdir(OUT))} assets in {OUT}")


if __name__ == "__main__":
    main()
