# -*- coding: utf-8 -*-
"""Deck copy for Part 2.

Field-guide slides declare `(anchor_key, title, note)` triples. The image
annotator and the slide builder both read this list, so a numbered marker on a
screenshot and the note beside it cannot drift apart.

Two rules for this copy:
  * every screen carries the navigation path a user follows to reach it;
  * no catalogue counts are quoted from the prototype — its records are samples.
"""

CYCLE = "ATLAS Phase 2 · Computational Basis · Part 2 · 27 August 2026"
SANDBOX = ("Screens are live captures of the ATLAS prototype. The records, codes and amounts "
           "shown are demonstration data.")

BASIS = "Core › Company Configuration › Services Information › Payroll › Computational Basis"
SERVICES = "Core › Company Configuration › Services Information › Payroll"
SETTINGS = "Settings › Standard Computation Library"
PAYROLL_LINE = "Payroll › Payroll Processing › Transaction › Employee result › How it was computed"

# The transaction every protection screen in this deck is measured against.
TXN = "PR-2025-11-E2E"

# --------------------------------------------------------------- field guides
FIELD_GUIDES = {
    "fg-trail-versions": {
        "capture": "trail-versions",
        "eyebrow": "The answer to Part 1's open question",
        "title": "Every amount now names the version that produced it",
        "sub": ("Part 1 ended on a question: if a formula is edited, what happens to the payroll "
                "that already ran? A payroll line now records the version it applied, not just the code."),
        "path": PAYROLL_LINE,
        "marks": [
            ("code", "The code, as before",
             "The governed code the step applied. This is what Part 1 showed, and it has not changed."),
            ("version", "The version, which is new",
             "The exact published version this line evaluated. Edit the formula tomorrow and this figure still points at the version that produced it."),
            ("amount", "The amount it produced",
             "Because the version travels with the step, the amount stays reproducible from the formula that was in force, not the current one."),
        ],
        "note": f"Source · the posted transaction {TXN}, first employee result.",
    },
    "fg-trail-snapshot": {
        "capture": "trail-snapshot",
        "eyebrow": "The version snapshot",
        "title": "A transaction keeps the formulas it was computed with",
        "sub": ("When a transaction is calculated, ATLAS stores every code it applied together with "
                "that code's expression and version. The transaction then explains itself from its own record."),
        "path": PAYROLL_LINE,
        "badge": 42,
        "marks": [
            ("code", "Every code applied",
             "One row per computation the run touched, whether it produced an earning, a deduction or a table lookup."),
            ("version", "The version applied",
             "Captured at calculation time. Publishing a new version later does not reach back into this transaction."),
            ("effective", "The date it was effective from",
             "Shows which dated version was in force on the payout date, so the choice can be checked rather than assumed."),
            ("owner", "Who owns the formula",
             "Separates the Atlas standards from anything the company defined itself, which decides who a change has to go through."),
            ("expression", "The expression as applied",
             "The arithmetic exactly as it stood when the run was calculated. This is the line to read out when someone asks how the figure arose."),
        ],
        "note": f"Captured at calculation time on {TXN}. Sample amounts throughout.",
    },
    "fg-usage": {
        "capture": "cb-usage",
        "eyebrow": "Delete protection",
        "title": "The register now shows what payroll has already used",
        "sub": ("A computation that has been through a payroll run stays fixed for the runs that used it. "
                "The register names those codes before anyone opens one."),
        "path": BASIS + " › Computations",
        "badge": 42,
        "marks": [
            ("usage", "Payroll usage",
             "How many transactions have applied this code, and how many of those were posted. Hover a chip to see the transaction numbers."),
            ("status", "Status",
             "Active means payroll may select it now. Inactive keeps it available to explain earlier payrolls without offering it for new work."),
            ("locked", "What the row offers",
             "View and activate stay available. Edit is replaced by a lock, and deactivate is greyed, because a posted transaction depends on this code."),
            ("kind", "Where it is maintained",
             "An Atlas standard is defined centrally and reaches this company by applicability. A company rule is maintained here."),
        ],
        "note": f"Every basic-pay code shown was applied by {TXN}, which is why each one is protected.",
    },
    "fg-protected": {
        "capture": "cb-protected",
        "eyebrow": "Delete protection",
        "title": "The record says which transactions hold it, and why",
        "sub": ("Opening a computation gives the reviewer the evidence behind the lock, in the same "
                "words the tooltip uses, so a refusal never has to be taken on trust."),
        "path": BASIS + " › Computations › View",
        "side": "right",
        "marks": [
            ("usage", "Payroll usage",
             "The transactions that applied this code, with the period and the status of each."),
            ("version", "Version used",
             "The version that transaction ran on. Read across the row to see which formula produced the amounts in it."),
            ("protected", "What is protected",
             "Each restriction with its reason and the transaction that causes it. When nothing has used the code, this section does not appear at all."),
        ],
        "note": "Delete protection now checks payroll history, not only whether an assignment exists.",
    },
    "fg-std-library": {
        "capture": "std-library",
        "eyebrow": "One standard, applied per company",
        "title": "An Atlas standard is defined once, in Settings",
        "sub": ("A standard formula exists in exactly one place. A company does not receive a copy of it — "
                "it receives a decision about whether the standard applies there."),
        "path": SETTINGS + " › P&A Admin view",
        "marks": [
            ("companies", "Companies",
             "How many companies this standard is applied to. Opening it gives the per-company view on the next page."),
            ("usage", "Payroll usage",
             "Aggregated across every company, because one edit here would reach all of them."),
            ("locked", "A standard payroll has used",
             "Edit and delete close once a posted transaction has applied the code — for a Super Admin as much as anyone."),
            ("open", "A standard payroll has not used",
             "Holiday premium, on the same screen, stays fully maintainable. The rule is payroll history, not the role signed in."),
        ],
        "note": "P&A Admin view, filtered to the rate formulas. Client Admins see this library read-only.",
    },
    "fg-applicability": {
        "capture": "std-applicability",
        "eyebrow": "One standard, applied per company",
        "title": "Choosing which companies a standard applies to",
        "sub": ("This is the company-assignment model in one screen: select the companies, and each one "
                "then activates or deactivates the standard in its own Computational Basis."),
        "path": SETTINGS + " › Companies",
        "marks": [
            ("bulk", "Apply, or withdraw",
             "Apply to every company is the usual setup case. Withdraw where unused skips any company whose payroll depends on the code."),
            ("company", "The companies on the platform",
             "One row per company. Set during company setup, and revisited whenever a new standard is published."),
            ("applied", "Applied",
             "Whether the standard reaches this company at all. Clearing it removes the code from that company's library without touching the central definition."),
            ("status", "Status in company",
             "Each company activates or deactivates independently. One company switching a standard off does not affect any other."),
            ("usage", "Payroll usage",
             "Withdrawal and deactivation are refused for a company whose payroll has already applied the code, and the refusal names the transaction."),
        ],
        "note": "Demonstration companies. Applicability is stored per code, per company.",
    },
    "fg-create-details": {
        "capture": "create-details",
        "eyebrow": "Creating a computation",
        "title": "The same rule as Part 1, with three fields behaving differently",
        "sub": ("This is the allowance from Part 1, built again. The code, the status and the description "
                "have all changed how they work."),
        "path": BASIS + " › Computations › Create computation › Formula setup",
        "side": "right",
        "marks": [
            ("code", "Generated, not typed",
             "Derived from the category and the next free sequence, then locked. Part 1 had you invent CUS-900; this is ERN-007."),
            ("name", "Computation name",
             "Unchanged. Name the amount being calculated, in the words Finance reviews it in."),
            ("category", "Category is controlled",
             "The list comes from the Computation Category reference table, so a category is governed like any other reference value."),
            ("status", "It starts Inactive",
             "A rule under construction is not selectable by payroll. Somebody activates it once it has been reviewed."),
            ("description", "Description is optional",
             "Still the best place to record what the rule includes and excludes, but it no longer blocks a save."),
        ],
        "note": "Demonstration record ERN-007, Variable Allowance by Approved Units.",
    },
    "fg-mapfields": {
        "capture": "create-mapfields",
        "eyebrow": "Map fields",
        "title": "Every input now declares where it comes from",
        "sub": ("Part 1 showed the token, its kind and a sample value. The five columns the meeting asked "
                "for are the contract between this formula and the module that supplies each value."),
        "path": BASIS + " › Computations › Create computation › Formula setup",
        "badge": 42,
        "marks": [
            ("owner", "Owner / source module",
             "Which part of ATLAS produces this value at run time — the masterfile, timekeeping, a reference source, a statutory table, or another computation."),
            ("datatype", "Data type",
             "Currency, decimal, integer or rate. It decides how the value is read and how it should be rounded."),
            ("unit", "Unit",
             "Pesos, hours, minutes, days, units or a multiplier. Two numbers of the same type still only combine when their units agree."),
            ("timing", "Timing",
             "When the value is resolved: effective on the payout date, per cutoff, year to date, or computed inside this run."),
            ("missing", "If the value is missing",
             "What payroll does when the owning module supplies nothing. Treated as zero, or required and the run stops — the distinction the meeting asked to settle per field."),
        ],
        "note": "Every approved field in the palette carries all five, not only the ones shown here.",
    },
    "fg-test": {
        "capture": "create-test",
        "eyebrow": "Test evidence",
        "title": "The test result is kept, not recalculated later",
        "sub": ("Part 1 ran the test and showed the answer. The evidence is now stored against the version "
                "you publish, so a reviewer reads what was tested rather than a fresh sample."),
        "path": BASIS + " › Computations › Create computation › Test calculation",
        "side": "right",
        "marks": [
            ("inputs", "One input per mapped field",
             "Unchanged. Use values a reviewer can verify by hand — here, eight approved units at ₱250."),
            ("expected", "Expected result",
             "New, and optional. State the amount you expect and ATLAS records Passed or Failed against it instead of only the figure it produced."),
            ("result", "The run",
             "Evaluates the draft. It does not save the record, create payroll, or touch any employee."),
            ("evidence", "The evidence that is stored",
             "Inputs, expected amount, actual amount, result, who tested it and when. This is filed with the version, and shown against it afterwards."),
        ],
        "note": "In this demonstration · 8 units × ₱250 = ₱2,000, matching the manual check.",
    },
    "fg-newrow": {
        "capture": "cb-newrow",
        "eyebrow": "Company-defined computations",
        "title": "A rule nothing has used stays fully editable",
        "sub": ("The protections are about payroll history, not about locking the library. A company rule "
                "no transaction has touched can still be changed or removed."),
        "path": BASIS + " › Computations",
        "marks": [
            ("code", "Generated code",
             "ERN-007, from the Earnings category. It sorts and reads beside the Atlas earnings standards."),
            ("kind", "Company-defined",
             "Created for this company and maintained here, unlike an Atlas standard."),
            ("status", "Inactive on creation",
             "It was created Inactive. Nothing selects it for payroll until somebody activates it."),
            ("usage", "Not used yet",
             "No payroll transaction references it, which is what keeps the next column open."),
            ("actions", "Every action available",
             "View, activate, edit and delete. Compare this row with the protected standards shown earlier."),
        ],
        "note": "Demonstration record created during this walkthrough.",
    },
    "fg-versions": {
        "capture": "cb-versions",
        "eyebrow": "Version history",
        "title": "Each version keeps its formula and its proof",
        "sub": ("Editing the rule published version 1.1 and left 1.0 intact. Both versions carry the "
                "expression they published and the test that was run against it."),
        "path": BASIS + " › Computations › View › Version history",
        "marks": [
            ("current", "The current version",
             "Its expression, the change note, who published it and when, what changed against the version before it, and the test evidence recorded for this formula."),
            ("previous", "The version it replaced",
             "Kept in full, with its own expression and its own evidence. This is what a payroll computed before the change still resolves against."),
        ],
        "note": "Editing the expression retires the earlier test, so each version publishes with proof of the formula it contains.",
    },
    "fg-diff": {
        "capture": "cb-diff",
        "eyebrow": "Change history",
        "title": "You see what the save will change before you make it",
        "sub": ("Change details now compares the draft against the published record and lists the fields "
                "that will move, with their values on both sides."),
        "path": BASIS + " › Computations › Edit computation › Change details",
        "marks": [
            ("field", "The fields tracked",
             "Expression, status, effective date, name, category and description. A change to any of them is recorded."),
            ("before", "Before",
             "The value on the published record, as payroll would resolve it until this save goes through."),
            ("after", "After",
             "The value the draft will publish. The same list is written into change history when you save."),
        ],
        "note": "Demonstration edit: adding a rest-day premium and moving the effective date.",
    },
    "fg-history": {
        "capture": "cb-history",
        "eyebrow": "Change history",
        "title": "The log records the change, not only that something changed",
        "sub": ("Part 1's history gave the item, action, version, user and date. It now carries the "
                "before and after values on the same entry."),
        "path": BASIS + " › Change history",
        "marks": [
            ("head", "What was changed",
             "The code and name of the record, and the kind of thing it is — a computation, an assignment or a reference source."),
            ("diff", "Before and after",
             "Each changed field with its previous and new value, so an edit can be reconstructed without opening the record."),
            ("stamp", "Who, when, which version",
             "The actor, the timestamp and the version the change produced — the three facts an audit asks for."),
        ],
        "note": "Entries are recorded per company. Reference source versions and activations appear in the same list.",
    },
    "fg-bulk": {
        "capture": "cb-bulk",
        "eyebrow": "Bulk maintenance",
        "title": "Filter, select, and move a set of rules together",
        "sub": ("Filtering the register down and acting on what the filter found, which is how the "
                "register is maintained once a company has more than a handful of rules."),
        "path": BASIS + " › Computations",
        "marks": [
            ("bar", "Act on the selection",
             "Activate or deactivate everything selected. Anything a payroll transaction holds is reported by code rather than skipped silently."),
            ("selectall", "Select all filtered",
             "Selects every row the current search and filters return, not only the page on screen."),
            ("rowbox", "Select individually",
             "Pick specific rules out of the filtered set when only some of them are moving."),
        ],
        "note": "Bulk import also creates records now, not only updates: see the next page.",
    },
    "fg-ref-versions": {
        "capture": "ref-versions",
        "eyebrow": "Effective-dated values",
        "title": "A new rate does not overwrite the old one",
        "sub": ("Publishing a new version of a reference source keeps the version it supersedes, so a "
                "payroll computed under the old ceiling still resolves the old ceiling."),
        "path": BASIS + " › Reference sources › Versions",
        "marks": [
            ("current", "The current version",
             "Effective from its own date, with the rows as they now stand. Payroll uses this for any payout date on or after that date."),
            ("previous", "The version it replaced",
             "Kept with its own rows and its own effective date. A payout date before the change still resolves these values."),
        ],
        "note": "Demonstration: a De Minimis ceiling republished with a January effective date.",
    },
}

