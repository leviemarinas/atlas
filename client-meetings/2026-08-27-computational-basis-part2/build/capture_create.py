# -*- coding: utf-8 -*-
"""Step 3 — creating a computation now that the form has changed.

Part 1 demonstrated this same business rule as CUS-900, with a code typed by
hand, an Active status and a required description. All three moved, so the same
rule is built again here and the differences are captured where they happen:

  * the code is generated from the category and is read-only;
  * the record is created Inactive;
  * the description is optional;
  * the map-field table declares owner, type, unit, timing and missing-value;
  * the test records evidence against an expected amount;
  * change details shows what the save will alter, before it is saved.

The worked example stays 8 approved units at PHP250 = PHP2,000, so it lines up
with the number the client already saw in Part 1.
"""
import os
import shutil
import time

import atlas_nav as nav
import shotkit as sk
from shotkit import capture, span, _rect_of

GIF = "gif-create"
shutil.rmtree(GIF, ignore_errors=True)
os.makedirs(GIF, exist_ok=True)
os.makedirs("shots", exist_ok=True)
seq = [0]

M = "section.modal "
# One fixed window for every frame: the modal changes height between tabs and a
# clip that tracked it would make the animation jump.
GIF_CLIP = (250, 60, 1320, 930)


def frame(c, hold=1):
    for _ in range(hold):
        seq[0] += 1
        c.shot(os.path.join(GIF, f"f{seq[0]:03d}.png"), clip=GIF_CLIP)


def label_rect(c, text, nth=0):
    """The whole label block — caption, control and any hint beneath it."""
    return c.js("""
    (() => {
      const needle = %r;
      const l = [...document.querySelectorAll('section.modal label')]
        .filter(e => (e.innerText||'').trim().split('\\n')[0].startsWith(needle))[%d];
      if (!l) return null;
      const r = l.getBoundingClientRect();
      return {x:r.x, y:r.y, width:r.width, height:r.height};
    })()""" % (text, nth))


def set_select(c, nth, value):
    c.js("""(() => {
      const el = [...document.querySelectorAll('section.modal .basis-form-grid select')][%d];
      const set = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value').set;
      set.call(el, %r);
      el.dispatchEvent(new Event('change', {bubbles:true}));
    })()""" % (nth, value))
    time.sleep(0.7)


def code_now(c):
    return c.js("(()=>{const i=document.querySelector('section.modal .basis-form-grid input');"
                "return i?i.value:''})()")


def main():
    c = nav.open_computational_basis()
    c.click_text("Create computation", tag="button", settle=1.8)
    frame(c, 6)

    # ------------------------------- the code follows the category, then locks
    print("code on open:", code_now(c))
    for category in ("Deductions", "Benefits", "Earnings"):
        set_select(c, 0, category)
        print(f"  category {category} -> {code_now(c)}")
        frame(c, 4)

    c.set_input(M + ".basis-form-grid input", "Variable Allowance by Approved Units", nth=1)
    frame(c, 3)
    c.set_input(M + ".basis-form-grid textarea",
                "Values an approved variable allowance from the approved unit count and the "
                "assigned unit rate. Excludes any allowance already paid as a fixed amount.",
                nth=0)
    frame(c, 5)

    top = label_rect(c, "Computation code")
    desc = label_rect(c, "Description")
    capture(c, "create-details",
            clip_rect=span(top, desc, pad=20),
            anchors={
                "code": top,
                "name": label_rect(c, "Computation name"),
                "category": label_rect(c, "Category"),
                "status": label_rect(c, "Status"),
                "description": desc,
            })

    # ------------------------------------------- the expression and its inputs
    c.set_input(M + "textarea.formula-expression",
                "{{allowance_units}} * {{allowance_unit_rate}}", nth=0)
    time.sleep(0.9)
    frame(c, 6)

    wrap = c.rect(".mapping-table-wrap")
    heads = c.js("""(() => {
      const out = {};
      [...document.querySelectorAll('.map-field-table thead th')].forEach(th => {
        const r = th.getBoundingClientRect();
        out[th.textContent.trim()] = {x:r.x, y:r.y, width:r.width, height:r.height};
      });
      return out;
    })()""")
    print("map field columns:", list(heads))
    capture(c, "create-mapfields",
            clip_rect=(wrap["x"] - 10, wrap["y"] - 10, wrap["width"] + 20, wrap["height"] + 20),
            anchors={
                "owner": heads.get("Owner / source module"),
                "datatype": heads.get("Data type"),
                "unit": heads.get("Unit"),
                "timing": heads.get("Timing"),
                "missing": heads.get("If the value is missing"),
            })

    # ------------------------------------------------- the test, and its proof
    c.js("[...document.querySelectorAll('.basis-editor-tabs button')]"
         ".find(b=>/Test calculation/.test(b.textContent)).click()")
    time.sleep(1.2)
    frame(c, 4)

    c.js("""(() => {
      const set = (el, v) => {
        const s = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value').set;
        s.call(el, v); el.dispatchEvent(new Event('input', {bubbles:true}));
      };
      const inputs = [...document.querySelectorAll('.test-input-grid input')];
      set(inputs[0], '8'); set(inputs[1], '250');
      set(document.querySelector('.test-expectation input'), '2000');
    })()""")
    time.sleep(0.8)
    frame(c, 4)

    c.js("[...document.querySelectorAll('.basis-editor-modal button')]"
         ".find(b=>/Run test/.test(b.textContent)).click()")
    time.sleep(1.4)
    frame(c, 8)

    grid = c.rect(".test-input-grid")
    evidence = c.rect(".test-evidence")
    capture(c, "create-test",
            clip_rect=span(grid, evidence, pad=18),
            anchors={
                "inputs": grid,
                "expected": c.rect(".test-expectation"),
                "result": c.rect(".test-result"),
                "evidence": evidence,
            })

    # ------------------------------------------------------- change details
    c.js("[...document.querySelectorAll('.basis-editor-tabs button')]"
         ".find(b=>/Change details/.test(b.textContent)).click()")
    time.sleep(1.2)
    frame(c, 6)

    ws = c.rect(".change-workspace")
    capture(c, "create-change",
            clip_rect=(ws["x"] - 14, ws["y"] - 14, ws["width"] + 28, ws["height"] + 28),
            anchors={
                "effective": _rect_of(c, ".change-workspace label"),
                "summary": c.rect(".change-summary"),
            })

    c.js("[...document.querySelectorAll('.basis-editor-modal .modal-actions button')]"
         ".find(b=>/Validate and create/.test(b.textContent)).click()")
    time.sleep(2.0)
    frame(c, 8)

    created = c.js("""(() => {
      const k = Object.keys(localStorage).find(x => x.startsWith('atlas-company-computations-v4:')
        && JSON.parse(localStorage.getItem(x) || '[]').length);
      const rows = k ? JSON.parse(localStorage.getItem(k)) : [];
      return rows.map(r => r.code + ' · ' + r.status + ' · v' + r.version);
    })()""")
    print("created:", created)
    with open("shots/created.txt", "w", encoding="utf-8") as fh:
        fh.write("\n".join(created))

    sk.save("shots/anchors-create.json")
    c.close()
    print("frames:", seq[0])


if __name__ == "__main__":
    main()
