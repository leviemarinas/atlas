# -*- coding: utf-8 -*-
"""Assemble ATLAS_2026-08-24_Computational_Basis_Integration_PreMeeting_v03.pptx."""
import os

from pptx import Presentation
from pptx.util import Inches

import content as C
from layouts import cards, closing, cover, gif_slide, guide, matrix, page, screen, section, split
from theme import (DECIDE, DECIDE_WASH, LIVE, LIVE_WASH, MARK, MARK_WASH, VIOLET, VIOLET_2,
                   WASH, notes)

OUT = os.path.join("..", "outputs",
                   "ATLAS_2026-08-24_Computational_Basis_Integration_PreMeeting_v03.pptx")
EVIDENCE = os.path.join("..", "evidence")

prs = Presentation()
prs.slide_width, prs.slide_height = Inches(13.333), Inches(7.5)

NOTE = ("Presenter note: keep to the language payroll and finance teams use. For every screen, "
        "say what the user enters, where ATLAS gets the value, and what the next module does with "
        "the result. The records and amounts on screen are demonstration data.\n\n"
        "Evidence: live ATLAS prototype captured 24 August 2026; ComputationalBasis.jsx, "
        "computationCatalog.js, payrollEngine.js, payrollTraceability.js; one posted payroll "
        "transaction.")


def n(slide, text=""):
    notes(slide, (text + "\n\n" if text else "") + NOTE)


# ═══════════════════════════════════════════════════════════ 1 · orientation
n(cover(prs, "ATLAS Phase 2 · Payroll",
        "Computational Basis",
        "How a finance team writes a payroll calculation, tells ATLAS who it is for, and proves "
        "afterwards exactly how every peso was worked out.",
        ["Create", "Test", "Assign", "Prove"],
        "Finance walkthrough · every field explained · every screen captured live from the "
        "ATLAS prototype on 24 August 2026"),
  "Open by saying what the session is for: after this, a finance user should be able to open the "
  "workspace and create, test, assign and audit a computation without help.")

n(cards(prs, "Why we are here", "What you will be able to do after this session",
        "Five outcomes. The rest of the deck exists to deliver them.",
        [("Find and read any rule",
          "Open the register, filter it, and read a computation record well enough to explain the "
          "amount it produces to an auditor."),
         ("Write one correctly",
          "Create a computation with a permanent code, an approved expression, a test that a "
          "reviewer can reproduce, and a dated change note."),
         ("Say who it is for",
          "Record the business purpose, the reference table, the employee group and the frequency "
          "that together define where a rule applies."),
         ("Follow it into payroll",
          "Read the source trail and the calculation ledger on a posted payroll, and trace any "
          "amount back to the code that produced it."),
         ("Know where to go next",
          "Reach every screen in this deck by its navigation path, and come to the meeting ready "
          "to agree the five integration decisions at the end.")],
        cols=5, body_size=10.2,
        note="Every claim in this deck is either a live screen capture or a named source file."))

n(split(prs, "How to read this deck", "Two kinds of page, marked differently",
        "Most pages walk through a screen. A few set up a decision for the meeting, and those are "
        "marked so you can spot them coming.",
        ("WALKTHROUGH", VIOLET, WASH,
         [("A screen and its fields",
           "Captured live from the prototype on 24 August 2026, with numbered notes placed on the "
           "control each one describes."),
          ("A navigation path",
           "Every screen page carries the exact path to reach it, so you can open the same page "
           "in ATLAS while we talk."),
          ("Demonstration data",
           "Records, codes and amounts on screen are sample data created for this walkthrough.")]),
        ("FOR THE MEETING", DECIDE, DECIDE_WASH,
         [("A decision to agree",
           "Points where the business rule is a choice rather than a setting — scope, ownership, "
           "approval and timing."),
          ("Gathered at the end",
           "Every one of them is repeated on the 'Five decisions before go-live' page, so nothing "
           "has to be hunted for afterwards."),
          ("Owned by both sides",
           "These are choices for finance and implementation to make together before the first "
           "assignment goes Active.")]),
        note=C.SANDBOX))

n(screen(prs, "policy-chain", C.SCREENS["policy-chain"],
         [("Policy, rule, engine", "The first three moves are governance: what the company decided, who it applies to, and which approved code carries the parameters."),
          ("Basis and reference", "Computational Basis holds the controlled formula; reference tables hold the versioned values it reads."),
          ("Transaction and result", "The payroll transaction supplies the employees, the trigger and the period. Only then does an amount exist.")]),
  "This chain is the mental model for the whole session. Computational Basis is step 4 of 7 — it "
  "is deliberately narrow: it holds the formula, not the policy and not the parameters.")

