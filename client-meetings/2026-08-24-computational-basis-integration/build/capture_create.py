"""Create CUS-900 end to end: field-guide screenshots plus GIF frames.

The narrative example is 8 approved units x PHP250 = PHP2,000, so the test tab
is driven with those values rather than the palette defaults.
"""
import os
import shutil
import time

from atlas_nav import open_computational_basis
import shotkit as sk
from shotkit import capture, span, bbox, _rect_of

GIF = "gif-create"
shutil.rmtree(GIF, ignore_errors=True)
os.makedirs(GIF, exist_ok=True)
seq = [0]

M = "section.modal "


# One fixed window for every frame: the modal grows and shrinks between tabs,
# and a clip that tracked it would make the GIF jump around.
GIF_CLIP = (330, 88, 1270, 912)
LAST = {"clip": GIF_CLIP}


def modal_clip(c, pad=22):
    r = c.rect("section.modal")
    if r is None:
        return LAST["clip"]
    return (max(0, r["x"] - pad), max(0, r["y"] - pad), r["width"] + pad * 2, r["height"] + pad * 2)


def frame(c, hold=1, clip=None):
    box = clip or GIF_CLIP
    for _ in range(hold):
        seq[0] += 1
        c.shot(os.path.join(GIF, f"f{seq[0]:03d}.png"), clip=box)


def label_rect(c, text, nth=0):
    """The whole label block (caption + its control)."""
    return c.js("""
    (() => {
      const needle = %r;
      const l = [...document.querySelectorAll('section.modal label')]
        .filter(e => (e.innerText||'').trim().split('\\n')[0] === needle)[%d];
      if (!l) return null;
      const r = l.getBoundingClientRect();
      return {x:r.x, y:r.y, width:r.width, height:r.height};
    })()""" % (text, nth))


# capture_basis.py performs the reset; this script follows it
c = open_computational_basis()
c.click_text("Create computation", tag="button", settle=1.6)
frame(c, 6)

# ---------------------------------------------------- 1. business details
c.set_input(M + "input[placeholder^='e.g.']", "CUS-900")
frame(c, 2)
c.set_input(M + "input", "Variable Allowance by Approved Units", nth=1)
frame(c, 2)
c.set_input(M + "select", "Earnings", nth=0)
frame(c, 2)
c.set_input(M + "textarea",
            "Values an approved variable allowance from the approved unit count and the "
            "assigned unit rate. Excludes any allowance already paid as a fixed amount.",
            nth=0)
frame(c, 5)

details_top = label_rect(c, "Computation code")
desc = label_rect(c, "Description")
capture(c, "create-details",
        clip_rect=span(details_top, desc, _rect_of(c, selector="section.modal"), pad=0),
        anchors={
            "code": label_rect(c, "Computation code"),
            "name": label_rect(c, "Computation name"),
            "category": label_rect(c, "Category"),
            "status": label_rect(c, "Status"),
            "description": desc,
        })

# ------------------------------------------------------- 2. the expression
c.set_input(M + "select", "allowance_units", nth=2)
frame(c, 2)
c.click_text("Insert field", tag="button", settle=0.5)
frame(c, 3)
c.click_text("×", tag="button", settle=0.4, exact=True)
frame(c, 3)
c.set_input(M + "select", "allowance_unit_rate", nth=2)
frame(c, 2)
c.click_text("Insert field", tag="button", settle=0.8)
frame(c, 6)

print("EXPRESSION:", c.js("document.querySelectorAll('section.modal textarea')[1].value"))

builder = _rect_of(c, text="Expression builder", tag="*")
expr_box = c.rect(M + "textarea", 1)
insert = _rect_of(c, text="Insert field", tag="button")
palette_l = _rect_of(c, text="+", tag="button")
palette_r = _rect_of(c, text="MAX(", tag="button")
table = c.rect(M + "table")
capture(c, "create-expression",
        clip_rect=span(builder, expr_box, insert, palette_r, pad=18),
        anchors={
            "expression": expr_box,
            "picker": c.rect(M + "select", 2),
            "insert": insert,
            "palette": bbox(palette_l, palette_r),
        })