FIELD_GUIDES.update({
    # ------------------------------------- 12 · binding a formula to a payment
    "fg-bind-register": {
        "capture": "bind-register",
        "eyebrow": "The join that was missing",
        "title": "Each thing you pay now names the formula behind it",
        "sub": ("Computational Basis says what a calculation is. This register says what the company "
                "pays. Two new columns connect them: who a deduction reaches, and which published "
                "formula produces its amount."),
        "path": SERVICES + " › Deductions",
        "marks": [
            ("scope", "Who it applies to",
             "The employees this configuration reaches. Payroll applies it to those employees and to nobody else."),
            ("bound", "The formula that computes it",
             "The published computation this deduction runs. Open the row to see where each of that formula's inputs comes from."),
            ("unbound", "Or no formula at all",
             "A configuration that binds nothing keeps the treatment it had before. Binding is something you add where it earns its place."),
        ],
        "note": "Cash Advance is bound here; the rest of the register is left as it was.",
    },
    "fg-bind-scope": {
        "capture": "bind-scope",
        "eyebrow": "Applicability",
        "title": "One way of saying who a rule covers",
        "sub": ("The same four choices the policy engines already use — everybody, an employee group, "
                "a department, or named individuals — now sit on the payroll configurations too, and "
                "payroll honours them."),
        "path": SERVICES + " › Deductions › Edit › Deduction Details",
        "marks": [
            ("kind", "How to describe the group",
             "Everybody, an employee group, a department, or a list of named people. Choose the smallest description that genuinely shares the rule."),
            ("group", "Which one",
             "The employee groups come from the same list HRM and the policy engines read, so a group means the same thing everywhere."),
            ("count", "How many that reaches",
             "The count updates as you choose, so the scope can be checked against the roster before it is saved rather than after a payroll runs."),
            ("hint", "What it will do",
             "States the consequence in a sentence: payroll applies this configuration only to the employees it covers."),
        ],
        "note": "Seven of the sandbox company's employees fall in this group.",
    },
    "fg-bind-step": {
        "capture": "bind-step",
        "eyebrow": "Variable binding",
        "title": "Every input in the formula gets a stated source",
        "sub": ("Picking a formula raises the question the review kept returning to: where does each "
                "value come from? Each variable is answered here, and the answer is stored with the "
                "configuration."),
        "path": SERVICES + " › Deductions › Edit › Computation Binding",
        "badge": 42,
        "marks": [
            ("formula", "The formula, as published",
             "The expression, its version and its effective date, shown from the library rather than retyped here."),
            ("runtime", "A value payroll produces",
             "The daily rate comes from the employee's own salary record while the run computes, so each person is priced on their own rate."),
            ("fixed", "A value this configuration decides",
             "The number of days is a property of this deduction, not of the employee, so it is set once here."),
            ("resolved", "What each one resolves to",
             "The figure each source currently yields, so a binding can be read rather than inferred."),
            ("preview", "The amount, before you save",
             "Runs the formula against sample values so the configuration can be checked without waiting for a payroll."),
        ],
        "note": "Two of the four sources are in use here; the others are a configuration field and a reference-source row.",
    },
    "fg-bind-drawer": {
        "capture": "bind-drawer",
        "eyebrow": "The record, as a reviewer reads it",
        "title": "The binding is part of the record, not a setting behind it",
        "sub": ("Opening the configuration shows the formula and every variable with the source that "
                "feeds it — the page to read when someone asks why a deduction came out as it did."),
        "path": SERVICES + " › Deductions › View",
        "marks": [
            ("expression", "The formula and its version",
             "Named and dated, so the reviewer knows which published version this configuration is bound to."),
            ("source", "The kind of source",
             "Payroll runtime, this configuration, a reference source, or a fixed value. Four kinds, one per variable."),
            ("boundto", "The source itself",
             "Which module produces it, which field on this record, or which row of which reference source."),
            ("value", "What it resolves to now",
             "Today's figure for each input, so the record can be checked without opening a payroll."),
        ],
        "note": "The same table the editor shows, in read-only form.",
    },
    "fg-bind-trail": {
        "capture": "bind-trail",
        "eyebrow": "On the payroll line",
        "title": "A bound amount explains itself like any other",
        "sub": ("The configuration's formula becomes a step on the payroll trail, carrying the code, the "
                "version, the sources it drew on and the amount it produced."),
        "path": PAYROLL_LINE,
        "badge": 42,
        "marks": [
            ("codever", "The code, and its version",
             "The governed computation and the exact version it applied — so a bound amount stays reproducible after the formula moves on, like every step in section 06."),
            ("detail", "Where each input came from",
             "The step names the source of every variable, so the figure can be traced back through the configuration to the modules that fed it."),
            ("amount", "The amount",
             "Produced by evaluating the published formula, not by an amount typed beside the deduction."),
        ],
        "note": "The employee's own daily rate, so this figure differs per person by design.",
    },
    "fg-scope-withheld": {
        "capture": "scope-withheld",
        "eyebrow": "Applicability, enforced",
        "title": "An employee outside the group is told about, not skipped",
        "sub": ("The same configuration, the same payroll run, a different employee. Because he is not "
                "in the group it covers, the deduction did not apply — and the run says so rather than "
                "leaving a silent gap."),
        "path": "Payroll › Payroll Processing › Transaction › Exceptions",
        "marks": [
            ("who", "Who it concerns",
             "Named on the transaction's own exception register, beside everything else the run wants a human to look at."),
            ("reason", "Why it did not apply",
             "Names the configuration and the group it covers, so the omission can be confirmed as intended rather than investigated as a fault."),
        ],
        "note": "Info, not an error: nothing went wrong, and the run completed.",
    },
})

