"""Move the freshly built '-NEW' deck over the real filename, then refresh the
registers and the slide renders.

build_deck.py writes to '-NEW' when the target is open in PowerPoint. Close the
deck, run this, and everything lands where it belongs.
"""
import glob
import os
import shutil
import subprocess
import sys

OUT_DIR = os.path.join("..", "outputs")
NAME = "ATLAS_2026-08-24_Computational_Basis_Integration_PreMeeting_v03"
TARGET = os.path.join(OUT_DIR, NAME + ".pptx")
STAGED = os.path.join(OUT_DIR, NAME + "-NEW.pptx")

if not os.path.exists(STAGED):
    sys.exit(f"nothing to promote: {STAGED} does not exist")

try:
    os.replace(STAGED, TARGET)
except PermissionError:
    sys.exit(f"{os.path.basename(TARGET)} is still open in another program — close it and retry")
print(f"promoted -> {TARGET}")

renders = os.path.join(OUT_DIR, NAME)
os.makedirs(renders, exist_ok=True)
for old in glob.glob(os.path.join(renders, "*.png")):
    os.remove(old)
for f in sorted(glob.glob(os.path.join("preview", "slide-*.png"))):
    num = int(os.path.basename(f).split("-")[1].split(".")[0])
    shutil.copy2(f, os.path.join(renders, f"slide-{num}.png"))
print(f"slide renders -> {renders} ({len(os.listdir(renders))} files)")

subprocess.run([sys.executable, "update_registers.py"], check=True)
