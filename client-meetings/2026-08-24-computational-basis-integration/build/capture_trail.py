"""Capture the posted payroll's computation evidence: the source/policy/output
trail and the calculation-execution ledger.

This is the proof that a Computational Basis code actually ran, so it gets
captured in readable slices rather than one unreadable full-page image.
"""
import time

from atlas_nav import open_payroll_trail
import shotkit as sk
from shotkit import capture, span, _rect_of

c = open_payroll_trail()

nodes = c.js("""
(() => [...document.querySelector('.payroll-source-trail').children].map(e => {
  const r = e.getBoundingClientRect();
  return {x:r.x, y:r.y, width:r.width, height:r.height,
          label:(e.innerText||'').split('\\n').slice(0,3).join(' / ')};
}))()""")
print("source nodes:", len(nodes))
for i, n in enumerate(nodes):
    print(" ", i, round(n["y"]), n["label"][:70])

steps = c.js("""
(() => [...document.querySelectorAll('.payroll-trail-step')].map(e => {
  const r = e.getBoundingClientRect();
  return {x:r.x, y:r.y, width:r.width, height:r.height,
          label:(e.innerText||'').replace(/\\n/g,' ').slice(0,60)};
}))()""")
print("exec steps:", len(steps))

# ------------------------------------------------------------------ header
hdr = _rect_of(c, text="John Collins Doe (0011223345)")
tabs = _rect_of(c, text="How it was computed", tag="button")
card = c.js("(()=>{const e=[...document.querySelectorAll('*')].find(x=>(x.innerText||'')"
            ".startsWith('JC')&&x.getBoundingClientRect().height>60"
            "&&x.getBoundingClientRect().height<200);if(!e)return null;"
            "const r=e.getBoundingClientRect();"
            "return {x:r.x,y:r.y,width:r.width,height:r.height}})()")
net = _rect_of(c, text="Net pay")
left = min(r["x"] for r in [card, hdr, tabs, net] if r)
right = max(r["x"] + r["width"] for r in [card, net] if r)
capture(c, "trail-header",
        clip_rect=(left - 22, (card or hdr)["y"] - 24, right - left + 44,
                   tabs["y"] + tabs["height"] - (card or hdr)["y"] + 56),
        anchors={
            "employee": hdr,
            "totals": _rect_of(c, text="Net pay"),
            "tab": tabs,
        })

# ------------------------------------------------------- the source trail
def slice_nodes(name, first, last, anchors=None):
    capture(c, name, clip_rect=span(nodes[first], nodes[last], pad=16), anchors=anchors or {})


slice_nodes("trail-sources-a", 0, 4)
slice_nodes("trail-sources-b", 7, 10,
            anchors={"assignment": nodes[9], "computation": nodes[10]})
slice_nodes("trail-sources-c", 13, 17,
            anchors={"policy": nodes[14], "posted": nodes[15]})

# --------------------------------------------------- the execution ledger
capture(c, "trail-ledger-a", clip_rect=span(steps[0], steps[9], pad=14))
capture(c, "trail-ledger-b", clip_rect=span(steps[10], steps[18], pad=14))

# ------------------------------------------------- one step, opened up
c.js("document.querySelectorAll('.payroll-trail-step')[6].click()")
time.sleep(1.0)
opened = c.js("""
(() => {
  const s = document.querySelectorAll('.payroll-trail-step')[6];
  const n = s.nextElementSibling;
  if (!n) return null;
  const r = n.getBoundingClientRect();
  return {x:r.x, y:r.y, width:r.width, height:r.height, text:(n.innerText||'').replace(/\\n/g,' | ')};
})()""")
print("OPENED STEP:", (opened or {}).get("text", "none")[:600])
if opened:
    st = c.js("(()=>{const s=document.querySelectorAll('.payroll-trail-step')[6];"
              "const r=s.getBoundingClientRect();"
              "return {x:r.x,y:r.y,width:r.width,height:r.height}})()")
    capture(c, "trail-step-open", clip_rect=span(st, opened, pad=16))

sk.save("shots/anchors-trail.json")
c.close()
print("trail captures done")