# ------------------------------------------------------------------ narrative
COVER = {
    "kicker": "ATLAS PHASE 2 · PAYROLL · PART 2",
    "title": "Computational Basis",
    "sub": ("What changed after your review: how payroll keeps its history, what can no longer be "
            "deleted, how one standard formula reaches many companies, and how each thing you pay "
            "now names the formula behind it and the people it reaches."),
    "chips": ["1  Protect", "2  Govern", "3  Version", "4  Bind", "5  Scope"],
    "footer": "Continues the Part 1 walkthrough · prototype screens captured on 27 August 2026",
}

AGENDA = [
    ("Payroll keeps the version it ran on",
     "Part 1 left this open. A transaction now records the exact formula version behind every amount, and keeps resolving it after the formula moves on."),
    ("Used rules stop being editable",
     "Once a posted payroll has applied a computation, edit and delete close — for the Super Admin too. Inactive replaces delete."),
    ("One standard, applied per company",
     "An Atlas standard is defined once and applied to selected companies. No company holds its own copy of a standard formula."),
    ("Codes, status and categories",
     "Codes are generated from the category, new rules start Inactive, and the category list is a controlled reference table."),
    ("Evidence that stays with the record",
     "Test results are stored against the version they tested, and change history carries the before and after values."),
    ("Values that change on a date",
     "Reference sources keep every published version, and payroll resolves the one effective on its payout date."),
    ("Each payment names its formula",
     "An earning, deduction, bonus or loan says which published computation produces its amount, and where each input in that formula comes from."),
    ("And names who it reaches",
     "Applicability is stated once, in one vocabulary, and payroll applies a rule only to the employees it covers."),
]

