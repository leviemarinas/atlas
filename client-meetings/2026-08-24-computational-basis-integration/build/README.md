# Deck build pipeline (v03)

One command rebuilds every screenshot, both GIFs and the deck:

```bash
python build/run_all.py
```

It needs the prototype running on `http://localhost:5175` (the `prototype` entry in
`.claude/launch.json`), Chrome installed, and Python with `pillow`, `requests`,
`websockets` and `python-pptx`.

## Why it works this way

The previous deck's screenshots were mis-framed and its numbered callouts pointed at
blank space. The fix is to capture through the DevTools protocol and record the
**bounding rectangle of every named field at capture time**; the markers are then drawn
from those rectangles, so a marker cannot point at the wrong control.

## Order matters

`run_all.py` runs the steps in dependency order:

| # | Script | What it does |
|---|--------|--------------|
| 1 | `capture_basis.py` | **Resets** the Computational Basis stores, then captures the workspace, tab strip, register and columns. Resetting first is what makes the run repeatable. |
| 2 | `capture_create.py` | Creates CUS-900 end to end; captures the five form panels and 72 GIF frames. |
| 3 | `capture_rest.py` | Policy chain, reference sources, change history, the client assignment (34 GIF frames) and the saved record drawer. |
| 4 | `capture_trail.py` | Runs the Scenario Studio end-to-end journey to post `PR-2025-11-E2E`, then captures the source trail and calculation ledger. Seeding and capturing share one browser session because Chrome does not reliably flush localStorage between headless runs. |
| 5 | `make_gifs.py` | Assembles both walkthrough GIFs into `evidence/`. |
| 6 | `prepare_images.py` | Draws the callout markers from `content.py` and rounds/shadows every screen. |
| 7 | `build_deck.py` | Assembles the 49-slide PPTX. |
| 8 | `render_preview.py` | Renders the finished PPTX back to PNGs and reports any text that overflows its box. |

## The modules

- `cdp.py` — minimal Chrome DevTools driver: navigate, evaluate, click, set inputs, screenshot with a clip.
- `atlas_nav.py` — navigation into Computational Basis and the posted payroll; company and role switching.
- `shotkit.py` — `capture()` writes a PNG plus the pixel rectangle of each named anchor.
- `annotate.py` — draws numbered markers and highlight rings from those anchors.
- `content.py` — all deck copy. Field-guide notes and image markers are generated from the same list, so they cannot drift apart.
- `theme.py` — palette (taken from the prototype's own CSS tokens), type scale, and the text auto-fitting used everywhere.
- `layouts.py` — the slide layouts: cover, section, field guide, screen, cards, matrix, split, stats, GIF, closing.
- `update_registers.py` — refreshes `cycle.json`, `source-register.csv` and `deck-traceability.csv`.

## Checking the result

There is no PowerPoint or LibreOffice on this machine, so `render_preview.py` reads the
generated file back with `python-pptx` and draws every shape with PIL. Font metrics differ
slightly from PowerPoint, but it reliably catches overlapping boxes, text overrunning its
frame and images placed outside their intended area. It prints one line per problem and a
count; zero or one minor entry is the expected state.
