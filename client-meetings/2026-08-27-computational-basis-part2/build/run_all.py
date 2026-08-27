# -*- coding: utf-8 -*-
"""Rebuild the Part 2 deck end to end.

    python run_all.py            # reseed the payroll, then capture and build
    python run_all.py --keep     # keep the posted payroll, redo everything else
    python run_all.py --deck     # copy and build only, no capture

Order is not negotiable. `capture_seed` resets the Computational Basis stores
and posts a payroll; `capture_create` adds ERN-007 on top of that clean state;
`capture_scale` edits it into a second version; `capture_binding` then binds a
deduction to a formula and runs a second payroll over it. Run one out of order
and the register screenshots stop agreeing with the copy beside them.
"""
import subprocess
import sys

PY = sys.executable
KEEP = "--keep" in sys.argv
DECK_ONLY = "--deck" in sys.argv

CAPTURE = [
    ("capture_seed.py", ["--keep"] if KEEP else []),
    ("capture_govern.py", []),
    ("capture_create.py", []),
    ("capture_scale.py", []),
    ("capture_binding.py", []),
]

BUILD = [
    ("make_gifs.py", ["gif-create:create-walkthrough.gif"]),
    ("prepare_images.py", []),
    ("build_deck.py", []),
    ("render_preview.py", []),
    ("check_deck.py", []),
]


def run(script, args):
    print(f"\n=== {script} {' '.join(args)} ".ljust(72, "="))
    result = subprocess.run([PY, script, *args])
    if result.returncode != 0:
        raise SystemExit(f"{script} failed with {result.returncode}")


def main():
    steps = BUILD if DECK_ONLY else CAPTURE + BUILD
    for script, args in steps:
        run(script, args)
    print("\ndone")


if __name__ == "__main__":
    main()