HOW_TO_READ = [
    ("Continues Part 1",
     "This deck assumes the Part 1 walkthrough. It covers what changed after your review rather than repeating the module tour."),
    ("Walkthrough",
     "Screens captured from the running prototype on 27 August 2026, with numbered callouts on the controls they describe."),
    ("Navigation path",
     "Every screen page carries the path needed to reopen it in ATLAS."),
    ("For the meeting",
     "A few pages carry decisions to agree together. They are marked, and gathered again at the end."),
    ("Demonstration data",
     "Records, codes and amounts are samples from the prototype, including the worked example carried over from Part 1."),
    ("One company, one pass",
     f"Every screen comes from the same sandbox company and the same posted transaction, {TXN}."),
]

# The feedback register, as a matrix. Left column is the client's words.
# Split across two pages: nine rows on one slide compresses each row until
# the wording is unreadable at the back of a meeting room.
FEEDBACK_ROWS = [
    ("Computation code should follow the category",
     "Generated from the category and the next free sequence — ERN-007 for an earning, DED-004 for a deduction — then locked.",
     "Creating a computation"),
    ("A new rule should start inactive",
     "New computations are created Inactive, in the company and central libraries alike, and are activated deliberately.",
     "Creating a computation"),
    ("Description should be optional",
     "Description no longer blocks a save. It stays the recommended place to record inclusions and exclusions.",
     "Creating a computation"),
    ("Categories should come from a reference table",
     "The Computation Category reference table owns the list and the code prefix each category generates.",
     "Creating a computation"),
    ("Map fields need owner, type, unit, timing and missing-value",
     "All five are declared for every approved field, and shown on the map-field table and the record view.",
     "Map fields"),
    ("Payroll must keep the version it used",
     "Each step records its version; the transaction stores a snapshot of every formula it applied and resolves through it.",
     "Historical protection"),
    ("Deletion should close once a code has been used",
     "Edit and delete close on posted usage; deactivation closes on any linked transaction. Version history blocks deletion.",
     "Delete protection"),
    ("Computations should be company-scoped",
     "Computations, assignments, reference sources, versions and history are all stored per company.",
     "Company scope"),
    ("Reference sources should keep old versions",
     "Every published version is retained with its own effective date, and payroll resolves by payout date.",
     "Effective-dated values"),
]