n(screen(prs, "cb-overview", C.SCREENS["cb-overview"],
         [("Follow the path", "Core, then Company Configuration, then Services Information, then the Payroll tab, then Computational Basis."),
          ("One library per company", "The header confirms a controlled standard library, extended with anything this company has added."),
          ("Five tabs, one story", "Formulas, assignments, engines, sources and history sit side by side on purpose.")]))

n(cards(prs, "The shape of the library", "What is already in there before you add anything",
        "Most of what finance needs is already present as an ATLAS standard. Knowing what is "
        "there changes the usual task from authoring to selecting.",
        [("ATLAS standard formulas",
          "Basic pay and rate derivations, earnings, deductions, government contributions, tax, "
          "bonuses, benefits, retirement and separation — maintained centrally and versioned."),
         ("Company formulas",
          "Anything this company needs that the standards do not cover, created here and marked "
          "admin-defined so the two never get confused."),
         ("An approved field palette",
          "The payroll values a formula may reference, each with a fixed token and a sample "
          "value, plus any published computation you want to build on."),
         ("Reference sources",
          "Effective-dated tax and contribution tables, ceilings, premium rates and code lists, "
          "so a change of rate never means editing a formula."),
         ("Policy engines",
          "Take-home protection, deduction and loan order, caps and retirement — rules that "
          "shape a calculated result rather than produce one."),
         ("Client assignments",
          "The company's own statements of what each formula is for, who it covers and how often "
          "it applies.")],
        cols=3, body_size=10.4,
        path=C.BASIS,
        note="The usual finance task is finding the right existing formula, confirming its version, and assigning it correctly."))

for key in ["fg-tabs"]:
    spec = dict(C.FIELD_GUIDES[key], _key=key)
    n(guide(prs, spec))

n(cards(prs, "Vocabulary", "The words on these screens, in plain English",
        "Payroll and implementation use these terms differently. This is the meaning ATLAS gives them.",
        [("Computation", "A named, versioned payroll calculation. It has a code, an expression, a test and an effective date."),
         ("Computation code", "The permanent ID — CUS-900, ERN-002. Everything downstream quotes the code, never the name."),
         ("Approved field", "One of the named inputs ATLAS can supply, written in the expression as {{allowance_units}}."),
         ("Mapped field", "An approved field actually used by a formula. The formula's dependency list."),
         ("Expression", "The arithmetic itself, built only from approved fields and the operator palette."),
         ("Reference source", "An effective-dated table, rate or ceiling a formula reads instead of carrying the number inside it."),
         ("Client assignment", "The company's record of what a computation is for, who it covers and how often."),
         ("Policy engine", "A rule that shapes a result — caps it, orders it, defers it — rather than calculating an amount."),
         ("Version", "A dated copy of a rule, retained so an earlier payroll stays explainable after the rule changes.")],
        cols=3, numbered=False, body_size=10.4))

n(matrix(prs, "An important distinction", "Not every step in the ledger is a formula",
         "A posted payroll labels every step with its kind. Knowing which kind you are looking at "
         "tells you where to go when you want to change something.",
         ["Kind of step", "What it means", "Where you change it", "What it looks like"],
         [["Configuration + computation",
           "A formula whose inputs come from company or employee configuration.",
           "Computational Basis, plus the configuration screen behind it.",
           "Daily Rate — monthly salary × 12 ÷ factor days"],
          ["Computation",
           "A formula priced from transactional data such as approved time.",
           "Computational Basis; the quantity comes from the source module.",
           "Overtime Pay — approved hours × hourly rate × premium"],
          ["Effective table lookup",
           "A value read from a versioned statutory or company table.",
           "The reference source or the Settings table, not the formula.",
           "Withholding Tax — the bracket in force on the payout date"],
          ["Policy engine",
           "A rule that caps, orders or defers an amount already calculated.",
           "Policy engines, using its configurable parameters.",
           "Minimum Take-Home Pay — protect, then collect or defer"],
          ["Payroll result",
           "A total assembled from the steps above.",
           "Through its inputs — adjust a step, not the total.",
           "Gross Pay and Net Pay"]],
         widths=[0.20, 0.25, 0.26, 0.29],
         path=C.PAYROLL_LINE,
         note="Kinds and examples read from a posted payroll transaction."))