def col_rect(n):
    return c.js("(()=>{const h=[...document.querySelectorAll('section.modal table th')][%d];"
                "if(!h)return null;const r=h.getBoundingClientRect();"
                "return {x:r.x,y:r.y,width:r.width,height:r.height}})()" % n)


capture(c, "create-mapped",
        clip_rect=span(table, pad=16),
        anchors={"field": col_rect(0), "source": col_rect(1), "sample": col_rect(2)})

# ------------------------------------------------------------- 3. the test
c.click_text("Test calculation", tag="button", settle=1.2)
frame(c, 4)
c.set_input(M + "input[type=number]", "8", nth=0)
frame(c, 2)
c.set_input(M + "input[type=number]", "250", nth=1)
frame(c, 3)
c.click_text("Run test", tag="button", settle=1.2)
frame(c, 8)

print("TEST PANEL:", " / ".join(c.js("document.querySelector('section.modal').innerText").split("\n")))

test_head = _rect_of(c, text="Test calculation", tag="h3") or _rect_of(c, text="Run the draft formula")
run = _rect_of(c, text="Run test", tag="button")
body = c.rect("section.modal")
capture(c, "create-test",
        clip_rect=(body["x"] + 10, test_head["y"] - 26, body["width"] - 20,
                   body["y"] + body["height"] - test_head["y"] - 60),
        anchors={
            "inputs": bbox(label_rect(c, "Allowance units"), label_rect(c, "Allowance unit rate")),
            "run": run,
        })

# --------------------------------------------------- 4. version and note
c.click_text("Change details", tag="button", settle=1.2)
frame(c, 4)
print("CHANGE PANEL:", " / ".join(c.js("document.querySelector('section.modal').innerText").split(chr(10))))
print("CHANGE INPUTS:", c.js(
    "[...document.querySelectorAll('section.modal input,section.modal textarea,section.modal select')]"
    ".map((e,i)=>i+':'+e.tagName+'/'+(e.type||'')+'/'+(e.value||'')).join(' | ')"))
c.set_input(M + "input[type=date]", "2026-09-01")
frame(c, 2)
c.set_input(M + "textarea",
            "Initial release. Values an approved variable allowance from approved units "
            "and the assigned unit rate; agreed with Finance on 24 Aug 2026.", nth=0)
frame(c, 6)

body = c.rect("section.modal")
head = _rect_of(c, text="Saving creates a new controlled version")
capture(c, "create-change",
        clip_rect=(body["x"] + 10, head["y"] - 62, body["width"] - 20,
                   body["y"] + body["height"] - head["y"] - 20),
        anchors={
            "effective": label_rect(c, "Effective date"),
            "note": label_rect(c, "Change note"),
            "version": _rect_of(c, text="Initial version"),
            "owner": _rect_of(c, text="Ownership"),
        })

# ------------------------------------------------------------- 5. save it
c.click_text("Validate and create", tag="button", settle=2.2)
frame(c, 10)
print("AFTER SAVE:", " / ".join(c.js("document.body.innerText").split(chr(10))[:6]))

# register filtered to the new code, with the confirmation toast still up
c.set_input("input[placeholder^='Search code']", "CUS-900")
time.sleep(1.0)
tool = _rect_of(c, selector="input[placeholder^='Search code']")
row = c.js("(()=>{const t=[...document.querySelectorAll('table tbody tr')][0];"
           "if(!t)return null;const r=t.getBoundingClientRect();"
           "return {x:r.x,y:r.y,width:r.width,height:r.height}})()")
table = _rect_of(c, selector="table")
capture(c, "create-saved",
        clip_rect=span(tool, table, row, pad=22),
        anchors={"row": row, "search": tool})

# the read-only record view
c.click_sel("table tbody tr td:last-child button", 0, settle=1.6)
if c.rect("section.modal"):
    print("VIEW PANEL:", " / ".join(c.js("document.querySelector('section.modal').innerText").split(chr(10))))
    capture(c, "create-record", clip_rect=modal_clip(c, pad=18))

sk.save("shots/anchors-create.json")
c.close()
print("create captures done; frames:", seq[0])