FEEDBACK_A = FEEDBACK_ROWS[:5]
FEEDBACK_B = FEEDBACK_ROWS[5:]

RULES_ROWS = [
    ("Atlas standard, in a company",
     "Activate or deactivate only",
     "Never",
     "Formula changes belong to Settings. The company decides whether the standard applies and whether it is on."),
    ("Atlas standard, in Settings",
     "While no posted transaction has used it",
     "While no posted transaction has used it",
     "One central definition. Once payroll has applied it, publish a new version instead."),
    ("Company-defined, unused",
     "Yes",
     "Yes",
     "Nothing depends on it yet, so it can be corrected or removed outright."),
    ("Company-defined, used by a posted payroll",
     "No — publish a new version",
     "No — set it Inactive",
     "The historical transaction must keep resolving the version it ran on."),
    ("Anything linked to an open transaction",
     "Yes",
     "No",
     "Deactivation is refused while any non-cancelled transaction references the code."),
    ("Anything with published version history",
     "Yes",
     "No",
     "Earlier payrolls resolve against those versions, so the code is retired rather than deleted."),
]

COMPANY_MODEL = [
    ("Defined once",
     "An Atlas standard formula exists in exactly one record, in Settings. Nothing copies it into a company."),
    ("Applied to companies",
     "During company setup, a Super Admin selects which companies a standard applies to. It can be revisited at any time."),
    ("Activated per company",
     "Each company switches the standards applied to it on or off in its own Computational Basis, without affecting any other company."),
    ("Customised by variant",
     "A company that needs different arithmetic creates its own computation rather than editing the standard, so the standard stays one definition."),
    ("Scoped storage",
     "Computations, assignments, reference sources, versions and change history are all held per company."),
    ("Protected by usage",
     "Withdrawing or deactivating is refused where that company's payroll already applied the code, and the refusal names the transaction."),
]