# ═══════════════════════════════════════════════════════ 2 · create a rule
n(section(prs, 1, "Create a computation",
          "From an empty form to a tested, dated, published version — every field on the way.",
          ["The register", "The five-panel form", "The saved record"]))

for key in ["fg-register", "fg-columns-a", "fg-columns-b"]:
    spec = dict(C.FIELD_GUIDES[key], _key=key)
    n(guide(prs, spec))

for key in ["fg-import-template"]:
    spec = dict(C.FIELD_GUIDES[key], _key=key)
    n(guide(prs, spec))

n(gif_slide(prs, "Demonstration", "Creating CUS-900, start to finish",
            "A company allowance valued from an approved unit count and an assigned unit rate. "
            "Watch it once here; the next five pages take it apart field by field.",
            os.path.join(EVIDENCE, "computation-creation-walkthrough.gif"),
            [("Describe the rule", "Code CUS-900, a business name, the Earnings category, and a description that states what it excludes."),
             ("Build the expression", "Insert allowance_units, apply ×, insert allowance_unit_rate. Both tokens come from the approved palette."),
             ("Test it", "8 units × ₱250 returns ₱2,000, matching the manual calculation."),
             ("Date and explain it", "Effective 1 September 2026, version 1.0, with a change note a reviewer can use.")],
            path=C.BASIS + " › Computations › Create computation",
            note="Captured live; the animation is the real prototype, not a mock-up."))

for key in ["fg-create-details", "fg-create-expression", "fg-formula-reference",
            "fg-create-mapped", "fg-create-test", "fg-reference-test",
            "fg-create-change", "fg-record"]:
    spec = dict(C.FIELD_GUIDES[key], _key=key)
    n(guide(prs, spec))

n(split(prs, "Worth knowing", "Two checks, and what each one is for",
        "ATLAS gives you a test you drive yourself and a standing check on the saved record. They "
        "answer different questions, and both are useful.",
        ("THE TEST YOU RUN", VIOLET, WASH,
         [("You choose the inputs",
           "On the Test calculation tab you supply your own values and ATLAS evaluates the draft "
           "expression with them, before anything is saved."),
          ("It answers: is my arithmetic right?",
           "The expression parses, every token resolves, and the answer can be compared with the "
           "figure finance worked out by hand."),
          ("Keep the result with your sign-off",
           "Note the inputs and the answer in your approval record, so the reviewed figure travels "
           "with the decision.")]),
        ("THE CHECK ON THE RECORD", VIOLET_2, WASH,
         [("ATLAS chooses the inputs",
           "Open a saved computation and the Standard test result evaluates the stored expression "
           "against the palette's sample values."),
          ("It answers: does this still evaluate?",
           "A standing confirmation that the published formula is healthy, available on any record "
           "at any time without setting anything up."),
          ("Use them together",
           "Your test proves the business answer; the record's check proves the published formula "
           "still runs. Neither replaces the other.")]),
        note="Both are visible on the demonstration record CUS-900."))

# ═════════════════════════════════════════════════════ 3 · assign it
n(section(prs, 2, "Assign it to the client",
          "Recording what the rule is for, who it covers and how often it applies.",
          ["The register", "The six fields", "The scope rules"]))

n(gif_slide(prs, "Demonstration", "Assigning CUS-900 to the company",
            "Six choices turn a formula in the library into a rule this company has adopted.",
            os.path.join(EVIDENCE, "client-assignment-walkthrough.gif"),
            [("Choose the purpose", "Earnings computation — what payroll is trying to calculate."),
             ("Choose the business item", "Earnings and Allowance Codes — the register that gives it context."),
             ("Choose the formula", "CUS-900, selected from the active computations in the library."),
             ("Set scope and timing", "All Employees, every payroll, Active — then save, and the new row appears at the top of the register.")],
            path=C.BASIS + " › Client assignments › Add assignment",
            note="Captured live; the counter beside the tab moves as the record saves."))

for key in ["fg-assign-register", "fg-assign-form"]:
    spec = dict(C.FIELD_GUIDES[key], _key=key)
    n(guide(prs, spec))

