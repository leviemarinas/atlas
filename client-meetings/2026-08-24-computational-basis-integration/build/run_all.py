"""Rebuild every asset and the deck, in the order the captures depend on.

capture_basis resets the Computational Basis stores, so the run always starts
from the same 219 / 30 / 209 / 6 workspace, creates CUS-900, assigns it once,
and ends with a deck whose counts and screenshots agree.
"""
import subprocess
import sys

STEPS = [
    ("Computational Basis workspace", "capture_basis.py"),
    ("Creating CUS-900 (+ GIF frames)", "capture_create.py"),
    ("Formula references and the import template", "capture_new.py"),
    ("Assignments, references, history (+ GIF frames)", "capture_rest.py"),
    ("Posted payroll computation trail", "capture_trail.py"),
    ("Walkthrough GIFs", "make_gifs.py"),
    ("Deck image assets", "prepare_images.py"),
    ("Deck", "build_deck.py"),
    ("Preview render", "render_preview.py"),
    ("Registers", "update_registers.py"),
]

for label, script in STEPS:
    print(f"\n=== {label} ({script}) ===", flush=True)
    r = subprocess.run([sys.executable, script], capture_output=True, text=True,
                       encoding="utf-8", errors="replace")
    tail = [ln for ln in (r.stdout or "").splitlines() if ln.strip()][-14:]
    print("\n".join(tail))
    if r.returncode != 0:
        print((r.stderr or "")[-2500:])
        sys.exit(f"FAILED: {script}")
print("\nall done")