BULK_CARDS = [
    ("Select what the filter found",
     "Search and filter the register, then select every row the filter returned — not only the page on screen."),
    ("Move a set together",
     "Activate or deactivate the whole selection in one action, with the codes that could not move reported by code and reason."),
    ("Import creates as well as updates",
     "A row whose code exists updates that computation. A row whose code is new — or blank — creates one, generated from its category."),
    ("New rows arrive Inactive",
     "Imported records are created Inactive so a migration can be reviewed before any of it computes."),
    ("Standards stay as they are",
     "A company import leaves every Atlas standard untouched, and reports those rows as unchanged rather than passing over them in silence."),
    ("The template matches the importer",
     "Download template carries the real headers, rows from this company, and a commented key of every category, status and approved field."),
]

DECISIONS = [
    ("Owner and fallback per field",
     "The map-field table now declares owner, type, unit, timing and missing-value for every approved field. Confirm those defaults against how your source modules actually behave."),
    ("Which companies get which standards",
     "Applicability defaults to every company. Decide whether that is right at go-live, or whether standards should be applied selectively per client."),
    ("Approval before activation",
     "Today a rule is validated, tested and then activated. Confirm whether that is enough, or whether Draft → For Approval → Active is required."),
    ("Timekeeping and Computational Basis",
     "Timekeeping produces the quantities; Computational Basis prices them. Confirm the boundary for absences, lates, undertime and approved overtime."),
    ("Where company Computational Basis lives",
     "It sits under Services Information, with the standard library in Settings. Confirm that split, or move the company view."),
    ("Reference source ownership",
     "Statutory sources are maintained in Settings and read here. Confirm who publishes a new version of each company-owned source, and on what notice."),
    ("Which payments to bind first",
     "Binding is optional and added where it earns its place. Agree which earnings and deductions should be computed from a formula at go-live, and which stay a fixed amount."),
    ("The scope each configuration starts on",
     "Existing records were carried over covering every employee, so nothing stopped being paid. Agree which of them should be narrowed, and to what."),
]

