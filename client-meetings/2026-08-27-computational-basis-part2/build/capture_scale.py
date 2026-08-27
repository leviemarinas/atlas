# -*- coding: utf-8 -*-
"""Step 4 — versions, bulk maintenance, change history and effective-dated values.

Runs after `capture_create.py`, so ERN-007 already exists as an Inactive v1.0.
This script edits it, which is what produces a second version, a before/after
change record and a version history with test evidence against each version —
none of which can be photographed without first making a real change.
"""
import json
import os
import time

import atlas_nav as nav
import shotkit as sk
from shotkit import capture, span, _rect_of

os.makedirs("shots", exist_ok=True)

CODE = "ERN-007"


def row_rect(c, code):
    return c.js("""(() => {
      const tr = [...document.querySelectorAll('.basis-table tbody tr')]
        .find(e => e.textContent.includes(%s));
      if (!tr) return null;
      const r = tr.getBoundingClientRect();
      return {x:r.x, y:r.y, width:r.width, height:r.height};
    })()""" % json.dumps(code))


def cell_rect(c, code, index):
    return c.js("""(() => {
      const tr = [...document.querySelectorAll('.basis-table tbody tr')]
        .find(e => e.textContent.includes(%s));
      const td = tr && tr.querySelectorAll('td')[%d];
      if (!td) return null;
      const r = td.getBoundingClientRect();
      return {x:r.x, y:r.y, width:r.width, height:r.height};
    })()""" % (json.dumps(code), index))


def set_value(c, selector, value, nth=0):
    c.js("""(() => {
      const el = [...document.querySelectorAll(%s)][%d];
      const set = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value').set;
      set.call(el, %s);
      el.dispatchEvent(new Event('input', {bubbles:true}));
      el.dispatchEvent(new Event('change', {bubbles:true}));
    })()""" % (json.dumps(selector), nth, json.dumps(value)))
    time.sleep(0.6)


