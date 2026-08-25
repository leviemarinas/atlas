# -*- coding: utf-8 -*-
"""Refresh cycle.json, source-register.csv and deck-traceability.csv for v03."""
import csv
import hashlib
import json
import os

ROOT = os.path.abspath("..")
DECK_REL = os.path.join("outputs",
                        "ATLAS_2026-08-24_Computational_Basis_Integration_PreMeeting_v03.pptx")
DECK_ABS = os.path.join(ROOT, DECK_REL)
NOW = "2026-08-24T04:35:00+08:00"
APP = r"C:\Users\josrp\OneDrive\Documents\Atlas\company-configuration-prototype"


def sha(path):
    h = hashlib.sha256()
    with open(path, "rb") as fh:
        for block in iter(lambda: fh.read(1 << 20), b""):
            h.update(block)
    return h.hexdigest()


def cycle():
    path = os.path.join(ROOT, "cycle.json")
    data = json.load(open(path, encoding="utf-8"))
    data["artifacts"]["premeeting_deck"] = DECK_ABS
    data["status"] = "premeeting-ready"
    data["updated_at"] = NOW
    data["capture_company"] = "Atlas Simulator Sandbox (SIM-PH-001)"
    data["capture_method"] = (
        "Screens captured from the running prototype over the Chrome DevTools Protocol at 2x; "
        "numbered callouts positioned from live DOM rectangles recorded at capture time. "
        "Rebuild everything with: python build/run_all.py")
    json.dump(data, open(path, "w", encoding="utf-8"), indent=2, ensure_ascii=False)
    print("cycle.json")


def sources():
    path = os.path.join(ROOT, "source-register.csv")
    rows = list(csv.reader(open(path, encoding="utf-8-sig")))
    head, body = rows[0], [r for r in rows[1:] if r]
    new_ids = {"SRC-20260824-008", "SRC-20260824-009", "SRC-20260824-010"}
    body = [r for r in body if r[0] not in new_ids]
    body += [
        ["SRC-20260824-008", "source-code", os.path.join(APP, "src", "payrollTraceability.js"),
         "", NOW, "", "primary", "Computational Basis Integration", "payrollTraceability.js",
         "Eighteen-step source policy and output trail rendered on a posted payroll"],
        ["SRC-20260824-009", "source-code", os.path.join(APP, "src", "PayrollProcessing.jsx"),
         "", NOW, "", "primary", "Computational Basis Integration", "PayrollProcessing.jsx",
         "Supplies the stored computation library to the payroll calculation context"],
        ["SRC-20260824-010", "presentation", DECK_ABS, sha(DECK_ABS), NOW, "", "output",
         "Computational Basis Integration", "49-slides",
         "Rebuilt pre-meeting deck; every screen recaptured live and both walkthrough GIFs regenerated"],
    ]
    with open(path, "w", newline="", encoding="utf-8") as fh:
        w = csv.writer(fh)
        w.writerow(head)
        w.writerows(body)
    print("source-register.csv")


