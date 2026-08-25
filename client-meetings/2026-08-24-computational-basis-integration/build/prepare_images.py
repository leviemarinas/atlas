"""Produce every deck image asset: annotate the field-guide captures from the
content spec, then round and shadow all screens so they sit on a slide as cards.
"""
import os
import shutil

from annotate import annotate, frame_shot, load_all
from content import FIELD_GUIDES

OUT = "deck-assets"


def main():
    shutil.rmtree(OUT, ignore_errors=True)
    os.makedirs(OUT, exist_ok=True)
    data = load_all()

    produced = {}
    for key, spec in FIELD_GUIDES.items():
        if spec.get("annotate") is False:
            src = data[spec["capture"]]["file"]
        else:
            labels = spec.get("labels") or [str(i + 1) for i in range(len(spec["marks"]))]
            marks = [(anchor, labels[i]) for i, (anchor, _, _) in enumerate(spec["marks"])]
            src = annotate(spec["capture"], marks, out_name=key, data=data, badge=58,
                           side=spec.get("side", "left"))
        produced[key] = frame_shot(src, os.path.join(OUT, key + ".png"))
        print("  ", key)

    for name in ["cb-overview", "policy-chain", "change-history", "cb-register",
                 "reference-record",
                 "trail-sources-a", "trail-ledger-a", "trail-ledger-b",
                 "trail-step-open", "assign-created", "create-saved",
                 "reference-sources", "cus900-record", "cb-columns"]:
        rec = data.get(name)
        if not rec:
            print("  ! missing capture", name)
            continue
        produced[name] = frame_shot(rec["file"], os.path.join(OUT, name + ".png"))
        print("  ", name)

    print(f"{len(produced)} assets in {OUT}")
    return produced


if __name__ == "__main__":
    main()