n(cards(prs, "What it gives you", "What the client assignment record captures",
        "One row states the company's position on a formula, in language a payroll reviewer and "
        "an auditor can both read.",
        [("The business purpose",
          "Assignment type and reference table together say what payroll is calculating and which "
          "business item it belongs to."),
         ("The formula it uses",
          "Basis of computation names the code, which is the stable link between the company's "
          "governance and the library."),
         ("Who it covers",
          "Employee group records the population the rule is meant for — all employees, or a "
          "narrower group that genuinely shares the rule."),
         ("When it applies",
          "Frequency records the business event: every payroll, monthly, quarterly, annually, or "
          "on retirement."),
         ("Whether it is in force",
          "Status separates a rule that is live from setup retained for reference."),
         ("Protection for the formula",
          "While an active assignment points at a code, ATLAS looks after that computation in the "
          "library rather than letting it be removed.")],
        cols=3, body_size=10.4,
        path=C.BASIS + " › Client assignments",
        note="An assignment is maintained in place; the formula it points at is the part that carries versions."))

n(cards(prs, "For the meeting", "Scope rules to agree before an assignment goes Active",
        "Each of these is a business rule about when two assignments may coexist. Agreeing them "
        "now is what makes the register trustworthy later.",
        [("Business purpose", "Two assignments for different earning codes sit comfortably together. Two for the same purpose and the same reference table need a decision."),
         ("Employee scope", "Decide whether All Employees sits alongside a narrower group or overrides it — and if it overrides, set the precedence order."),
         ("Frequency or event", "Two every-payroll rules for the same purpose and group need a decision. An annual rule and a per-payroll rule do not."),
         ("Effective period", "Where date ranges overlap, agree whether the later row supersedes the earlier one and how that is recorded."),
         ("Existing payroll use", "Once a payroll has used a version, amend by publishing a new effective version so the earlier evidence stands."),
         ("Who decides", "Name the owner for each rule above. A scope rule with a named owner is one that gets applied consistently.")],
        cols=3, accent=DECIDE, wash=DECIDE_WASH, body_size=10.2,
        note="These five checks form the specification for validation at the point of saving an assignment."))

# ══════════════════════════════════════════════ 4 · values outside the formula
n(section(prs, 3, "Keep the values outside the formula",
          "Rates, ceilings and tables change on their own schedule. Reference sources are how a "
          "rate change stops being a formula change.",
          ["Two registers", "Source anatomy", "Change history"]))

n(matrix(prs, "Easily confused", "Two registers with similar names, doing different jobs",
         "ATLAS separates them deliberately, and the posted payroll consults both as separate "
         "steps. Using the right name in a requirements conversation saves rework later.",
         ["", "Formula reference sources", "Reference Table"],
         [["Where it lives", "Inside Computational Basis, as its own tab.", "A Settings module, company-wide."],
          ["How to reach it", "Core › Company Configuration › Services Information › Payroll › Computational Basis › Reference sources", "Core › Reference Table"],
          ["What it holds", "The REF-0xx sources a formula reads: tax tables, contribution tables, ceilings, premium rates and code lists.", "Shared company reference values used across modules, not only by payroll formulas."],
          ["Who maintains it", "Company sources are edited here. Linked statutory sources offer 'Manage in Settings', so the standard table stays controlled.", "Maintained centrally as company reference data."],
          ["How payroll uses it", "Resolves the effective version of each named source and passes the values to the computation steps.", "Cross-checks ownership, so the same value is not duplicated in two places."]],
         widths=[0.15, 0.45, 0.40],
         note="Both appear, separately, in the source trail of a posted payroll."))

for key in ["fg-reference"]:
    spec = dict(C.FIELD_GUIDES[key], _key=key)
    n(guide(prs, spec))

n(screen(prs, "change-history", C.SCREENS["change-history"],
         [("Three kinds of change, one list", "Formula edits, reference table versions and client enablement all land here with the same shape."),
          ("Version is the link", "Each entry carries the version, which is what ties an audit question back to a specific payroll transaction."),
          ("It is the reconstruction tool", "When someone asks why November differed from October, this is the first screen to open.")]))

# ══════════════════════════════════════════════════════ 5 · the proof
n(section(prs, 4, "Proof: following it into payroll",
          "Setup is only half the story. This section opens a posted payroll and traces one "
          "employee's net pay back to the codes that produced it.",
          ["A posted run", "The source trail", "The calculation ledger"]))

for key in ["fg-trail-header"]:
    spec = dict(C.FIELD_GUIDES[key], _key=key)
    n(guide(prs, spec, num_fill=VIOLET))

