# Computational Basis · Part 2 — what changed after the client review

`outputs/ATLAS_Computational_Basis_Part2_What_Changed_v02.pptx` — 48 slides.

v02 adds sections 12 and 13, covering the computation binding and the unified
applicability model built after the deck's first pass. v01 remains in `outputs/`.

Continues the Part 1 walkthrough (`ATLAS_Computational_Basis_clean_rephrased_no_notes`,
52 slides, 24 August 2026). Section numbering picks up at 06, so the two decks read
as one document.

## What it covers

| Section | Subject |
|---|---|
| Opening | The six changes, how to read the deck, the review point by point (2 pages) |
| 06 | Payroll keeps the version it ran on — the answer to Part 1's closing question |
| 07 | What can no longer be deleted — the protection rules and their reasons |
| 08 | One standard, applied per company — the central library and applicability |
| 09 | Creating a computation, revised — generated codes, Inactive default, map fields, test evidence |
| 10 | Evidence that stays with the record — versions, the diff, the log |
| 11 | Values and volume — effective-dated reference sources, bulk maintenance |
| 12 | Every payment names its formula — binding a configuration to a published computation, and each variable to its source |
| 13 | Who a rule reaches — one applicability model, enforced by payroll and reported where it withholds |
| Closing | Decisions for the meeting, summary, appendix, takeaways |

## How it was captured

One company (**Atlas Simulator Sandbox**), one pass, one posted payroll
(**PR-2025-11-E2E**), plus a second November run (**PR-2025-11-001**) for the
binding sections. The transaction is seeded by Scenario Studio's end-to-end
journey and then walked through review, approval and posting using the app's own
buttons, because the protection rules only apply once a transaction is posted.

Rebuild everything:

```bash
python run_all.py
```

`--keep` re-uses the posted payroll and redoes the rest; `--deck` skips capture and
rebuilds the slides only. Order is fixed: `capture_seed` resets the module and posts
the payroll, `capture_create` adds ERN-007 on top of that clean state, `capture_scale`
edits it into a second version. Running out of order makes the screenshots disagree
with the copy beside them.

## Claims checked against the running app

- **Slide 15** originally said one row was "a standard payroll has not used" while
  pointing at `BAS-004`, which the posted payroll *had* used. The Settings register
  is now filtered to the rate formulas, where `ERN-006` Holiday Premium Pay is
  genuinely unused, so the locked row and the open row are a real contrast.
- **Version evidence.** Editing an expression now retires the previous version's test
  evidence, so version 1.1 cannot publish carrying the proof that version 1.0 passed.
  Found while reviewing the version-history capture; fixed in `ComputationalBasis.jsx`.
- **Drawer width.** The record drawer clipped the Version-used column and five of the
  nine map-field columns at 520px. Widened to 760px with the map-field table scrolling
  in its own frame.

## Claims checked for v02

- **The binding reaches payroll.** `PR-2025-11-001` was calculated over the bound Cash
  Advance configuration: the covered employee's line carries `DED-001 v1.0` as a step
  with the sources it drew on, and the uncovered employee's line carries the withheld
  message. Both are read back from the stored run in `build/shots/binding-run.json`
  rather than asserted from the screens.
- **A capture that scrolled photographed the wrong region.** `shotkit.capture()` passed
  viewport rectangles to a CDP clip that expects document coordinates. The two agree
  only at scroll position zero, which is why no earlier capture in this deck exposed it.
  Fixed by adding the scroll offset once, in `shotkit.py`; also corrected in the
  installed `live-prototype-deck` skill.

## Assumptions worth confirming

- The deck is a continuation, not a standalone: it does not re-tour the module.
- Demonstration figures from Part 1 (8 units × ₱250 = ₱2,000) are carried over
  deliberately so the client recognises the worked example.
- Business decisions still open are presented as an agenda on "Decisions to agree
  before go-live", with the build proceeding on the stated defaults.
- Section 12's worked example uses two of the four binding sources. The other two — a
  field on the configuration and a reference-source row — are described on the sources
  page rather than shown, because a screenshot using all four would need a contrived rule.
- Migrated configurations were deliberately left covering every employee, so enforcing
  applicability could not stop anyone being paid. Narrowing them is on the decisions page.
