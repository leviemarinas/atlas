# -*- coding: utf-8 -*-
"""Step 2 — the protection rules, and the one-standard-many-companies model.

Runs after `capture_seed.py`, against the payroll it posted. That order is the
whole point: a register screenshot only shows "1 transaction · 1 posted" beside
a code because a real posted transaction used it, and the disabled buttons in
the same row are disabled for that same reason.
"""
import json
import os
import time

import atlas_nav as nav
import shotkit as sk
from shotkit import capture, span, _rect_of

os.makedirs("shots", exist_ok=True)


def row_rect(c, code, selector=".basis-table tbody tr"):
    return c.js("""(() => {
      const tr = [...document.querySelectorAll(%s)]
        .find(e => e.textContent.includes(%s));
      if (!tr) return null;
      const r = tr.getBoundingClientRect();
      return {x: r.x, y: r.y, width: r.width, height: r.height};
    })()""" % (json.dumps(selector), json.dumps(code)))


def cell_rect(c, code, index, selector=".basis-table tbody tr"):
    return c.js("""(() => {
      const tr = [...document.querySelectorAll(%s)]
        .find(e => e.textContent.includes(%s));
      if (!tr) return null;
      const td = tr.querySelectorAll('td')[%d];
      if (!td) return null;
      const r = td.getBoundingClientRect();
      return {x: r.x, y: r.y, width: r.width, height: r.height};
    })()""" % (json.dumps(selector), json.dumps(code), index))


def header_rect(c, label, selector=".basis-table thead th"):
    return c.js("""(() => {
      const th = [...document.querySelectorAll(%s)]
        .find(e => e.textContent.trim() === %s);
      if (!th) return null;
      const r = th.getBoundingClientRect();
      return {x: r.x, y: r.y, width: r.width, height: r.height};
    })()""" % (json.dumps(selector), json.dumps(label)))


def main():
    c = nav.open_computational_basis()
    txn = nav.posted_transaction_number(c)
    print("captured against", txn)

    # ---------------------------------------------------------------- register
    # Filtered to the basic-pay family so the rows on screen are the ones the
    # posted payroll actually used, rather than an arbitrary first page.
    nav.search_register(c, "BAS-")
    time.sleep(0.6)

    print(nav.dump(c, "Code", 500))

    head = c.rect(".basis-table thead")
    last = row_rect(c, "BAS-004")
    capture(c, "cb-usage",
            clip_rect=(head["x"] - 12, head["y"] - 12, head["width"] + 24,
                       last["y"] + last["height"] - head["y"] + 22),
            anchors={
                "usage": header_rect(c, "Payroll usage"),
                "status": header_rect(c, "Status"),
                "locked": cell_rect(c, "BAS-001", 9),
                "kind": cell_rect(c, "BAS-001", 2),
            })

    # The notice that tells a client admin what they may and may not do here.
    notice = c.rect(".library-notice")
    capture(c, "cb-notice", clip_rect=(notice["x"] - 10, notice["y"] - 10,
                                       notice["width"] + 20, notice["height"] + 20))

    # ------------------------------------------------------- the record drawer
    # The drawer is full-height and its body scrolls, so the viewport is raised
    # for this one capture. Scrolling the body instead would put the sticky
    # footer over the section being photographed.
    c.viewport(height=1560)
    time.sleep(0.5)
    c.js("""(() => {
      const tr = [...document.querySelectorAll('.basis-table tbody tr')]
        .find(e => e.textContent.includes('BAS-001'));
      tr.querySelector('.row-actions button').click();
    })()""")
    time.sleep(1.4)
    c.wait_text("Payroll usage")

    drawer_sections = c.js("""(() => {
      const d = document.querySelector('.basis-record-drawer');
      return [...d.querySelectorAll('.record-drawer-body section')].map(s => {
        const r = s.getBoundingClientRect();
        return {x:r.x, y:r.y, width:r.width, height:r.height,
                head:(s.querySelector('h3')||{}).textContent || ''};
      });
    })()""")
    for i, s in enumerate(drawer_sections):
        print(" drawer section", i, s["head"], round(s["y"]))

    usage_sec = next(s for s in drawer_sections if "Payroll usage" in s["head"])
    prot_sec = next((s for s in drawer_sections if "protected" in s["head"]), None)
    version_col = c.js("""(() => {
      const th = [...document.querySelectorAll('.basis-record-drawer .usage-table thead th')]
        .find(e => /Version used/.test(e.textContent));
      if (!th) return null;
      const r = th.getBoundingClientRect();
      return {x:r.x, y:r.y, width:r.width, height:r.height};
    })()""")
    capture(c, "cb-protected",
            clip_rect=span(usage_sec, prot_sec or usage_sec, pad=14),
            anchors={"usage": usage_sec, "version": version_col, "protected": prot_sec})

    c.js("document.querySelector('.basis-record-drawer footer button').click()")
    time.sleep(0.8)
    c.viewport(height=1000)
    time.sleep(0.4)

    # ------------------------------------------- Settings: the central library
    nav.select_role(c, "P&A Admin")
    nav.open_standard_library(c)
    # "Rate" returns a genuine mix — three standards the posted payroll applied
    # and one it did not — so the locked row and the open row on this slide are
    # a real contrast rather than four identical rows.
    nav.search_register(c, "Rate")
    time.sleep(0.8)

    rows = c.js("""(() => [...document.querySelectorAll('.basis-table tbody tr')]
      .slice(0, 4).map(tr => {
        const td = [...tr.querySelectorAll('td')];
        return (td[1] || {}).textContent + ' | ' + (td[8] || {}).textContent;
      }))()""")
    print("settings rows:", rows)

    head = c.rect(".basis-table thead")
    last = row_rect(c, "ERN-006")
    capture(c, "std-library",
            clip_rect=(head["x"] - 12, head["y"] - 12, head["width"] + 24,
                       last["y"] + last["height"] - head["y"] + 22),
            anchors={
                "companies": header_rect(c, "Companies"),
                "usage": header_rect(c, "Payroll usage"),
                "locked": cell_rect(c, "BAS-001", 9),
                "open": cell_rect(c, "ERN-006", 9),
            })

    # ------------------------------------------------ company applicability
    c.js("""(() => {
      const tr = [...document.querySelectorAll('.basis-table tbody tr')]
        .find(e => e.textContent.includes('ERN-006'));
      tr.querySelector('.link-button').click();
    })()""")
    time.sleep(1.4)
    c.wait_text("Company applicability")

    modal = c.rect(".applicability-modal")
    rows = c.js("""(() => {
      const m = document.querySelector('.applicability-modal');
      const out = {};
      const th = [...m.querySelectorAll('thead th')];
      th.forEach(e => {
        const r = e.getBoundingClientRect();
        out[e.textContent.trim()] = {x:r.x, y:r.y, width:r.width, height:r.height};
      });
      const bulk = m.querySelector('.applicability-bulk');
      if (bulk) { const r = bulk.getBoundingClientRect();
        out.__bulk = {x:r.x, y:r.y, width:r.width, height:r.height}; }
      return out;
    })()""")
    capture(c, "std-applicability",
            clip_rect=(modal["x"] - 8, modal["y"] - 8, modal["width"] + 16, modal["height"] + 16),
            anchors={
                "bulk": rows.get("__bulk"),
                "company": rows.get("Company"),
                "applied": rows.get("Applied"),
                "status": rows.get("Status in company"),
                "usage": rows.get("Payroll usage"),
            })

    sk.save("shots/anchors-govern.json")
    c.close()


if __name__ == "__main__":
    main()