n(screen(prs, "trail-sources-a", C.SCREENS["trail-sources-a"],
         [("Each step names its screen", "Every card carries the exact ATLAS path, so a reviewer can reopen the source and check the input."),
          ("Reads and produces", "The left column is what went in, the right column is what came out. No step is a black box."),
          ("Codes are stamped on", "Where a step feeds specific computations, their codes appear as chips at the foot of the card.")]))

for key in ["fg-trail-sources-b", "fg-trail-sources-c"]:
    spec = dict(C.FIELD_GUIDES[key], _key=key)
    n(guide(prs, spec, num_fill=VIOLET))

n(screen(prs, "trail-ledger-a", C.SCREENS["trail-ledger-a"],
         [("Code first", "Every row leads with the computation code, so the amount and the rule can never be separated."),
          ("Working in words", "The middle column restates the calculation in the language finance uses to check it."),
          ("Kind on the right", "The label above each amount says which of the five kinds of step produced it.")]))

n(screen(prs, "trail-ledger-b", C.SCREENS["trail-ledger-b"],
         [("Gross is a step too", "Gross pay is an explicit code rather than an implicit subtotal, so it can be pointed at in an audit."),
          ("Statutory and tax are lookups", "The government and tax steps read the table versions in force on the payout date."),
          ("Net pay closes the chain", "The final figure is the one the payslip and the company report both quote.")]))

n(screen(prs, "trail-step-open", C.SCREENS["trail-step-open"]))

n(split(prs, "The question everyone asks", "Editing a formula here changes the payroll figure",
        "Worth being exact about how that works, because it is what makes the library worth "
        "governing carefully.",
        ("HOW IT WORKS TODAY", LIVE, LIVE_WASH,
         [("Payroll reads this library",
           "When a payroll transaction is calculated, Payroll Processing loads the stored "
           "computation library and passes it into the calculation."),
          ("It evaluates the published expression",
           "Each step resolves its code, then evaluates that record's own expression against the "
           "captured inputs — the arithmetic is not written twice."),
          ("So an edit changes the number",
           "Change a configurable formula in Computational Basis and the next calculation "
           "produces a different figure, with the trail naming the same code.")]),
        ("WHAT WE CONFIRM TOGETHER", DECIDE, DECIDE_WASH,
         [("Which codes apply to whom",
           "How the client-assignment register drives selection — by purpose, employee group, "
           "frequency and effective date — is confirmed as part of integration."),
          ("Who may change a formula",
           "Agree the roles that may edit a company formula, and the review a change goes through "
           "before it becomes effective."),
          ("When a version is frozen",
           "Agree the point at which a used version stops changing and a successor is published "
           "instead.")]),
        note="Behaviour confirmed in payrollEngine.js and PayrollProcessing.jsx."))

n(cards(prs, "The consumer contract", "What makes a computation produce an amount",
        "A formula is one half of a calculation. These are the four things that have to be true "
        "for it to put a figure on a payslip — worth walking through for every new code.",
        [("A published version",
          "The computation exists in the library with an approved expression, an effective date "
          "and a status of Active."),
         ("An assignment that says where",
          "The company has recorded the purpose, the reference item, the employee group and the "
          "frequency the rule belongs to."),
         ("A step that supplies the inputs",
          "Some module — HRM, Timekeeping or a payroll register — provides a value for every "
          "mapped field the expression names."),
         ("A step that calls the code",
          "A point in the payroll workflow invokes the computation at the right moment in the "
          "run, with those values."),
         ("Then the amount appears",
          "The result is posted to the assigned code and carried into the payroll line, the "
          "payslip, the reports and the trail."),
         ("And it is explainable",
          "Because the code, the version, the inputs and the reference versions were all captured "
          "at the moment it ran.")],
        cols=3, body_size=10.2,
        note="For a brand-new company code such as CUS-900, points three and four are the integration work to plan."))

# ═══════════════════════════════════════════════════ 6 · connecting it up
n(section(prs, 5, "Connecting it to the rest of ATLAS",
          "Where each value in a formula comes from, and what two real calculations look like "
          "end to end.",
          ["The module matrix", "Overtime, in full", "Take-home protection"]))

