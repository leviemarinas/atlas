# -*- coding: utf-8 -*-
"""Assemble the Part 2 deck.

Section numbering continues from Part 1, which ended at 05, so a reader holding
both decks reads one continuous document.
"""
import os
import shutil

from pptx import Presentation
from pptx.util import Inches

import content as C
from layouts import (cards, closing, cover, gif_slide, guide, matrix, screen,
                     section, split, stats)
from theme import DECIDE, DECIDE_WASH, LIVE, LIVE_WASH, VIOLET, VIOLET_2, WASH, notes

DECK = "ATLAS_Computational_Basis_Part2_What_Changed_v02"
OUT = os.path.join("..", "outputs", DECK + ".pptx")
EVIDENCE = os.path.join("..", "evidence")

prs = Presentation()
prs.slide_width, prs.slide_height = Inches(13.333), Inches(7.5)

NOTE = (
    "Presenter note: this deck continues the Part 1 walkthrough and covers what changed "
    "after the client's review. Screens were captured live from the ATLAS prototype on "
    "27 August 2026, in the Atlas Simulator Sandbox company, against posted payroll "
    f"{C.TXN}. Records, codes and amounts on screen are demonstration data — including "
    "the 8 units at PHP250 worked example carried over from Part 1.\n\n"
    "Evidence: computationGovernance.js, computationCatalog.js, computationBindings.js, "
    "applicabilityScope.js, payrollEngine.js, payrollRuns.js, ComputationalBasis.jsx, "
    "serviceModules.jsx, StandardComputationAdmin.jsx."
)


def n(slide, text=""):
    notes(slide, (text + "\n\n" if text else "") + NOTE)


def fg(key, num_fill=None):
    """A field-guide page straight from the content spec."""
    spec = dict(C.FIELD_GUIDES[key])
    spec["_key"] = key
    kwargs = {"num_fill": num_fill} if num_fill else {}
    return guide(prs, spec, **kwargs)


# ────────────────────────────────────────────────────────────────── opening
n(cover(prs, C.COVER["kicker"], C.COVER["title"], C.COVER["sub"],
        C.COVER["chips"], C.COVER["footer"]),
  "Open by naming the eight things that changed, then say the deck follows them in order.")

n(cards(prs, "What changed", "Eight changes since your review",
        "Each one came out of the review, and each has a live screen behind it in this deck.",
        C.AGENDA, cols=3, body_size=10.0,
        note="Every claim in this deck is a live screen capture or a named source file."),
  "This is the agenda. Ask which of the eight the client wants most time on.")

n(cards(prs, "How to read this deck", "How the deck is organised",
        "Most pages walk through a screen. A few set up a decision to agree in the meeting.",
        C.HOW_TO_READ, cols=3, body_size=9.8, note=C.SANDBOX),
  "Say once that amounts on screen are demonstration data, so it does not need repeating.")

n(matrix(prs, "Your review · 1 of 2", "What you asked for, and where it now lives",
         "The review items on authoring and inputs, and the change each one produced.",
         ["You asked for", "What now happens", "Shown in"],
         C.FEEDBACK_A, widths=[0.30, 0.50, 0.20],
         note="The remaining items are on the next page."),
  "Walk the left column only. The client wrote it; they will recognise it.")

n(matrix(prs, "Your review · 2 of 2", "What you asked for, and where it now lives",
         "The review items on history, protection and scope — the structural half of the change.",
         ["You asked for", "What now happens", "Shown in"],
         C.FEEDBACK_B, widths=[0.30, 0.50, 0.20],
         note="Business decisions still open are gathered near the end of the deck."),
  "These four are the ones with the largest build behind them.")

# ────────────────────────────────────────── 06 · payroll keeps its history
n(section(prs, 6, "Payroll keeps the version it ran on",
          "Part 1 ended on this question. A transaction now records the exact formula behind every amount.",
          ["The version on the line", "The snapshot", "Why it matters"]),
  "This is the most important section. Part 1 said an edit changes the next result; this is what protects the last one.")

