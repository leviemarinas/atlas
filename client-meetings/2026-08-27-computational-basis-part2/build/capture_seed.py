# -*- coding: utf-8 -*-
"""Step 1 — reset the module, seed a posted payroll, capture the payroll trail.

This runs first and it is the only script that seeds. Everything after it reads
the state it leaves behind, which is what keeps a register screenshot and the
copy beside it agreeing with each other.

The payroll trail is the heart of Part 2: it is where the version a transaction
actually applied becomes visible, so the two captures here are the version chip
on a calculation step and the snapshot table beneath the ledger.
"""
import os
import sys
import time

import atlas_nav as nav
from shotkit import capture, save, span, _rect_of

os.makedirs("shots", exist_ok=True)


def main():
    c = nav.browser()
    c.goto(nav.BASE, settle=2.0)

    # The Computational Basis stores are always reset, whatever else this run
    # does. Leaving a previous run's ERN-007 in place would push the new record
    # to ERN-008 and leave nothing for the edit in capture_scale to change.
    nav.reset_basis_stores(c)
    nav.select_company(c)
    nav.select_role(c)

    # `--keep` re-uses the payroll already in the profile, which is what you
    # want while iterating on a clip; a full run seeds it from scratch.
    if "--keep" not in sys.argv:
        print("seeding the end-to-end payroll (this takes a few minutes)…")
        nav.run_e2e_payroll(c)
    nav.select_company(c)
    nav.select_role(c)

    # The scenario runner stops at Draft. The rules this deck demonstrates only
    # apply once a transaction is posted, so it is walked through review,
    # approval and posting using the app's own buttons.
    state = nav.transaction_state(c)
    if state.get("status") not in ("Posted", "Locked"):
        state = nav.post_transaction(c)
    txn = state["tx"]
    print("posted transaction:", txn, state["status"])
    with open("shots/transaction.txt", "w", encoding="utf-8") as fh:
        fh.write(txn)

    nav.open_payroll_trail(c=c, seed=False)

    # --- the calculation ledger, with the version each step applied ----------
    c.js("""(() => {
      const b = [...document.querySelectorAll('button')]
        .find(e => /How it was computed|Computation/i.test(e.textContent.trim()));
      if (b) b.click();
    })()""")
    time.sleep(1.6)

    steps = c.js("""(() => {
      const s = [...document.querySelectorAll('.payroll-trail-step')].slice(0, 5);
      return s.map(e => e.innerText.replace(/\\s+/g, ' ').slice(0, 90));
    })()""")
    print("ledger steps:", steps)

    # Rects are read at scroll-top so they are page coordinates:
    # captureBeyondViewport clips in page space, and scrolling first would
    # offset every measurement by the scroll distance.
    c.js("window.scrollTo(0, 0)")
    time.sleep(0.4)

    first = c.rect(".payroll-trail-step", 0)
    fifth = c.rect(".payroll-trail-step", 4)
    capture(c, "trail-versions",
            clip_rect=(first["x"] - 12, first["y"] - 10,
                       first["width"] + 24,
                       fifth["y"] + fifth["height"] - first["y"] + 20),
            anchors={
                "code": _rect_of(c, ".policy-code-chip"),
                "version": _rect_of(c, ".version-code-chip"),
                "amount": _rect_of(c, ".payroll-trail-result"),
            })

    # --- the snapshot the transaction captured -------------------------------
    head = c.js("""(() => {
      const h = [...document.querySelectorAll('h3')]
        .find(x => /Formula versions applied/.test(x.textContent));
      if (!h) return null;
      const sec = h.closest('section');
      const r = sec.getBoundingClientRect();
      // Ten rows is what stays readable projected; the panel itself scrolls.
      const rows = [...sec.querySelectorAll("tbody tr")].slice(0, 10);
      const last = rows[rows.length - 1].getBoundingClientRect();
      return {x: r.x, y: r.y, width: r.width, height: last.y + last.height - r.y + 14};
    })()""")
    if not head:
        raise RuntimeError("Formula versions applied panel not found")

    ths = c.js("""(() => {
      const h = [...document.querySelectorAll('h3')]
        .find(x => /Formula versions applied/.test(x.textContent));
      const sec = h.closest('section');
      const out = {};
      [...sec.querySelectorAll('thead th')].forEach(th => {
        const r = th.getBoundingClientRect();
        out[th.textContent.trim()] = {x: r.x, y: r.y, width: r.width, height: r.height};
      });
      return out;
    })()""")

    capture(c, "trail-snapshot",
            clip_rect=(head["x"] - 14, head["y"] - 14, head["width"] + 28, head["height"] + 28),
            anchors={
                "code": ths.get("Code"),
                "version": ths.get("Version"),
                "effective": ths.get("Effective"),
                "owner": ths.get("Owner"),
                "expression": ths.get("Expression as applied"),
            })

    save()
    c.close()


if __name__ == "__main__":
    main()