COVERED = [
    ("Payroll history is protected",
     "Every step records its version, and a transaction resolves the snapshot it captured rather than the current library."),
    ("Protection is provable",
     "The register, the record view and the Settings library all name the transactions that hold a code, and refuse with a reason."),
    ("One standard, many companies",
     "A standard is defined once and applied per company, with each company controlling activation independently."),
    ("Authoring is governed",
     "Category-driven codes, Inactive on creation, controlled categories, optional description, and map fields that declare their contract."),
    ("Evidence stays with the record",
     "Test evidence is filed against the version it tested; change history carries before and after values."),
    ("Values are effective-dated",
     "Reference sources keep every published version, and payroll resolves the version in force on the payout date."),
    ("Payments are bound to formulas",
     "A configuration names the computation that produces its amount and the source of every variable that computation needs."),
    ("Scope is stated once and applied",
     "One applicability model across the policy engines and the payroll configurations, enforced by the run and reported where it withholds."),
]

APPENDIX_ROWS = [
    ("Live prototype",
     "The ATLAS local application, captured on 27 August 2026 from the running build.",
     "Every screenshot and the animated walkthrough."),
    ("Posted payroll",
     f"{TXN}, a semi-monthly run calculated, reviewed, approved and posted in the prototype through its own workflow.",
     "The version snapshot, and every payroll-usage figure."),
    ("Application source",
     "computationGovernance.js, computationCatalog.js, computationBindings.js, applicabilityScope.js, payrollEngine.js, payrollRuns.js, ComputationalBasis.jsx, serviceModules.jsx.",
     "The rules described on the protection, company-scope, binding and applicability pages."),
    ("A second payroll",
     "PR-2025-11-001, a November run calculated over the bound configuration so the same rule could be seen applying to one employee and withheld from another.",
     "The bound payroll step and the exception register."),
    ("Automated checks",
     "The prototype's test suite, including a governance suite covering delete protection, company isolation and version resolution.",
     "Confirmation that the rules hold outside the screens shown."),
]