n(split(prs, "The question from Part 1", "What happens to a payroll when the formula changes",
        "Part 1 confirmed that payroll evaluates the stored library. The open question was what that meant for a run that had already gone out.",
        ("PART 1 · THE POSITION THEN", VIOLET, WASH,
         [("Payroll read the library at run time",
           "Each step resolved its code and evaluated whatever expression the library held."),
          ("The trail named the code",
           "A ledger row proved which code produced an amount, but not which version of it."),
          ("An edit changed the next result",
           "Correct, and expected. The concern was what it meant for a result already posted.")]),
        ("PART 2 · THE POSITION NOW", LIVE, LIVE_WASH,
         [("The step records its version",
           "Every calculation step stores the version and effective date of the formula it applied."),
          ("The transaction keeps a snapshot",
           "At calculation time ATLAS stores every code applied, with its expression as it stood."),
          ("A posted run resolves its own snapshot",
           "Publish version 1.4 tomorrow and the run that used 1.3 still reads, and reproduces, 1.3.")]),
        note="Confirmed in payrollEngine.js and payrollRuns.js, and covered by the governance test suite."),
  "Say plainly: the behaviour Part 1 described was right, and this closes the gap it left.")

n(fg("fg-trail-versions"), "Point at the version chip. It is the whole change in one control.")
n(fg("fg-trail-snapshot"), "This table is the audit answer. It is captured, not derived on open.")

# ─────────────────────────────────────────────── 07 · what is now protected
n(section(prs, 7, "What can no longer be deleted",
          "Once a posted payroll has used a computation, the actions available on it change.",
          ["The register", "The reasons", "The rules"]),
  "Frame this as protection of history, not restriction of users.")

n(fg("fg-usage"), "Every code on this screen was used by the posted run, which is why every row is locked.")
n(fg("fg-protected"), "The reasons name the transaction. Nothing has to be taken on trust.")

n(matrix(prs, "The rules", "What may be edited, and what may be deleted",
         "The same rule applies to a Client Admin and a Super Admin. What decides it is payroll history, not the role.",
         ["The computation", "Can be edited", "Can be deleted", "Why"],
         C.RULES_ROWS, widths=[0.26, 0.19, 0.19, 0.36],
         note="Deactivation is stricter than deletion on purpose: it stops a code mid-cycle."),
  "The fourth row is the one to dwell on: Inactive replaces delete once payroll has used the code.")

# ──────────────────────────────────────── 08 · one standard, many companies
n(section(prs, 8, "One standard, applied per company",
          "How a standard formula reaches many companies without any of them holding a copy.",
          ["The central library", "Applicability", "The model"]),
  "This answers the largest unresolved item from the review.")

n(fg("fg-std-library"), "Note the payroll-usage column is aggregated here, because one edit would reach every company.")
n(fg("fg-applicability"), "This is the screen used during company setup, and revisited when a new standard is published.")

n(cards(prs, "The model", "How a standard reaches a company",
        "One definition, applied to selected companies, activated by each of them independently.",
        C.COMPANY_MODEL, cols=3, body_size=10.0,
        note="A company that needs different arithmetic creates its own computation rather than editing the standard."),
  "Say the phrase 'a company never holds its own copy of a standard' — it is the point of the section.")

# ────────────────────────────────────────────── 09 · authoring, revised
n(section(prs, 9, "Creating a computation, revised",
          "The same rule as Part 1, built again — with the code, the status and the inputs behaving differently.",
          ["The form", "The map fields", "The test"]),
  "Use the Part 1 example deliberately. The client already knows the business rule.")

n(fg("fg-create-details"), "Contrast with Part 1: CUS-900 typed by hand, Active on save, description required.")

n(gif_slide(prs, "Creating a computation", "The code follows the category until it is saved",
            "Changing the category regenerates the code. After the first save it is fixed, because payroll transactions print it.",
            os.path.join(EVIDENCE, "create-walkthrough.gif"),
            [("Pick the category first",
              "The category decides the code family — ERN for an earning, DED for a deduction, BEN for a benefit."),
             ("The code follows",
              "ATLAS takes the category's prefix and the first free three-digit sequence."),
             ("Then it locks",
              "From the first save the code is read-only. Nothing downstream has to cope with a code that moved."),
             ("Built, tested, then published",
              "The record is created Inactive at version 1.0, with the test evidence filed against it.")],
            path=C.BASIS + " › Computations › Create computation",
            note="Recorded from the prototype. The animation plays in slideshow view."),
  "If the GIF does not play, the four notes carry the same sequence.")

