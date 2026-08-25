"""Capture client assignments (incl. GIF frames), reference sources, change
history, the policy chain and the saved CUS-900 record drawer."""
import os
import shutil
import time

from atlas_nav import open_computational_basis
import shotkit as sk
from shotkit import capture, span, bbox, _rect_of

GIF = "gif-assign"
shutil.rmtree(GIF, ignore_errors=True)
os.makedirs(GIF, exist_ok=True)
seq = [0]
# The assignment dialog and the register row it produces share one window, so
# saving reads as the same screen updating rather than a cut to a new crop.
GIF_CLIP = (384, 150, 1204, 800)
LAST = {"clip": GIF_CLIP}


def frame(c, hold=1, clip=None):
    box = clip or GIF_CLIP
    for _ in range(hold):
        seq[0] += 1
        c.shot(os.path.join(GIF, f"f{seq[0]:03d}.png"), clip=box)


def label_rect(c, text, nth=0, scope=".modal"):
    return c.js("""
    (() => {
      const l = [...document.querySelectorAll(%r + ' label')]
        .filter(e => (e.innerText||'').trim().split('\\n')[0] === %r)[%d];
      if (!l) return null;
      const r = l.getBoundingClientRect();
      return {x:r.x, y:r.y, width:r.width, height:r.height};
    })()""" % (scope, text, nth))


def close_overlay(c):
    c.js("(()=>{const b=[...document.querySelectorAll('.modal button')]"
         ".find(e=>e.innerText.trim()==='Close'||e.innerText.trim()==='Cancel');"
         "if(b) b.click();})()")
    time.sleep(0.8)


c = open_computational_basis()

# --------------------------------------------------------- 1. policy chain
c.click_text("Policy engines", tag="button", settle=1.8)
chain_top = _rect_of(c, text="How a payroll policy becomes a payroll result")
chain_last = _rect_of(c, text="The calculated, traceable outcome")
capture(c, "policy-chain", clip_rect=span(chain_top, chain_last, pad=28))

# ------------------------------------------------------ 2. reference sources
c.click_text("Reference sources", tag="button", settle=1.8)
head = _rect_of(c, text="Maintain formula reference sources")
grid = c.rect(".reference-grid")
card = c.js("(()=>{const g=document.querySelector('.reference-grid');if(!g)return null;"
            "const r=g.children[0].getBoundingClientRect();"
            "return {x:r.x,y:r.y,width:r.width,height:r.height}})()")
capture(c, "reference-sources",
        clip_rect=(grid["x"] - 22, head["y"] - 34, grid["width"] + 44,
                   card["height"] * 2 + (card["y"] - head["y"]) + 66),
        anchors={
            "card": card,
            "identity": _rect_of(c, text="REF-001 · Tax"),
            "rows": _rect_of(c, text="3 configured rows"),
            "version": _rect_of(c, text="2026.1"),
            "enabled": _rect_of(c, text="Enabled"),
            "manage": _rect_of(c, text="Manage", tag="button"),
            "upload": _rect_of(c, text="Upload version", tag="button"),
        })

# --------------------------------------------------------- 3. change history
c.click_text("Change history", tag="button", settle=1.8)
h_head = _rect_of(c, text="Review formula edits, table versions")
h_last = _rect_of(c, text="Disabled for company")
capture(c, "change-history", clip_rect=span(h_head, h_last, pad=24))

# ------------------------------------------------------ 4. client assignments
c.click_text("Client assignments", tag="button", settle=1.8)
# ------------------------------------------- 5. add the CUS-900 assignment
c.click_text("Add assignment", tag="button", settle=1.8)
c.wait_rect(".modal")
frame(c, 6)
c.set_input(".modal select", "Earnings computation", nth=0)
frame(c, 3)
c.set_input(".modal select", "Earnings and Allowance Codes", nth=1)
frame(c, 3)
c.set_input(".modal select", "CUS-900", nth=2)
frame(c, 4)
c.set_input(".modal select", "All Employees", nth=3)
frame(c, 2)
c.set_input(".modal select", "Every payroll", nth=4)
frame(c, 4)

r = c.rect(".modal")
capture(c, "assign-form",
        clip_rect=(r["x"] - 16, r["y"] - 16, r["width"] + 32, r["height"] + 32),
        anchors={
            "type": label_rect(c, "Assignment type"),
            "table": label_rect(c, "Reference table"),
            "basis": label_rect(c, "Basis of computation"),
            "group": label_rect(c, "Employee group"),
            "frequency": label_rect(c, "Frequency"),
            "status": label_rect(c, "Status"),
        })

c.click_text("Save assignment", tag="button", settle=2.0)
time.sleep(0.6)
new_row = c.js("""
(() => {
  const tr = [...document.querySelectorAll('table tbody tr')].find(t => (t.innerText||'').includes('CUS-900'));
  if (!tr) return null;
  const r = tr.getBoundingClientRect();
  return {x:r.x, y:r.y, width:r.width, height:r.height};
})()""")
print("NEW ASSIGNMENT ROW:", (new_row or {}) and c.js(
    "(()=>{const tr=[...document.querySelectorAll('table tbody tr')]"
    ".find(t=>(t.innerText||'').includes('CUS-900'));return tr?tr.innerText.replace(/\\n/g,' | '):'MISSING'})()"))
table = _rect_of(c, selector="table")
a_head = _rect_of(c, text="Client computation assignments")
capture(c, "assign-created", clip_rect=span(table, pad=20),
        anchors={"row": new_row})
# the field guide shows the register with the new row already in it
capture(c, "assign-register",
        clip_rect=span(a_head, table, pad=24),
        anchors={k: c.js(
            "(()=>{const h=[...document.querySelectorAll('table thead th')][%d];"
            "if(!h)return null;const r=h.getBoundingClientRect();"
            "return {x:r.x,y:r.y,width:r.width,height:r.height}})()" % i)
            for i, k in enumerate(["type", "table", "basis", "group", "frequency", "status", "action"])})
frame(c, 12)

# ------------------------------------------- 6. the saved CUS-900 record
c.click_text("Computations", tag="button", settle=1.6)
c.set_input("input[placeholder^='Search code']", "CUS-900")
time.sleep(1.0)
c.click_sel("table tbody tr td:last-child button", 0, settle=1.0)
r = c.wait_rect(".record-drawer", timeout=8)
print("DRAWER:", r)
if r:
    capture(c, "cus900-record",
            clip_rect=(r["x"] - 16, r["y"] + 10, r["width"] + 32, r["height"] - 20),
            anchors={
                "identity": _rect_of(c, text="Variable Allowance by Approved Units", tag="h2"),
                "meta": _rect_of(c, text="Effective date", tag="*"),
                "description": _rect_of(c, text="Description", tag="*"),
                "expression": _rect_of(c, text="Formula expression", tag="*"),
                "mapped": _rect_of(c, text="Mapped fields", tag="*"),
                "test": _rect_of(c, text="Standard test result", tag="*"),
            })

sk.save("shots/anchors-rest.json")
c.close()
print("rest captures done; assign frames:", seq[0])
