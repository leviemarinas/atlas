# -*- coding: utf-8 -*-
"""Capture the two new capabilities: building on a published computation, and
the CSV import template.

Runs after capture_create.py, so CUS-900 already exists to reference.
"""
import time

from atlas_nav import open_computational_basis
import shotkit as sk
from shotkit import capture, span, bbox, _rect_of

M = "section.modal "


def label_rect(c, text, nth=0, scope="section.modal"):
    return c.js("""
    (() => {
      const l = [...document.querySelectorAll(%r + ' label')]
        .filter(e => (e.innerText||'').trim().split('\\n')[0] === %r)[%d];
      if (!l) return null;
      const r = l.getBoundingClientRect();
      return {x:r.x, y:r.y, width:r.width, height:r.height};
    })()""" % (scope, text, nth))


c = open_computational_basis()

# ── the import toolbar, with the template action ──────────────────────────
tool = _rect_of(c, selector="input[placeholder^='Search code']")
report = _rect_of(c, text="Download report", tag="button")
capture(c, "import-toolbar",
        clip_rect=span(tool, report, pad=20),
        anchors={
            "template": _rect_of(c, text="Download template", tag="button"),
            "import": _rect_of(c, text="Import CSV", tag="button"),
        })

# ── building an expression on a published computation ─────────────────────
c.click_text("Create computation", tag="button", settle=1.6)
c.set_input(M + "input[placeholder^='e.g.']", "CUS-910")
c.set_input(M + "input", "Overtime Value from Hourly Rate", nth=1)
c.set_input(M + "select", "Earnings", nth=0)
c.set_input(M + "textarea",
            "Values approved overtime using the published hourly rate formula rather than "
            "repeating its arithmetic.", nth=0)
c.set_input(M + ".formula-reference-row select", "BAS-002")
c.click_text("Insert computation", tag="button", settle=0.6)
c.click_text("×", tag="button", settle=0.4, exact=True)
c.set_input(M + "select", "ot_hours", nth=2)
c.click_text("Insert field", tag="button", settle=1.0)

builder = _rect_of(c, text="Expression builder", tag="*")
table = c.rect(M + "table")
picker = c.rect(M + ".formula-reference-row select")
insert = _rect_of(c, text="Insert computation", tag="button")
expr = c.rect(M + "textarea", 1)
capture(c, "formula-reference",
        clip_rect=span(builder, table, pad=18),
        anchors={
            "expression": expr,
            "picker": picker,
            "insert": insert,
            "dependency": c.js(
                "(()=>{const r=[...document.querySelectorAll('section.modal table tbody tr')]"
                ".find(t=>t.innerText.includes('BAS-002'));if(!r)return null;"
                "const b=r.getBoundingClientRect();"
                "return {x:b.x,y:b.y,width:b.width,height:b.height}})()"),
        })

# ── the test tab collecting the whole chain ───────────────────────────────
c.click_text("Test calculation", tag="button", settle=1.2)
labels = c.js("[...document.querySelectorAll('section.modal .test-input-grid label')]"
              ".map(e=>e.innerText.split('\\n')[0])")
values = {"Daily rate": "1600", "Hours per workday": "8", "Overtime hours": "10"}
for i, label in enumerate(labels):
    c.set_input(M + "input[type=number]", values.get(label, "0"), nth=i)
c.click_text("Run test", tag="button", settle=1.4)

note = _rect_of(c, text="This formula builds on")
grid = c.rect(M + ".test-input-grid")
run = _rect_of(c, text="Run test", tag="button")
capture(c, "reference-test",
        clip_rect=span(note, grid, run, pad=18),
        anchors={
            "note": note,
            "inputs": grid,
            "result": _rect_of(c, text="Formula passed"),
        })
print("TEST RESULT:", c.js(
    "(()=>{const e=document.querySelector('.test-result');return e?e.innerText.replace(/\\n/g,' '):''})()"))

# ── save it, then show the record's "Builds on" section ───────────────────
c.click_text("Change details", tag="button", settle=0.8)
c.set_input(M + "textarea", "Initial release; builds on the published hourly rate formula.", nth=0)
c.click_text("Validate and create", tag="button", settle=2.2)
c.set_input("input[placeholder^='Search code']", "CUS-910")
time.sleep(1.0)
c.click_sel("table tbody tr td:last-child button", 0, settle=1.4)
drawer = c.wait_rect(".record-drawer", timeout=8)
if drawer:
    capture(c, "reference-record",
            clip_rect=(drawer["x"] - 16, drawer["y"] + 10, drawer["width"] + 32, drawer["height"] - 20),
            anchors={
                "expression": _rect_of(c, text="Formula expression", tag="*"),
                "builds": _rect_of(c, text="Builds on", tag="*"),
                "test": _rect_of(c, text="Standard test result", tag="*"),
            })

sk.save("shots/anchors-new.json")
c.close()
print("new-feature captures done")