def main():
    c = nav.open_computational_basis()

    # ------------------------------------------- a record nothing has used yet
    # The contrast with the protected rows: a company computation no payroll has
    # touched still offers edit and delete.
    nav.search_register(c, CODE)
    head = c.rect(".basis-table thead")
    row = row_rect(c, CODE)
    capture(c, "cb-newrow",
            clip_rect=(head["x"] - 12, head["y"] - 12, head["width"] + 24,
                       row["y"] + row["height"] - head["y"] + 20),
            anchors={
                "code": cell_rect(c, CODE, 1),
                "kind": cell_rect(c, CODE, 2),
                "status": cell_rect(c, CODE, 7),
                "usage": cell_rect(c, CODE, 8),
                "actions": cell_rect(c, CODE, 9),
            })

    # --------------------------------------------- edit it, and show the diff
    c.js("""(() => {
      const tr = [...document.querySelectorAll('.basis-table tbody tr')]
        .find(e => e.textContent.includes(%s));
      [...tr.querySelectorAll('.row-actions button')]
        .find(b => /^Edit/.test(b.getAttribute('aria-label') || '')).click();
    })()""" % json.dumps(CODE))
    time.sleep(1.6)

    set_value(c, "section.modal textarea.formula-expression",
              "{{allowance_units}} * {{allowance_unit_rate}} * 1.25")
    c.js("""(() => {
      const sel = [...document.querySelectorAll('section.modal .basis-form-grid select')][1];
      const set = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(sel), 'value').set;
      set.call(sel, 'Active');
      sel.dispatchEvent(new Event('change', {bubbles:true}));
    })()""")
    time.sleep(0.7)

    # Changing the expression retires the previous version's test evidence, so
    # the new one is tested on its own terms: the same 8 units at PHP250, now
    # carrying the rest-day premium, which is PHP2,500.
    c.js("[...document.querySelectorAll('.basis-editor-tabs button')]"
         ".find(b=>/Test calculation/.test(b.textContent)).click()")
    time.sleep(1.0)
    c.js("""(() => {
      const set = (el, v) => {
        const s = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value').set;
        s.call(el, v); el.dispatchEvent(new Event('input', {bubbles:true}));
      };
      const inputs = [...document.querySelectorAll('.test-input-grid input')];
      set(inputs[0], '8'); set(inputs[1], '250');
      set(document.querySelector('.test-expectation input'), '2500');
    })()""")
    time.sleep(0.7)
    c.js("[...document.querySelectorAll('.basis-editor-modal button')]"
         ".find(b=>/Run test/.test(b.textContent)).click()")
    time.sleep(1.4)
    print("retest:", c.js("(()=>{const e=document.querySelector('.test-result');"
                          "return e?e.innerText.replace(/\s+/g,' '):'none'})()"))

    c.js("[...document.querySelectorAll('.basis-editor-tabs button')]"
         ".find(b=>/Change details/.test(b.textContent)).click()")
    time.sleep(1.0)
    set_value(c, "section.modal .change-workspace input[type=date]", "2026-09-01")
    set_value(c, "section.modal .change-workspace textarea",
              "Rest-day premium applied to the approved unit rate, effective September.")
    time.sleep(0.8)

    diff = c.rect(".change-diff")
    if not diff:
        raise RuntimeError("no change diff rendered — the edit did not register")
    diff_heads = c.js("""(() => {
      const out = {};
      [...document.querySelectorAll('.change-diff-table thead th')].forEach(th => {
        const r = th.getBoundingClientRect();
        out[th.textContent.trim()] = {x:r.x, y:r.y, width:r.width, height:r.height};
      });
      return out;
    })()""")
    capture(c, "cb-diff",
            clip_rect=(diff["x"] - 14, diff["y"] - 14, diff["width"] + 28, diff["height"] + 28),
            anchors={
                "field": diff_heads.get("Field"),
                "before": diff_heads.get("Before"),
                "after": diff_heads.get("After"),
            })

    c.js("[...document.querySelectorAll('.basis-editor-modal .modal-actions button')]"
         ".find(b=>/Validate and save/.test(b.textContent)).click()")
    time.sleep(2.0)

    # ------------------------------------- the versions that edit left behind
    c.viewport(height=1560)
    time.sleep(0.5)
    nav.search_register(c, CODE)
    c.js("""(() => {
      const tr = [...document.querySelectorAll('.basis-table tbody tr')]
        .find(e => e.textContent.includes(%s));
      tr.querySelector('.row-actions button').click();
    })()""" % json.dumps(CODE))
    time.sleep(1.6)
    c.wait_text("Version history")

    versions = c.js("""(() => {
      const d = document.querySelector('.basis-record-drawer');
      const s = [...d.querySelectorAll('.record-drawer-body section')]
        .find(x => /Version history/.test((x.querySelector('h3')||{}).textContent || ''));
      if (!s) return null;
      const r = s.getBoundingClientRect();
      return {x:r.x, y:r.y, width:r.width, height:r.height};
    })()""")
    arts = c.js("""(() => {
      const a = [...document.querySelectorAll('.basis-record-drawer .version-history article')];
      return a.map(e => { const r = e.getBoundingClientRect();
        return {x:r.x, y:r.y, width:r.width, height:r.height}; });
    })()""")
    print("versions on record:", len(arts))
    capture(c, "cb-versions",
            clip_rect=(versions["x"] - 12, versions["y"] - 12,
                       versions["width"] + 24, versions["height"] + 24),
            anchors={
                "current": arts[0] if arts else None,
                "previous": arts[1] if len(arts) > 1 else None,
            })
    c.js("document.querySelector('.basis-record-drawer footer button').click()")
    time.sleep(0.8)
    c.viewport(height=1000)

    # -------------------------------------------------------- bulk maintenance
    nav.search_register(c, "BEN-")
    time.sleep(0.8)
    c.js("""(() => {
      [...document.querySelectorAll('.basis-table tbody tr')].slice(0, 3)
        .forEach(tr => tr.querySelector('.select-column input').click());
    })()""")
    time.sleep(1.0)
    bar = c.rect(".bulk-action-bar")
    head = c.rect(".basis-table thead")
    third = c.js("""(() => {
      const tr = [...document.querySelectorAll('.basis-table tbody tr')][2];
      const r = tr.getBoundingClientRect();
      return {x:r.x, y:r.y, width:r.width, height:r.height};
    })()""")
    capture(c, "cb-bulk",
            clip_rect=(bar["x"] - 12, bar["y"] - 12, bar["width"] + 24,
                       third["y"] + third["height"] - bar["y"] + 20),
            anchors={
                "bar": bar,
                "selectall": c.rect(".basis-table thead .select-column"),
                "rowbox": c.rect(".basis-table tbody .select-column"),
            })
    c.js("[...document.querySelectorAll('.bulk-action-bar button')]"
         ".find(b=>/Clear selection/.test(b.textContent)).click()")
    time.sleep(0.6)

    # ---------------------------------------------------------- change history
    c.js("[...document.querySelectorAll('.basis-tabs button')]"
         ".find(b=>/Change history/.test(b.textContent)).click()")
    time.sleep(1.4)
    entries = c.js("""(() => {
      const a = [...document.querySelectorAll('.history-list article')].slice(0, 3);
      return a.map(e => { const r = e.getBoundingClientRect();
        return {x:r.x, y:r.y, width:r.width, height:r.height,
                text:(e.innerText||'').replace(/\\n/g,' | ').slice(0, 120)}; });
    })()""")
    for e in entries:
        print("  history:", e["text"])
    parts = c.js("""(() => {
      const a = document.querySelectorAll('.history-list article')[0];
      const pick = sel => { const e = a.querySelector(sel); if (!e) return null;
        const r = e.getBoundingClientRect();
        return {x:r.x, y:r.y, width:r.width, height:r.height}; };
      return {head: pick('header'), action: pick('p'),
              diff: pick('.history-change-list'), stamp: pick('small')};
    })()""")
    capture(c, "cb-history",
            clip_rect=span(entries[0], entries[-1], pad=14),
            anchors={
                "head": parts.get("head"),
                "diff": parts.get("diff"),
                "stamp": parts.get("stamp"),
            })

    # ------------------------------------------- effective-dated reference data
    c.js("[...document.querySelectorAll('.basis-tabs button')]"
         ".find(b=>/Reference sources/.test(b.textContent)).click()")
    time.sleep(1.6)

    def open_card(action):
        c.js("""(() => {
          const card = [...document.querySelectorAll('.reference-card')]
            .find(e => /De Minimis Ceiling/.test(e.textContent));
          [...card.querySelectorAll('footer button')]
            .find(b => new RegExp(%s).test(b.textContent)).click();
        })()""" % json.dumps(action))
        time.sleep(1.4)

    # Publish a second version with its own effective date, which is what makes
    # a date-resolved history rather than two rows carrying the same date.
    open_card("Manage")
    set_value(c, ".reference-modal .reference-effective input", "2026-01-01")
    c.js("""(() => {
      const row = document.querySelectorAll('.reference-entry-table tbody tr')[0];
      const el = row.querySelectorAll('input')[1];
      const set = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value').set;
      set.call(el, '26,000.00');
      el.dispatchEvent(new Event('input', {bubbles:true}));
    })()""")
    time.sleep(0.6)
    c.js("[...document.querySelectorAll('.reference-modal .modal-actions button')]"
         ".find(b=>/Save table/.test(b.textContent)).click()")
    time.sleep(1.8)

    card = c.js("""(() => {
      const e = [...document.querySelectorAll('.reference-card')]
        .find(x => /De Minimis Ceiling/.test(x.textContent));
      const r = e.getBoundingClientRect();
      return {x:r.x, y:r.y, width:r.width, height:r.height};
    })()""")
    capture(c, "ref-card",
            clip_rect=(card["x"] - 12, card["y"] - 12, card["width"] + 24, card["height"] + 24),
            anchors={
                "version": _rect_of(c, text="Published versions", tag="dt"),
                "footer": c.js("""(() => {
                  const e = [...document.querySelectorAll('.reference-card')]
                    .find(x => /De Minimis Ceiling/.test(x.textContent));
                  const r = e.querySelector('footer').getBoundingClientRect();
                  return {x:r.x, y:r.y, width:r.width, height:r.height};
                })()"""),
            })

    open_card("Versions")
    c.wait_text("Version history")
    modal = c.rect(".reference-modal")
    arts = c.js("""(() => {
      const a = [...document.querySelectorAll('.reference-modal .version-history article')];
      return a.map(e => { const r = e.getBoundingClientRect();
        return {x:r.x, y:r.y, width:r.width, height:r.height,
                head:(e.querySelector('header')||{}).innerText || ''}; });
    })()""")
    for a in arts:
        print("  ref version:", a["head"].replace("\n", " "))
    capture(c, "ref-versions",
            clip_rect=(modal["x"] - 8, modal["y"] - 8, modal["width"] + 16,
                       min(modal["height"], 900) + 16),
            anchors={
                "current": arts[0] if arts else None,
                "previous": arts[1] if len(arts) > 1 else None,
            })

    sk.save("shots/anchors-scale.json")
    c.close()


if __name__ == "__main__":
    main()
