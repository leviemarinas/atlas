"""Capture the Computational Basis workspace: overview, tabs, register, columns."""
from atlas_nav import open_computational_basis
import shotkit as sk
from shotkit import capture, span, _rect_of

# resets the Computational Basis stores so the whole capture run is repeatable:
# this script always sees the pristine 219 / 30 / 209 / 6 workspace
c = open_computational_basis(reset_basis=True)

print("workspace")
capture(c, "cb-overview")

tabs = _rect_of(c, text="Change history", tag="button")
# the KPI row and the tab strip, cropped to end just under the tabs
kpi_row = c.js("(()=>{const e=[...document.querySelectorAll('*')].filter(x=>"
               "(x.innerText||'').includes('governed computations')&&"
               "x.getBoundingClientRect().height>70&&x.getBoundingClientRect().height<160).pop();"
               "if(!e)return null;const r=e.parentElement.getBoundingClientRect();"
               "return {x:r.x,y:r.y,width:r.width,height:r.height}})()")
capture(c, "cb-tabs",
        clip_rect=(kpi_row["x"] - 18, kpi_row["y"] - 18, kpi_row["width"] + 36,
                   tabs["y"] + tabs["height"] - kpi_row["y"] + 16),
        anchors={
            "computations": _rect_of(c, text="Computations", tag="button"),
            "assignments": _rect_of(c, text="Client assignments", tag="button"),
            "engines": _rect_of(c, text="Policy engines", tag="button"),
            "sources": _rect_of(c, text="Reference sources", tag="button"),
            "history": _rect_of(c, text="Change history", tag="button"),
        })

tool = _rect_of(c, selector="input[placeholder^='Search code']")
report = _rect_of(c, text="Download report", tag="button")
rows = c.js("(()=>{const t=[...document.querySelectorAll('table tbody tr')][9];"
            "if(!t)return null;const r=t.getBoundingClientRect();"
            "return {x:r.x,y:r.y,width:r.width,height:r.height}})()")
capture(c, "cb-register",
        clip_rect=span(tool, report, rows, pad=22),
        anchors={
            "search": tool,
            "category": _rect_of(c, selector="select", nth=1),
            "status": _rect_of(c, selector="select", nth=2),
            "create": _rect_of(c, text="Create computation", tag="button"),
            "import": _rect_of(c, text="Import CSV", tag="button"),
            "report": _rect_of(c, text="Download report", tag="button"),
        })


def th(n):
    return c.js(
        "(()=>{const h=[...document.querySelectorAll('table thead th')][%d];"
        "if(!h)return null;const r=h.getBoundingClientRect();"
        "return {x:r.x,y:r.y,width:r.width,height:r.height}})()" % n)


table = _rect_of(c, selector="table")
row5 = c.js("(()=>{const t=[...document.querySelectorAll('table tbody tr')][4];"
            "if(!t)return null;const r=t.getBoundingClientRect();"
            "return {x:r.x,y:r.y,width:r.width,height:r.height}})()")
capture(c, "cb-columns",
        clip_rect=span(table, row5, pad=6),
        anchors={
            "code": th(0), "type": th(1), "computation": th(2), "category": th(3),
            "formula": th(4), "version": th(5), "status": th(6), "action": th(7),
        })

sk.save("shots/anchors-basis.json")
c.close()
print("basis captures done")
