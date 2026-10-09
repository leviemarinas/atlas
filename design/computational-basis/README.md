# Computational Basis — Figma frames

Thirteen SVG frames covering the Computational Basis module, reverse-engineered from the
running prototype (`src/ComputationalBasis.jsx`, `src/PolicyComputations.jsx`,
`src/AppChrome.jsx`, `src/App.jsx`, `src/styles.css`).

## Importing into Figma

Select all thirteen `.svg` files and drag them onto the canvas together — each lands as its
own frame, side by side. Nothing is rasterised: groups, rectangles, vectors and text stay
editable.

- **Layer names** come from the `id` attributes, so you get `01 Computations` → `Toolbar`,
  `Library notice`, `Computations table`, … rather than `Group 47`.
- **Font** is Poppins (the prototype's `:root` family). Figma offers to fetch it if it is
  not installed locally; Arial is the declared fallback.
- **Spec notes** live in a group called `Notes` on most frames. Delete that group if you
  want a clean mock.
- `preview.html` renders all thirteen in a browser if you want to review them without Figma.

## Frames

| File | Screen |
| --- | --- |
| `01-computations.svg` | Computations tab — toolbar, role notice, 10-row library table, pagination |
| `02-client-assignments.svg` | Client assignments tab — six seeded assignments |
| `03-policy-engines.svg` | Policy engines tab — governance flow, policy-code library, Take-Home Pay engine + simulator |
| `04-reference-sources.svg` | Reference sources tab — 12 of the 30 source cards |
| `05-change-history.svg` | Change history tab — four audit entries |
| `06-modal-formula-setup.svg` | Formula editor, Formula setup tab (expression builder + field mapping) |
| `07-modal-test-calculation.svg` | Formula editor, Test calculation tab (passing result state) |
| `08-modal-change-details.svg` | Formula editor, Change details tab (versioning) |
| `09-drawer-computation-detail.svg` | Read-only computation drawer, built-in / locked variant |
| `10-modal-add-assignment.svg` | Add computation assignment |
| `11-modal-reference-table.svg` | Manage reference table — REF-011, the locked/derived variant |
| `12-modal-delete-computation.svg` | Delete company computation confirmation |
| `13-style-sheet.svg` | Tokens, type scale, controls, feedback states, icon set, layout rules |

Data in the frames is the prototype's real seed data: 219 computations, 209 active, 30
reference sources, 6 assignments, 66 policy codes, and the actual formula expressions.

## Fidelity notes

- **Frame width is 1600px, not 1440.** `.basis-table` sets `min-width: 980px`, and at
  1440px the content column leaves only 968px inside the table card — the library table
  would scroll horizontally. 1600px is the narrowest desktop width where every tab renders
  without a scrollbar.
- **Elevation is represented by borders.** `styles.css` lifts cards with
  `box-shadow: 0 4px 16px rgba(50,38,63,.04)`, but Figma discards SVG filters on import, so
  cards here carry their 1px border only. Add a Figma drop shadow if you need the real
  treatment.
- **Icons are simplified stand-ins.** The prototype uses `@phosphor-icons/react`; these are
  hand-traced approximations at the correct sizes and colours. Swap them for the real
  Phosphor components in Figma — the bounding boxes already match.
- **Modals sit on a flat dimmed layer** (`#1a171f` at 62%, matching `.modal-backdrop`)
  rather than over a rendered page.
- **The Policy engines frame is section-level.** Its Applicability and Deduction-hierarchy
  panels are shown as summary blocks; in the prototype both expand into full sub-forms, and
  a Deferred-recovery panel appears below the ledger while Carry forward is on. Everything
  else on that frame — governance flow, code library, engine tabs, config sections,
  simulator, ledger — is complete.
- **Role shown is Client Admin** on the tab frames (built-in formulas read-only). The
  formula editor frames show the P&A Admin path, which is the only role that can edit a
  built-in computation. Frame 01's note describes the differences.

## Two inconsistencies found while measuring

Both are in the live CSS and are mirrored faithfully in frame 12, rather than silently
corrected:

1. `.delete-computation-modal .modal-body` sets no `font-size`, so its body copy inherits
   the 16px browser default. Every other Computational Basis surface declares its own size
   (8–13px), which makes this dialog noticeably larger than its neighbours.
2. That dialog's `.modal-actions` is a direct child of `.modal` without the
   `sticky-actions` class, so it has no horizontal padding and its buttons sit flush against
   the modal's 2px border. Other modals in the module use `sticky-actions`
   (`padding: 13px 18px`).

## Regenerating

```bash
python build.py
```

- `figma_kit.py` — SVG primitives, the token table, text metrics, and the icon set.
- `chrome.py` — brand rail, company sidebar, topbar, page heading, summary cards, tab strip.
- `build.py` — one function per frame, plus the seed data each one renders.

Edit the source values (they are named after the CSS rules they come from) and re-run to
regenerate all thirteen files.