n(fg("fg-mapfields"), "This table is the answer to the owner/type/unit/timing/missing-value item.")
n(fg("fg-test"), "The evidence card is stored with the version. It is not recomputed when the record is opened.")
n(fg("fg-newrow"), "The contrast slide: nothing has used this rule, so every action is still available.")

# ──────────────────────────────────────────────── 10 · evidence and history
n(section(prs, 10, "Evidence that stays with the record",
          "Versions keep their own formula and their own proof, and the log carries the values that changed.",
          ["Version history", "The diff", "The log"]),
  "Short section, but it is what makes a formula sign-off reviewable months later.")

n(fg("fg-versions"), "Two versions, each with its own expression and its own test. This is the audit evidence.")
n(fg("fg-diff"), "The reviewer sees what the save will change before committing it.")
n(fg("fg-history"), "The same change list is written into the log, per company.")

# ────────────────────────────────────────── 11 · effective-dated and bulk
n(section(prs, 11, "Values and volume",
          "Rates that change on a date, and maintaining a register once it grows.",
          ["Reference versions", "Bulk maintenance", "Import"]),
  "Two smaller items from the review, grouped.")

n(screen(prs, "ref-card",
         {"eyebrow": "Effective-dated values",
          "title": "A reference source now carries its published versions",
          "sub": "The card shows how many versions exist, and opens the history beside the usual manage, template and upload actions.",
          "path": C.BASIS + " › Reference sources",
          "note": "Statutory sources stay linked here and maintained in Settings."},
         [("Published versions", "Every version that has been issued, not just the current one."),
          ("Versions", "Opens the full history with each version's rows."),
          ("Upload version", "Publishes a new version and keeps the one it supersedes.")]),
  "This is the card the next slide opens.")

n(fg("fg-ref-versions"), "Two versions, two effective dates, two sets of rows. Payroll picks by payout date.")

n(cards(prs, "Bulk maintenance", "Maintaining the register once it grows",
        "Filtering, selecting and moving a set of rules together, and loading a migration in one file.",
        C.BULK_CARDS, cols=3, body_size=10.0,
        path=C.BASIS + " › Computations",
        note="A bulk action reports the codes it could not move, and why, rather than skipping them silently."),
  "The import change is the one to call out: it creates records now, which it did not in Part 1.")

n(fg("fg-bulk"), "Select all applies to everything the filter returned, not only the page on screen.")

# ──────────────────────────────── 12 · binding a formula to what you pay
n(section(prs, 12, "Every payment names its formula",
          "Computational Basis holds the calculations. Services Information holds what the company pays. This is the join between them.",
          ["The register", "The binding", "On the payroll line"]),
  "Frame this as the join that was missing: the library and the payment catalogue never referred to each other.")

n(split(prs, "The join", "Two catalogues that never referred to each other",
        "The formula library and the payment configurations were each complete on their own. What was missing was the statement that connects a particular payment to a particular formula.",
        ("WHAT EACH ONE HELD", VIOLET, WASH,
         [("The library held the arithmetic",
           "A published, versioned, tested computation — but nothing saying which of the company's payments used it."),
          ("The configuration held the payment",
           "An earning or deduction with its taxability, its accounting mapping and its amount — but no formula."),
          ("The connection was in people's heads",
           "Which calculation belonged to which payment was known, agreed and written down elsewhere, but not held in the record.")]),
        ("WHAT THE RECORD HOLDS NOW", LIVE, LIVE_WASH,
         [("The payment names its formula",
           "One field on the configuration: the published computation that produces this amount."),
          ("And the source of every input",
           "Each variable in that formula is bound to where its value comes from, and the binding is stored with the record."),
          ("Payroll applies exactly that",
           "The bound formula becomes a step on the payroll line, with its code, its version and the sources it drew on.")]),
        note="Binding is optional: a configuration that binds nothing keeps the treatment it had before."),
  "The left column is not a criticism — it is what Part 1 showed working. The right column is what was added.")

