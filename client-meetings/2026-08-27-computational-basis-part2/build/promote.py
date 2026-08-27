# -*- coding: utf-8 -*-
"""Move a staged '-NEW' deck over the real filename.

build_deck.py writes to '-NEW' when the target is open in PowerPoint. Close the
deck, run this, and the file and its slide renders land where they belong.
"""
import glob
import os
import shutil
import sys

OUT_DIR = os.path.join("..", "outputs")
NAME = "MyProduct_Walkthrough_v01"          # match DECK in build_deck.py
TARGET = os.path.join(OUT_DIR, NAME + ".pptx")
STAGED = os.path.join(OUT_DIR, NAME + "-NEW.pptx")

if not os.path.exists(STAGED):
    sys.exit(f"nothing to promote: {STAGED} does not exist")
try:
    os.replace(STAGED, TARGET)
except PermissionError:
    sys.exit(f"{os.path.basename(TARGET)} is still open — close it and retry")
print(f"promoted -> {TARGET}")

renders = os.path.join(OUT_DIR, NAME)
os.makedirs(renders, exist_ok=True)
for old in glob.glob(os.path.join(renders, "*.png")):
    os.remove(old)
for f in sorted(glob.glob(os.path.join("preview", "slide-*.png"))):
    num = int(os.path.basename(f).split("-")[1].split(".")[0])
    shutil.copy2(f, os.path.join(renders, f"slide-{num}.png"))
print(f"slide renders -> {renders} ({len(os.listdir(renders))} files)")