TAKEAWAYS = [
    ("Payroll explains itself from its own record",
     "A transaction stores the version and expression behind every amount, so an earlier payroll stays reproducible after the formula changes."),
    ("Use closes the door, not the role",
     "What may be edited or deleted depends on whether a posted payroll applied the code — the same rule for a Client Admin and a Super Admin."),
    ("A standard is one record",
     "Defined centrally, applied to selected companies, activated by each. No company holds its own copy."),
    ("A payment names its formula and its inputs",
     "An earning or deduction says which computation produces its amount and where each variable comes from, and payroll applies exactly that."),
    ("Scope is stated once, and honoured",
     "Who a rule covers is said in one place, in one vocabulary, and payroll withholds the rule from anyone outside it — visibly."),
]

# ------------------------------------------------- 12 · binding and scope
# The four places a bound variable may draw a value from. Kept as cards rather
# than crammed into one screenshot: only two are in use in the worked example,
# and a slide that showed all four at once would need a contrived configuration.
BINDING_SOURCES = [
    ("Payroll runtime",
     "The module that owns the value supplies it while the run computes — the salary record, the timekeeping punches, or an earlier step of the same payroll."),
    ("This configuration",
     "A number set on the record itself: the default amount, a rate, a factor. Use it where the value belongs to the payment rather than the person."),
    ("Reference source",
     "A row of a formula reference source, read at the version effective on the payout date, so a rate change on a date reaches every configuration that cites it."),
    ("Fixed value",
     "A constant that belongs to this configuration alone. The plainest option, and the right one where the number is genuinely a property of this rule."),
    ("Chosen per variable",
     "The choice is made once for each input, not once for the formula, so a single calculation can draw on several modules at the same time."),
    ("Checked before it saves",
     "A variable left unanswered stops the save and names itself, rather than resolving to nothing and quietly producing a smaller amount."),
]

# Where scope is declared, and where it decides something. The point of the
# section is that these are now the same list.
SCOPE_LAYERS = [
    ("The transaction decides who is in the run",
     "Payment mode, employment status and the included list settle which employees the payroll covers at all."),
    ("The register decides who carries an item",
     "An earning or deduction is assigned to a named employee for a period, with its own amount and balance."),
    ("The configuration decides who it can reach",
     "Applicability narrows a rule to a group, a department or named people. Payroll applies it inside that scope and withholds it outside."),
    ("A one-off answers to none of them",
     "An amount encoded directly on a transaction, or a loan already on schedule, is an instruction rather than a rule. It is never withheld."),
    ("The groups come from one list",
     "Employee groups are read from the same place HRM, the policy engines and payroll all read, so a group means the same thing in each of them."),
    ("Existing records start unrestricted",
     "Configurations carried over from before cover every employee, so nothing stopped being paid on the day this arrived. Narrowing is a deliberate act."),
]

SCOPE_BEFORE = [
    ("Group appeared on several screens",
     "The configurations, the assignments and the policy engines each carried their own way of describing an employee group."),
    ("Only some of them decided anything",
     "The transaction, the registers and the policy engines were read by payroll. The configuration and assignment fields were recorded but never consulted."),
    ("Two records could disagree",
     "Nothing stopped a configuration saying one thing and the register another, with only one of them affecting the payroll."),
]

SCOPE_AFTER = [
    ("One vocabulary",
     "Everybody, an employee group, a department, or named individuals — the same four choices, reading from the same employee groups, everywhere."),
    ("Three places, three questions",
     "Who is in the run, who carries the item, and who the rule can reach. Each question is answered in exactly one place."),
    ("Stated scope is applied scope",
     "What the configuration says is what payroll does, and where a rule is withheld the transaction records which employee and why."),
]

# Screens used without numbered markers: they carry their meaning without one.
PLAIN = ["cb-notice", "ref-card"]