n(fg("fg-bind-register"), "Two new columns. The rest of the register is exactly as the client saw it in Part 1.")
n(fg("fg-bind-step"), "This is the centre of the section. Walk the two bound rows and the resolved column.")

n(cards(prs, "The sources", "Where a variable's value can come from",
        "Four kinds of source, chosen once per variable rather than once per formula.",
        C.BINDING_SOURCES, cols=3, body_size=10.0,
        path=C.SERVICES + " › Deductions › Edit › Computation Binding",
        note="The worked example uses two of the four; the others are a field on the record and a reference-source row."),
  "The last two cards are the ones to dwell on: per variable, and checked before it saves.")

n(fg("fg-bind-drawer"), "The read-only view. This is the page to open when someone questions an amount.")
n(fg("fg-bind-trail"), "The bound step carries a version, exactly like every other step in section 06.")

# ────────────────────────────────────────────── 13 · who a rule reaches
n(section(prs, 13, "Who a rule reaches",
          "Employee group was written on several screens. It is now written once, in one vocabulary, and payroll acts on it.",
          ["One vocabulary", "Three questions", "Enforced, and reported"]),
  "This section is short. The point is singular: stated scope is now applied scope.")

n(split(prs, "Scope", "Saying who a rule covers, once",
        "Employee group appeared on more than one screen, in more than one vocabulary. Consolidating it means a group means the same thing everywhere, and the place it is written is the place that decides.",
        ("HOW SCOPE WAS DESCRIBED", VIOLET, WASH, C.SCOPE_BEFORE),
        ("HOW IT IS DESCRIBED NOW", LIVE, LIVE_WASH, C.SCOPE_AFTER),
        note="The employee groups come from the same list HRM, the policy engines and payroll all read."),
  "If asked why this matters: two records that can disagree will eventually disagree.")

n(fg("fg-bind-scope"), "The covered count is the control to point at — the scope is checkable before it is saved.")

n(cards(prs, "One place per question", "Where scope is decided",
        "Three questions, each answered in exactly one place, so there is no second record to reconcile.",
        C.SCOPE_LAYERS, cols=3, body_size=10.2,
        note="Employee groups are shared with HRM and the policy engines rather than redefined for payroll."),
  "Read the first three headings in order — they are the sequence a payroll actually resolves.")

n(fg("fg-scope-withheld"), "Info, not an error. The run completed; this is the record of a deliberate omission.")

# ─────────────────────────────────────────────────────────────── decisions
n(cards(prs, "For the meeting", "Decisions to agree before go-live",
        "These are the business decisions still open. Each one has a screen behind it in this deck.",
        C.DECISIONS, cols=3, body_size=10.0, accent=DECIDE, wash=DECIDE_WASH,
        note="The build proceeded on the defaults described here so the screens could be shown; each remains a decision to confirm."),
  "Close the meeting on this page. Agree owners and dates rather than debating each item here.")

n(cards(prs, "Summary", "What this walkthrough covered",
        "Eight changes, each shown on a live screen, so the meeting starts from the same baseline.",
        C.COVERED, cols=3, body_size=10.0, accent=LIVE, wash=LIVE_WASH,
        note=C.SANDBOX),
  "A one-minute recap if time is short.")

n(matrix(prs, "Appendix", "How this deck was prepared",
         "So the screens and the claims behind them can be checked.",
         ["Source", "What was used", "Where it appears"],
         C.APPENDIX_ROWS, widths=[0.20, 0.50, 0.30],
         note="Callout markers were placed from the element rectangles recorded when each screen was captured."),
  "Only needed if someone asks how the evidence was produced.")

n(closing(prs, "Key takeaways", C.TAKEAWAYS, C.CYCLE),
  "End here.")

# ─────────────────────────────────────────────────────────────────── save
os.makedirs(os.path.dirname(OUT), exist_ok=True)
try:
    prs.save(OUT)
    target = OUT
except PermissionError:
    target = OUT.replace(".pptx", "-NEW.pptx")
    prs.save(target)
    print("target is open in PowerPoint; staged to", target)
    print("close the deck, then run: python promote.py")
print(f"{len(prs.slides.__iter__.__self__._sldIdLst)} slides -> {target}")
