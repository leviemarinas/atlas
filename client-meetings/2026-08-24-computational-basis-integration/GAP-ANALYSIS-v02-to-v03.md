# Computational Basis deck — what v02 missed, got wrong, or could not show

Review date: 24 August 2026.
Basis: the running ATLAS prototype (company *Atlas Simulator Sandbox*), posted payroll
`PR-2025-11-E2E`, and the application source.

Everything below was checked against the app or the code, not inferred from the previous deck.

---

## A. Statements in v02 that are wrong or misleading

### A1. "The payroll pipeline must explicitly resolve and invoke the code"
*v02 slides 17, 30, 42.*

The deck told the client that a saved computation does not run — that the assignment is
governance only and the runtime still has to be wired. Half of that is wrong.

**What actually happens.** `PayrollProcessing.jsx` reads the stored computation library
(`atlas-computational-basis-library-v3`) and passes it into the calculation context.
`payrollEngine.js` then resolves each step's code against that library and evaluates the
record's own expression rather than re-implementing the arithmetic. Editing a configurable
formula in Computational Basis changes the next payroll figure.

**What is genuinely missing** is narrower and more useful to say: the engine resolves codes
*directly by name*. It never reads the client-assignment register. The assignments store is
written and read only by `ComputationalBasis.jsx`. Employee group and frequency are recorded
and displayed but match nothing at run time.

v02 understated a working capability and misplaced the real gap. v03 splits the claim in two
and evidences both halves.

### A2. "ATLAS source — shows which module or register owns the value"
*v02 slide 13.*

The Mapped fields column shows the field's **display label**, not an owning module. The
approved-field palette in `computationCatalog.js` is `[token, label, sample_value]` and
carries no owner, data type, unit of measure or missing-value rule.

This matters because the deck used that column as reassurance that dependencies are already
owned. They are not. Naming the owner for each token is one of the go-live decisions.

### A3. The evidence slide had no evidence
*v02 slide 40.*

The slide cited the payroll computation trail as its source, but the image was an unreadable
sliver of a full-page screenshot. The strongest artefact in the whole product was referenced
and then not shown.

### A4. Counts and screenshots disagreed
v02 mixed captures taken before and after the demo data was created, so a slide could claim
six client assignments beside a screenshot showing a different number. v03 rebuilds every
capture in one deterministic pass from a reset workspace.

---

## B. Things the app does that v02 never mentioned

### B1. The seven-step policy chain
The Policy engines tab renders *How a payroll policy becomes a payroll result*: business
policy → company rule → policy engine → computational basis → reference tables → payroll
transaction → payroll result. It is the clearest available answer to "where does my formula
sit", and it is drawn by the product itself. v02 treated policy engines as out of scope.

### B2. The source, policy and output trail — 18 steps
A posted payroll exposes an eighteen-step audit path, each step naming the exact ATLAS screen
it read, what it read, what it produced, and the computation codes involved. Four consecutive
steps name Computational Basis by its full UI path.

### B3. The calculation-execution ledger — 19 steps
Every amount in the run names the code that produced it, restates the working in business
language, and labels the kind of step. For John Collins Doe: 19 ordered steps from
`BAS-001` to `PAY-002`, ending at net pay ₱32,762.32.

### B4. Five kinds of step, which v02 never distinguished
The ledger labels each row *configuration + computation*, *computation*, *effective
reference*, *effective table lookup*, *policy engine* or *payroll result*. The distinction
tells a finance user where to go when a number looks wrong — the formula, the table, or the
engine. It was absent.

### B5. The two registers that are easy to confuse
The trail consults *formula reference sources* (step 8, inside Computational Basis) and the
company-wide *Reference Table* module (step 9) as separate steps, deliberately. v02 used the
words interchangeably.

### B6. The size of the library
219 governed computations, 209 active, 61 approved fields, 30 reference sources, 4 policy
engines, 66 policy codes across 13 engine families. v02 never told the client that most of
what they need already exists — which changes the expected workflow from *author* to *find,
confirm, assign*.

### B7. The saved test result is not the test you ran
The record drawer's "Standard test result" is recomputed on the spot from the palette's
sample values, not from the inputs typed on the Test calculation tab. The CUS-900
demonstration makes this concrete: the tested figure was ₱2,000 (8 × ₱250); the stored record
reads ₱3,000 (20 × ₱150). Anyone treating that panel as sign-off evidence would be wrong.

### B8. Import CSV and Download report
Bulk load with per-row expression validation, and an export for review outside ATLAS. Neither
was mentioned, though both matter for a real migration.

---

## C. The honest test v02 never ran

v03 puts a real company computation through the entire setup path and reports what happened:

- CUS-900 created — admin-defined, active, version 1.0, effective 1 September 2026.
- Tested — 8 approved units × ₱250 = ₱2,000, matching the manual calculation.
- Assigned — Earnings computation · Earnings and Allowance Codes · All Employees · every
  payroll · Active.
- **It did not appear in the posted payroll.** No CUS-900 row in the 19-step ledger, and no
  employee received ₱2,000, because nothing supplies `allowance_units` or
  `allowance_unit_rate`.

That is the clearest possible statement of what "integration" means here, and it is
demonstrated rather than asserted.

---

## D. Statements in v02 that checked out

Worth recording, so the client is not left thinking everything was wrong:

- Delete **is** blocked while an active assignment points at a computation code
  (`ComputationalBasis.jsx` checks assignments before removing a record).
- Expression validation on save, and the return to Formula setup on error, behave as described.
- Effective-dated version selection by payout date is real: the trail shows statutory and tax
  table versions chosen on payout-date basis 2025-11-30.

---

## E. Why every image was recaptured

The v02 screenshots were mis-framed: cut off at the left edge, sliced through modals, with
numbered callouts pointing at blank space or at the wrong control. Several slides reused one
screenshot under three different sets of callouts that could not all be correct.

v03 captures every screen directly from the running prototype over the DevTools protocol at
2× resolution, and records the **bounding rectangle of each named field** at capture time.
The numbered markers are then drawn from those rectangles, so a marker cannot point at the
wrong thing. The two walkthrough GIFs are rebuilt from frames captured through a fixed window,
so they read as a screen recording instead of jumping between crops — and they are 427 KB and
141 KB rather than 2.7 MB and 1.4 MB.

The whole pipeline is one command, `python build/run_all.py`, and it is repeatable: the first
step resets the Computational Basis stores, so counts, screenshots and copy always agree.