n(matrix(prs, "The input contract", "Where the values in a formula have to come from",
         "A formula is only as good as the modules that feed it. This is the checklist to work "
         "through for every new computation.",
         ["ATLAS area", "What it supplies", "Where the trail names it", "What it affects"],
         [["HRM / Employee Masterfile",
           "Salary, pay basis, employment dates, group, status, plan membership.",
           "HRM › Benefits › Salary Information › Employee › Basic Pay",
           "Rate variables, eligibility, and which assignment should apply."],
          ["Timekeeping",
           "Approved days, hours, overtime, lates, undertime and approved unit counts.",
           "Timekeeping › Time & Attendance Summary",
           "The payable quantities that earnings and deductions are priced from."],
          ["Payroll registers",
           "Earning, deduction and loan configuration with balances and schedules.",
           "Payroll › Earning Management · Deduction Management",
           "The business items a computation is valuing."],
          ["Reference and statutory",
           "Effective-dated tables, ceilings, premium rates and code lists.",
           "Computational Basis › Reference sources; Settings › Statutory Table",
           "The rates a formula reads instead of carrying the number itself."],
          ["Payroll processing",
           "Company, population, period, cutoff and payout date.",
           "Payroll › Payroll Processing › Transaction › Computation settings",
           "Which version of every rule is the effective one."]],
         widths=[0.18, 0.24, 0.32, 0.26],
         note="Paths taken from the source trail of a posted payroll transaction."))

n(matrix(prs, "Worked example 1", "Overtime pay, from punch to payslip",
         "One computation code, four modules, and two ledger rows — because regular and rest-day "
         "overtime are priced separately.",
         ["Stage", "What happens", "In this demonstration"],
         [["Employee files", "An overtime request is raised against the real punch record.", "2 hours, plus 3.5 hours on a rest day."],
          ["Approver approves", "Only approved hours become payroll input; unapproved time is not payable.", "5.5 approved overtime hours in total."],
          ["HRM supplies the rate", "The hourly rate is derived from the company pay basis and the employee's salary.", "Monthly salary → daily rate → hourly rate."],
          ["The formula runs", "Overtime Pay evaluates hourly rate × hours × premium, once per premium band.", "1.25× on the regular hours; 1.3× on the rest-day hours."],
          ["Payroll posts it", "Both amounts land on the overtime earning line and flow into gross pay.", "Two ledger rows, each naming the same computation code."]],
         widths=[0.18, 0.44, 0.38],
         path=C.PAYROLL_LINE,
         note="Demonstration data from a posted payroll transaction."))

n(matrix(prs, "Worked example 2", "Minimum take-home pay, a policy engine at work",
         "This one calculates nothing. It looks at what has already been calculated and decides "
         "how much of it may be collected this cutoff.",
         ["Stage", "What happens", "In this demonstration"],
         [["Deductions are scheduled", "Every controllable deduction and loan amortisation for the cutoff is totalled.", "Five deduction rows and one loan row."],
          ["They are put in order", "The deduction and loan hierarchy supplies the priority, so if something gives way it is the right thing.", "Statutory never adjusted; company loans and optional deductions ranked below."],
          ["The floor is calculated", "The protected minimum is derived from the configured percentage of the applicable base.", "A protected minimum net pay for this employee."],
          ["The engine decides", "Collect in full while net pay stays above the floor; otherwise defer the lowest-priority items.", "Collected in full, with nothing deferred on this line."],
          ["Across the whole run", "The same engine deferred value for other employees in the same transaction.", "Deferred amounts are shown on the payslip with the remaining balance."]],
         widths=[0.18, 0.44, 0.38],
         path=C.BASIS + " › Policy engines › Minimum Take-Home Pay",
         note="Demonstration data from a posted payroll transaction."))

# ══════════════════════════════════════════════════════════ 7 · decisions
n(cards(prs, "For the meeting", "Five decisions to agree before go-live",
        "Each one has come up somewhere in this walkthrough. They are business choices for "
        "finance and implementation to make together.",
        [("Which step calls each code",
          "For every new company computation, name the module and the exact point in its workflow "
          "that supplies the inputs and invokes it."),
         ("Where every variable comes from",
          "For each mapped field: the owning module, data type, unit of measure, when it becomes "
          "available, and what payroll should do if it is not."),
         ("How assignment drives selection",
          "Confirm how purpose, employee group, frequency and effective date combine to decide "
          "which codes apply to an employee on a given run."),
         ("How scope rules are enforced",
          "Turn the five scope checks into validation at the point of saving an assignment, and "
          "name the owner of each."),
         ("When a version is frozen",
          "Once a payroll transaction has used a version, publish a new effective version and "
          "leave the earlier evidence untouched. Agree who enforces this."),
         ("Who approves a release",
          "Define the finance owner, the reviewer, the test evidence required, and the deployment "
          "date — for formula, assignment and reference-source changes alike.")],
        cols=3, accent=DECIDE, wash=DECIDE_WASH, body_size=10.2,
        note="Every item traces back to a screen or a page earlier in this deck."))

