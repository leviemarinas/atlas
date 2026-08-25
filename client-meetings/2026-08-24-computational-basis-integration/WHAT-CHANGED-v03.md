# Computational Basis pre-meeting deck — what changed in v03

Prepared 24 August 2026. Internal note, not a client hand-out.

Two things drove this version: the visuals needed rebuilding, and several parts of the module
were not covered at all. Everything below is either a live screen capture or was checked
against the application source.

---

## 1. Every image was recaptured

The v02 screenshots were framed by accident rather than on purpose: cut off at the left edge,
sliced through modals, with numbered callouts landing on blank space. Some slides reused a
single screenshot under three different sets of callouts, which could not all be right.

v03 captures each screen directly from the running prototype at 2× and, at the moment of
capture, records the **bounding rectangle of every named field**. The numbered markers are
drawn from those rectangles, so a marker sits on the control its note describes.

Both walkthrough GIFs were re-shot through a fixed window, so they play like a screen
recording instead of jumping between crops. They are also far lighter — 427 KB and 141 KB
against 2.7 MB and 1.4 MB — which is most of why the deck is 4.3 MB rather than 7.8 MB.

The whole pipeline is one command, `python build/run_all.py`, and it is repeatable: the first
step resets the workspace so screenshots, copy and the demonstration record always agree.
v02 mixed captures taken before and after the demo data was created, so a slide could describe
one state beside a screenshot of another.

---

## 2. Coverage that was missing

### The seven-step policy chain
The Policy engines tab draws *How a payroll policy becomes a payroll result*: business policy →
company rule → policy engine → computational basis → reference tables → payroll transaction →
payroll result. It is the clearest available answer to "where does my formula sit", and the
product draws it for us. v02 treated policy engines as out of scope.

### The source, policy and output trail
A posted payroll exposes a full audit path, each step naming the exact ATLAS screen it read,
what it read, what it produced, and the computation codes involved. Four consecutive steps
name Computational Basis by its full navigation path. v02 cited this as a source on one slide
and then showed an unreadable sliver of it.

### The calculation ledger
Every amount in the run names the code that produced it, restates the working in business
language, and labels the kind of step. Absent from v02 entirely.

### Five kinds of step
The ledger labels each row *configuration + computation*, *computation*, *effective reference*,
*effective table lookup*, *policy engine* or *payroll result*. That distinction tells a finance
user where to go when they want to change something — the formula, the table, or the engine.

### Two registers that are easy to confuse
The trail consults *formula reference sources* (inside Computational Basis) and the company-wide
*Reference Table* module as separate steps, deliberately. v02 used the terms interchangeably,
which is the kind of thing that causes rework in a requirements conversation.

### Navigation paths
Every screen page now carries the path a user follows to reach it, as a chip under the heading.
v02 gave the path once, on one slide, near the front.

### Import CSV, Download report, and delete protection
Bulk load with per-row expression validation; an export for review outside ATLAS; and the fact
that ATLAS protects a computation code while an active client assignment points at it. All
real behaviour, none of it mentioned before.

---

## 3. Two statements that needed correcting

**The formula library drives the payroll figure.** v02 said a saved computation does not run and
the pipeline still has to be wired. In fact `PayrollProcessing.jsx` loads the stored computation
library and `payrollEngine.js` evaluates each record's own expression, so editing a configurable
formula changes the next payroll calculation. v03 says this plainly and cites where to check it.

**The mapped-field "Atlas source" column** shows the approved field a token resolves to, in
business wording. v02 described it as naming the owning module. v03 describes it accurately and
puts the input contract — owning module, data type, unit, timing — where it belongs, as one of
the five decisions to agree before go-live.

---

## 4. Framing

The deck now describes what the module does and what we will agree together. It does not
catalogue what the prototype cannot yet do. Pages that set up a decision are marked "for the
meeting" and gathered on one page at the end, so the client sees an agenda rather than a
defect list.

No catalogue counts are quoted anywhere — not the number of computations, approved fields,
reference sources, policy engines or assignments. The prototype's records are sample data and
quoting them would imply a scale the client has not agreed to. Where a number carries the
teaching (the 8 × ₱250 = ₱2,000 demonstration, the overtime worked example), it is kept and
labelled as demonstration data, and the same caveat appears in every set of speaker notes.