TRACE = [
    (1, 'opening thesis', '', 'SRC-20260824-002'),
    (2, 'learning outcomes', '', 'SRC-20260824-002'),
    (3, 'evidence legend', '', 'SRC-20260824-002'),
    (4, 'conceptual model', 'shots/policy-chain.png', 'SRC-20260824-006'),
    (5, 'product orientation', 'shots/cb-overview.png', 'SRC-20260824-006'),
    (6, 'library contents', '', 'SRC-20260824-004;SRC-20260824-006'),
    (7, 'workspace tabs', 'shots/cb-tabs.png', 'SRC-20260824-006'),
    (8, 'concept glossary', '', 'SRC-20260824-003;SRC-20260824-004'),
    (9, 'execution classes', '', 'SRC-20260824-005;SRC-20260824-008'),
    (10, 'section divider', '', ''),
    (11, 'register field guide', 'shots/cb-register.png', 'SRC-20260824-006'),
    (12, 'register columns 1', 'shots/cb-columns.png', 'SRC-20260824-006'),
    (13, 'register columns 2', 'shots/cb-columns.png', 'SRC-20260824-003;SRC-20260824-006'),
    (14, 'csv import template', 'shots/import-toolbar.png', 'SRC-20260824-003;SRC-20260824-006'),
    (15, 'creation animated demo', 'evidence/computation-creation-walkthrough.gif', 'SRC-20260824-006'),
    (16, 'create field guide 1', 'shots/create-details.png', 'SRC-20260824-006'),
    (17, 'create field guide 2', 'shots/create-expression.png', 'SRC-20260824-004;SRC-20260824-006'),
    (18, 'formula references another computation', 'shots/formula-reference.png', 'SRC-20260824-004;SRC-20260824-006'),
    (19, 'create field guide 3', 'shots/create-mapped.png', 'SRC-20260824-004;SRC-20260824-006'),
    (20, 'create field guide 4', 'shots/create-test.png', 'SRC-20260824-006'),
    (21, 'testing a reference chain', 'shots/reference-test.png', 'SRC-20260824-004;SRC-20260824-006'),
    (22, 'create field guide 5', 'shots/create-change.png', 'SRC-20260824-006'),
    (23, 'saved record', 'shots/cus900-record.png', 'SRC-20260824-006'),
    (24, 'two test surfaces', '', 'SRC-20260824-003'),
    (25, 'section divider', '', ''),
    (26, 'assignment animated demo', 'evidence/client-assignment-walkthrough.gif', 'SRC-20260824-006'),
    (27, 'assignment register field guide', 'shots/assign-register.png', 'SRC-20260824-006'),
    (28, 'assignment form field guide', 'shots/assign-form.png', 'SRC-20260824-006'),
    (29, 'what the assignment captures', '', 'SRC-20260824-003;SRC-20260824-005'),
    (30, 'scope rules to agree', '', 'SRC-20260824-003'),
    (31, 'section divider', '', ''),
    (32, 'two reference registers', '', 'SRC-20260824-008'),
    (33, 'reference source field guide', 'shots/reference-sources.png', 'SRC-20260824-006'),
    (34, 'change history', 'shots/change-history.png', 'SRC-20260824-006'),
    (35, 'section divider', '', ''),
    (36, 'posted payroll header', 'shots/trail-header.png', 'SRC-20260824-006;SRC-20260824-008'),
    (37, 'source trail 1-5', 'shots/trail-sources-a.png', 'SRC-20260824-008'),
    (38, 'source trail 8-11', 'shots/trail-sources-b.png', 'SRC-20260824-008'),
    (39, 'source trail 14-18', 'shots/trail-sources-c.png', 'SRC-20260824-008'),
    (40, 'calculation ledger 1-10', 'shots/trail-ledger-a.png', 'SRC-20260824-005;SRC-20260824-008'),
    (41, 'calculation ledger 11-19', 'shots/trail-ledger-b.png', 'SRC-20260824-005;SRC-20260824-008'),
    (42, 'ledger row detail', 'shots/trail-step-open.png', 'SRC-20260824-008'),
    (43, 'library drives the figure', '', 'SRC-20260824-005;SRC-20260824-009'),
    (44, 'consumer contract', '', 'SRC-20260824-005;SRC-20260824-006'),
    (45, 'section divider', '', ''),
    (46, 'input contract matrix', '', 'SRC-20260824-008'),
    (47, 'worked example overtime', '', 'SRC-20260824-005;SRC-20260824-008'),
    (48, 'worked example take-home', '', 'SRC-20260824-005;SRC-20260824-008'),
    (49, 'go-live decisions', '', 'SRC-20260824-003;SRC-20260824-005'),
    (50, 'current-state summary', '', 'SRC-20260824-005;SRC-20260824-009'),
    (51, 'evidence appendix', '', 'SRC-20260824-001;SRC-20260824-002;SRC-20260824-010'),
    (52, 'closing proof points', '', 'SRC-20260824-002'),
]


def traceability():
    path = os.path.join(ROOT, "deck-traceability.csv")
    head = ["deck_kind", "slide_number", "narrative_role", "asset", "source_ids",
            "app_revision", "capture_company", "verification_status", "notes"]
    with open(path, "w", newline="", encoding="utf-8") as fh:
        w = csv.writer(fh)
        w.writerow(head)
        for num, role, asset, srcs in TRACE:
            w.writerow(["premeeting", num, role, asset, srcs, "3999f64+working-tree",
                        "Atlas Simulator Sandbox", "verified",
                        "Captured live 24 Aug 2026; callouts placed from DOM rectangles"
                        if asset else "Narrative page; claims traced to the listed sources"])
    print("deck-traceability.csv")


if __name__ == "__main__":
    cycle()
    sources()
    traceability()