n(split(prs, "Summary", "What this walkthrough covered",
        "A fair reading of what we demonstrated, so the meeting starts from a shared picture.",
        ("SHOWN ON LIVE SCREENS", LIVE, LIVE_WASH,
         [("A controlled, versioned formula library",
           "Codes, expressions, effective dates, change notes and history, with ATLAS standards "
           "and company rules clearly distinguished."),
          ("A guarded authoring path",
           "An approved-field palette, expression validation, in-form testing, and protection for "
           "a code an active assignment points at."),
          ("Live execution from the library",
           "The payroll engine evaluates the stored expressions; every coded step in the ledger "
           "names the computation that produced it."),
          ("End-to-end evidence",
           "A source trail from run settings through to the employee's payslip and the company "
           "report, each step naming its screen.")]),
        ("WHAT WE TAKE INTO THE BUILD", DECIDE, DECIDE_WASH,
         [("The consumer for each new code",
           "Which workflow step supplies the inputs and calls a newly created company computation."),
          ("The input contract",
           "Owning module, data type, unit and timing for every mapped field."),
          ("Assignment-driven selection",
           "How the register decides which codes apply to an employee on a given run."),
          ("Scope validation and approval",
           "The scope checks and the release workflow that surround a change.")]),
        note="Prototype captured 24 August 2026."))

n(matrix(prs, "Appendix", "How every screen in this deck was produced",
         "So that anything here can be reproduced or challenged.",
         ["Source", "What was used", "Where it appears"],
         [["Live prototype",
           "The ATLAS local application, captured 24 August 2026 at 2× resolution directly from "
           "the running app.",
           "Every screenshot and both animated walkthroughs."],
          ["Posted payroll",
           "A semi-monthly payroll transaction, calculated, approved and posted inside the "
           "prototype using demonstration employees.",
           "The whole proof section and both worked examples."],
          ["Application source",
           "ComputationalBasis.jsx, computationCatalog.js, payrollEngine.js, "
           "payrollTraceability.js, PayrollProcessing.jsx.",
           "Every statement about behaviour that is not visible on a screen."],
          ["Demonstration data",
           "CUS-900 · {{allowance_units}} × {{allowance_unit_rate}} · 8 × ₱250 = ₱2,000.",
           "The creation and assignment walkthroughs. Sample values, not production payroll."]],
         widths=[0.18, 0.46, 0.36],
         note="Callout markers are positioned from the live screen, so every number sits on the control it describes."))

n(closing(prs, "Four things to take away",
          [("A computation is a controlled rule, not a spreadsheet cell",
            "Permanent code, approved inputs, an expression, a test, an effective date and a "
            "change note — and it can build on a rule you have already published."),
           ("The formula library drives the payroll figure",
            "The engine evaluates the published expression, and every coded step in the ledger "
            "names the computation behind it."),
           ("An assignment states the company's intent",
            "What a rule is for, who it covers and how often — the record a reviewer reads to "
            "understand why a formula applies here."),
           ("The evidence is the product",
            "The source trail and the calculation ledger are what let finance answer an audit "
            "question without reverse-engineering a payslip.")],
          "ATLAS Phase 2 · Computational Basis · pre-meeting walkthrough · 24 August 2026"))

os.makedirs(os.path.dirname(OUT), exist_ok=True)
count = len(prs.slides.__iter__.__self__._sldIdLst)

# Build beside the target and move it into place, so an open PowerPoint window
# holding the file does not lose the run's work.
staged = OUT + ".staged"
prs.save(staged)
try:
    os.replace(staged, OUT)
    print(f"saved {OUT}  ({count} slides)")
except PermissionError:
    fallback = OUT.replace(".pptx", "-NEW.pptx")
    try:
        os.replace(staged, fallback)
    except PermissionError:
        fallback = staged
    print(f"saved {fallback}  ({count} slides)")
    print(f"NOTE: {os.path.basename(OUT)} is open in another program. "
          f"Close it and rename the -NEW file over it, or re-run this script.")
