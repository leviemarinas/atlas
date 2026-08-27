# -*- coding: utf-8 -*-
"""Step 5 — binding a formula to what the company pays, and who it reaches.

Runs last, on the state the earlier scripts built. The subject is the join the
first four sections never had: Computational Basis says what a calculation is,
Services Information says what the company pays, and until now nothing
connected them.

The demonstration is deliberately one configuration seen by two employees. Cash
Advance is bound to the Absence Deduction formula and scoped to Rank and File,
then a payroll is run over both a Manager and a Rank and File employee. The same
record produces an amount for one and is withheld from the other, which is the
whole of sections 12 and 13 in a single worked example.
"""
import json
import os
import time

import atlas_nav as nav
import shotkit as sk
from shotkit import capture, span, _rect_of

os.makedirs("shots", exist_ok=True)

# The configuration this section is built on, and the register row that carries
# it. Cash Advance is the one seeded configuration whose name matches a seeded
# Deduction Management row, so it is the only pair that reaches payroll without
# inventing data the client has not seen.
CONFIG_CODE = "DED-003"
CONFIG_NAME = "Cash Advance"
FORMULA = "DED-001"
COVERED = "0000112345 - Ethan Collins"      # Rank and File — the binding applies
WITHHELD = "0011223345 - John Collins Doe"  # Managers — the scope withholds it


def modal_button(c, label):
    return c.js("""(() => {
      const b = [...document.querySelectorAll('.config-modal button')]
        .find(e => e.textContent.trim() === %s);
      if (!b) return false;
      b.click();
      return true;
    })()""" % json.dumps(label))


def set_react(c, selector, value, kind="change"):
    """Set a React-controlled input or select so the component sees the change."""
    return c.js("""(() => {
      const el = document.querySelector(%s);
      if (!el) return false;
      const proto = el.tagName === 'SELECT' ? window.HTMLSelectElement.prototype
                                            : window.HTMLInputElement.prototype;
      const set = Object.getOwnPropertyDescriptor(proto, 'value').set;
      set.call(el, %s);
      el.dispatchEvent(new Event(%s, {bubbles: true}));
      return true;
    })()""" % (json.dumps(selector), json.dumps(value), json.dumps(kind)))


def row_rect(c, needle, selector=".config-table tbody tr"):
    return c.js("""(() => {
      const tr = [...document.querySelectorAll(%s)].find(e => e.textContent.includes(%s));
      if (!tr) return null;
      const r = tr.getBoundingClientRect();
      return {x:r.x, y:r.y, width:r.width, height:r.height};
    })()""" % (json.dumps(selector), json.dumps(needle)))


def cell_rect(c, needle, column, selector=".config-table"):
    """The cell under a named column, in the row containing `needle`."""
    return c.js("""(() => {
      const table = document.querySelector(%s);
      if (!table) return null;
      const heads = [...table.querySelectorAll('thead th')].map(th => th.textContent.trim());
      const i = heads.indexOf(%s);
      if (i < 0) return null;
      const tr = [...table.querySelectorAll('tbody tr')].find(e => e.textContent.includes(%s));
      if (!tr) return null;
      const td = tr.querySelectorAll('td')[i];
      if (!td) return null;
      const r = td.getBoundingClientRect();
      return {x:r.x, y:r.y, width:r.width, height:r.height};
    })()""" % (json.dumps(selector), json.dumps(column), json.dumps(needle)))


def header_rect(c, label, selector=".config-table thead th"):
    return c.js("""(() => {
      const th = [...document.querySelectorAll(%s)].find(e => e.textContent.trim() === %s);
      if (!th) return null;
      const r = th.getBoundingClientRect();
      return {x:r.x, y:r.y, width:r.width, height:r.height};
    })()""" % (json.dumps(selector), json.dumps(label)))


def binding_row_rect(c, token):
    return c.js("""(() => {
      const tr = [...document.querySelectorAll('.binding-table tbody tr')]
        .find(e => e.textContent.includes(%s));
      if (!tr) return null;
      const r = tr.getBoundingClientRect();
      return {x:r.x, y:r.y, width:r.width, height:r.height};
    })()""" % json.dumps(token))


# ------------------------------------------------------- the register row
def add_register_row(c):
    """Give a Rank and File employee a Cash Advance, so the binding has a line.

    The seeded register only carries Cash Advance for a Manager. Without a
    covered employee the scope slide would show something withheld and nothing
    applied, which teaches half the rule.
    """
    nav.open_deduction_register(c)
    existing = c.js("""(() => [...document.querySelectorAll('tbody tr')]
      .filter(r => r.textContent.includes('Ethan Collins')
                && r.textContent.includes('Cash Advance')).length)()""")
    if existing:
        print("  register row already present")
        return
    c.click_text("Add", tag="button", settle=1.4)
    c.js("""(() => {
      const set = (el, v, ev) => {
        const proto = el.tagName === 'SELECT' ? window.HTMLSelectElement.prototype
                                              : window.HTMLInputElement.prototype;
        Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v);
        el.dispatchEvent(new Event(ev, {bubbles:true}));
      };
      const modal = document.querySelector('.operational-entry-modal');
      const labels = [...modal.querySelectorAll('label')];
      const by = name => labels.find(l => (l.innerText||'').trim().startsWith(name));
      set(by('Deduction Code').querySelector('input'), 'DED-2025-061', 'input');
      set(by('Deduction Name').querySelector('select'), 'Cash Advance', 'change');
      set(by('Employee').querySelector('select'), %s, 'change');
      set(by('Deduction Amount').querySelector('input'), '1500', 'input');
      set(by('Deduction Frequency').querySelector('select'), 'Semi-monthly', 'change');
      set(by('Start Date').querySelector('input'), '2025-01-01', 'input');
      set(by('End Date').querySelector('input'), '2026-12-31', 'input');
      set(by('Balance').querySelector('input'), '9000', 'input');
      set(by('Status').querySelector('select'), 'Active', 'change');
    })()""" % json.dumps(COVERED))
    time.sleep(0.6)
    c.js("""(() => {
      const b = [...document.querySelectorAll('.operational-entry-modal button')]
        .find(e => /Save record/.test(e.textContent));
      if (b) b.click();
    })()""")
    time.sleep(1.6)

    # The Manager's seeded row ends before the run being captured, so its window
    # is extended — otherwise the scope rule never gets the chance to withhold it.
    c.js("""(() => {
      const set = (el, v) => {
        Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')
          .set.call(el, v);
        el.dispatchEvent(new Event('input', {bubbles:true}));
      };
      const tr = [...document.querySelectorAll('tbody tr')]
        .find(r => r.textContent.includes('DED-2025-050'));
      if (!tr) return;
      [...tr.querySelectorAll('button')].find(b => b.getAttribute('aria-label') === 'Edit').click();
      setTimeout(() => {
        const modal = document.querySelector('.operational-entry-modal');
        const dates = [...modal.querySelectorAll('input[type=date]')];
        set(dates[1], '2026-12-31');
        [...modal.querySelectorAll('button')].find(b => /Save record/.test(b.textContent)).click();
      }, 700);
    })()""")
    time.sleep(2.4)
    print("  register rows prepared")


# ------------------------------------------------- the configuration itself
def configure(c):
    nav.open_service_module(c, "Deductions")

    # --------------------------------------------------------- the register, before
    capture(c, "bind-register-before",
            clip_rect=span(c.rect(".config-toolbar"), c.rect(".config-table"), pad=18),
            anchors={
                "scope": header_rect(c, "Applies To"),
                "basis": header_rect(c, "Basis of Computation"),
                "unbound": cell_rect(c, CONFIG_NAME, "Basis of Computation"),
            })

    # ------------------------------------------------------------ step 1: scope
    c.js("""(() => {
      const tr = [...document.querySelectorAll('.config-table tbody tr')]
        .find(e => e.textContent.includes(%s));
      [...tr.querySelectorAll('button')].find(b => b.getAttribute('aria-label') === 'Edit').click();
    })()""" % json.dumps(CONFIG_CODE))
    time.sleep(1.6)

    set_react(c, '.service-applicability select[aria-label="Applies to"]', "Employee Group")
    time.sleep(0.8)
    set_react(c, '.service-applicability select[aria-label="Employee group"]', "Rank and File")
    time.sleep(1.0)

    panel = c.rect(".service-applicability")
    label = c.js("""(() => {
      const l = [...document.querySelectorAll('.config-modal label')]
        .find(e => (e.innerText||'').trim().startsWith('Applies to'));
      if (!l) return null;
      const r = l.getBoundingClientRect();
      return {x:r.x, y:r.y, width:r.width, height:r.height};
    })()""")
    # Padded tightly: this control sits between two other fields, and a generous
    # pad clips the edge of each of them into shot.
    capture(c, "bind-scope",
            clip_rect=span(label, panel, pad=8),
            anchors={
                "kind": _rect_of(c, '.service-applicability select[aria-label="Applies to"]'),
                "group": _rect_of(c, '.service-applicability select[aria-label="Employee group"]'),
                "count": c.rect(".applicability-count"),
                "hint": _rect_of(c, ".service-applicability .field-hint"),
            })

    # ------------------------------------------------- step 3: the binding table
    modal_button(c, "Next")
    time.sleep(1.0)
    modal_button(c, "Next")
    time.sleep(1.4)

    set_react(c, ".binding-computation-field select", FORMULA)
    time.sleep(1.4)
    # `daily_rate` is left on Payroll runtime, where it defaults: the rate comes
    # from each employee's own salary record, which is the point of that source.
    # `absent_days` is the one this configuration decides, so it is pinned here.
    set_react(c, '.binding-table select[aria-label="Source for absent_days"]', "fixed")
    time.sleep(0.8)
    set_react(c, '.binding-table input[aria-label="Fixed value for absent_days"]', "2", kind="input")
    time.sleep(1.0)
    c.js("""(() => {
      const b = [...document.querySelectorAll('.binding-preview-row button')]
        .find(e => /Preview/.test(e.textContent));
      if (b) b.click();
    })()""")
    time.sleep(1.2)

    # From the step's own heading, so the page names itself rather than opening
    # on a half-cropped title.
    heading = c.js("""(() => {
      const h = [...document.querySelectorAll('.config-form-body h3')]
        .find(e => /Computation Binding/.test(e.textContent));
      const r = h.getBoundingClientRect();
      return {x:r.x, y:r.y, width:r.width, height:r.height};
    })()""")
    preview_row = c.rect(".binding-preview-row")
    capture(c, "bind-step",
            clip_rect=span(heading, preview_row, pad=16),
            anchors={
                "formula": c.rect(".binding-formula-preview"),
                "runtime": binding_row_rect(c, "daily_rate"),
                "fixed": binding_row_rect(c, "absent_days"),
                "resolved": header_rect(c, "Resolved value", ".binding-table thead th"),
                "preview": c.rect(".test-result"),
            })

    modal_button(c, "Save")
    time.sleep(2.0)

    # ----------------------------------------------------- the register, after
    capture(c, "bind-register",
            clip_rect=span(c.rect(".config-toolbar"), c.rect(".config-table"), pad=18),
            anchors={
                "scope": cell_rect(c, CONFIG_NAME, "Applies To"),
                "bound": cell_rect(c, CONFIG_NAME, "Basis of Computation"),
                "unbound": cell_rect(c, "Union Dues", "Basis of Computation"),
            })

    # -------------------------------------------------------- the record drawer
    c.js("""(() => {
      const tr = [...document.querySelectorAll('.config-table tbody tr')]
        .find(e => e.textContent.includes(%s));
      [...tr.querySelectorAll('button')].find(b => b.getAttribute('aria-label') === 'View').click();
    })()""" % json.dumps(CONFIG_CODE))
    time.sleep(1.8)
    c.js("""(() => {
      const h = [...document.querySelectorAll('.record-drawer h3')]
        .find(x => /Computation Binding/.test(x.textContent));
      if (h) h.scrollIntoView({block: 'start'});
    })()""")
    time.sleep(1.0)

    section = c.js("""(() => {
      const h = [...document.querySelectorAll('.record-drawer h3')]
        .find(x => /Computation Binding/.test(x.textContent));
      const sec = h.closest('section');
      const r = sec.getBoundingClientRect();
      return {x:r.x, y:r.y, width:r.width, height:r.height};
    })()""")
    capture(c, "bind-drawer",
            clip_rect=(section["x"] - 14, section["y"] - 14, section["width"] + 28, section["height"] + 28),
            anchors={
                "expression": c.rect(".record-drawer .binding-formula-preview"),
                "source": header_rect(c, "Source", ".record-drawer .binding-table thead th"),
                "boundto": header_rect(c, "Bound to", ".record-drawer .binding-table thead th"),
                "value": header_rect(c, "Value", ".record-drawer .binding-table thead th"),
            })
    c.js("""(() => {
      const b = [...document.querySelectorAll('.record-drawer button')]
        .find(e => e.textContent.trim() === 'Close');
      if (b) b.click();
    })()""")
    time.sleep(1.0)


# ------------------------------------------------------------- the payroll
def run_payroll(c):
    """A November 2025 run, so the seeded register rows are inside their window.

    A run left open by an earlier pass is recalculated rather than duplicated:
    ATLAS refuses a second open regular transaction, and recalculating is what
    picks up the configuration this script just changed anyway.
    """
    nav.rail(c, "Payroll")
    c.click_text("Payroll Processing", settle=2.2)

    existing = c.js("""(() => {
      const tr = [...document.querySelectorAll('tbody tr')]
        .find(e => e.textContent.includes('PR-2025-11'));
      return tr ? tr.textContent.slice(0, 40) : '';
    })()""")
    if existing:
        print("  recalculating the existing run:", existing.strip())
        c.js("""(() => {
          const tr = [...document.querySelectorAll('tbody tr')]
            .find(e => e.textContent.includes('PR-2025-11'));
          tr.querySelector('button').click();
        })()""")
        time.sleep(1.0)
        c.js("""(() => {
          const b = [...document.querySelectorAll('button')]
            .find(e => e.textContent.trim() === 'Recalculate');
          if (b) b.click();
        })()""")
        time.sleep(4.0)
    else:
        c.click_text("Create Transaction", tag="button", settle=2.0)
        set_react(c, ".page-content select", "PAY-2025-11-2")
        time.sleep(1.4)
        for _ in range(4):
            c.js("""(() => {
              const b = [...document.querySelectorAll('button')]
                .find(e => ['Next', 'Create transaction'].includes(e.textContent.trim()));
              if (b) b.click();
            })()""")
            time.sleep(1.8)
        time.sleep(3.0)

    state = c.js("""(() => {
      const key = Object.keys(localStorage).find(k => k.startsWith('atlas-payroll-runs-v1:'));
      const runs = JSON.parse(localStorage.getItem(key) || '[]');
      const r = runs.find(x => x.transactionNumber && x.month === 'November') || runs[0];
      if (!r) return null;
      const line = n => (r.result.lines || []).find(l => (l.name || '').includes(n));
      const covered = line('Ethan Collins');
      const withheld = line('John Collins Doe');
      return {
        tx: r.transactionNumber,
        covered: (covered.deductions || []).filter(d => /Cash Advance/.test(d.name))
                   .map(d => d.name + ' ' + d.deducted),
        boundStep: (covered.steps || []).filter(s => s.source === 'Services Information binding')
                     .map(s => s.code + ' v' + s.version + ' = ' + s.amount),
        withheldNote: (withheld.exceptions || []).filter(e => /was not applied/.test(e.message))
                        .map(e => e.message),
      };
    })()""")
    print("  payroll:", json.dumps(state, indent=2))
    with open("shots/binding-run.json", "w", encoding="utf-8") as fh:
        json.dump(state, fh, indent=2)
    if not state or not state.get("boundStep"):
        raise RuntimeError(f"the bound step did not reach the payroll line: {state}")
    if not state.get("withheldNote"):
        raise RuntimeError(f"the scope rule withheld nothing: {state}")
    return state


def open_transaction(c):
    """From anywhere in Payroll, land inside the captured transaction.

    Creating a run leaves you inside it; recalculating an existing one leaves
    you on the list. Routing both through here means the capture does not depend
    on which of the two happened.
    """
    inside = c.js("""(() => !![...document.querySelectorAll('button')]
      .find(e => e.textContent.trim() === 'Exceptions'))()""")
    if not inside:
        nav.rail(c, "Payroll")
        c.click_text("Payroll Processing", settle=2.2)
        c.js("""(() => {
          const tr = [...document.querySelectorAll('tbody tr')]
            .find(e => e.textContent.includes('PR-2025-11'));
          if (tr) tr.querySelector('button').click();
        })()""")
        time.sleep(1.0)
        c.js("""(() => {
          const b = [...document.querySelectorAll('button')]
            .find(e => /View Transaction|Update Entry/.test(e.textContent));
          if (b) b.click();
        })()""")
        time.sleep(2.6)
    c.js("""(() => {
      const b = [...document.querySelectorAll('button')]
        .find(e => e.textContent.trim() === 'Employees');
      if (b) b.click();
    })()""")
    time.sleep(1.4)


def capture_trail(c):
    """The covered employee's line: the bound step, with the sources it used."""
    open_transaction(c)
    c.js("""(() => {
      const tr = [...document.querySelectorAll('tbody tr')]
        .find(e => e.textContent.includes('Ethan Collins'));
      const b = tr && tr.querySelector('button, a');
      if (b) b.click();
    })()""")
    time.sleep(2.4)
    c.wait_text("Source, policy, and output trail")

    # The step that carries the binding, found by its own detail line rather
    # than by name: DED-001 also prices unpaid leave on this same trail, and
    # only one of the two was produced by a bound configuration.
    index = c.js("""(() => {
      const steps = [...document.querySelectorAll('.payroll-trail-step')];
      return steps.findIndex(e => /bound formula/.test(e.textContent || ''));
    })()""")
    if index is None or index < 0:
        raise RuntimeError("the bound step is not on the trail")
    c.js("document.querySelectorAll('.payroll-trail-step')[%d]"
         ".scrollIntoView({block:'center'})" % index)
    time.sleep(0.9)

    def within(selector):
        return c.js("""(() => {
          const s = document.querySelectorAll('.payroll-trail-step')[%d];
          const el = s.querySelector(%s);
          if (!el) return null;
          const r = el.getBoundingClientRect();
          return {x:r.x, y:r.y, width:r.width, height:r.height};
        })()""" % (index, json.dumps(selector)))

    step = c.rect(".payroll-trail-step", index)
    # A trail step is a wide, shallow strip. The code and version chips sit side
    # by side inside it, so they take one marker between them — three markers
    # spread left, middle and right stay legible where four crowding the left
    # obscure the very chips they point at.
    capture(c, "bind-trail",
            clip_rect=(step["x"] - 12, step["y"] - 12, step["width"] + 24, step["height"] + 24),
            anchors={
                "codever": sk.bbox(within(".policy-code-chip"), within(".version-code-chip")),
                "detail": within("small"),
                "amount": within(".payroll-trail-result"),
            })


def capture_withheld(c):
    """The exception register: the item the scope rule held back, and from whom.

    Transaction-level, not per employee — the message is one row in the run's
    own Exceptions tab, beside every other thing the run wants a human to see.
    """
    c.js("""(() => {
      const b = [...document.querySelectorAll('button, a')]
        .find(e => /Back to/.test(e.textContent || ''));
      if (b) b.click();
    })()""")
    time.sleep(2.2)
    open_transaction(c)
    c.js("""(() => {
      const b = [...document.querySelectorAll('button')]
        .find(e => e.textContent.trim() === 'Exceptions');
      if (b) b.click();
    })()""")
    time.sleep(1.8)

    def message_cell():
        return c.js("""(() => {
          const td = [...document.querySelectorAll('td')]
            .find(e => /was not applied/.test(e.textContent || ''));
          if (!td) return null;
          const r = td.getBoundingClientRect();
          return {x:r.x, y:r.y, width:r.width, height:r.height};
        })()""")

    c.js("""(() => {
      const td = [...document.querySelectorAll('td')]
        .find(e => /was not applied/.test(e.textContent || ''));
      if (td) td.scrollIntoView({block: 'center'});
    })()""")
    time.sleep(0.9)

    cell = message_cell()
    if not cell:
        raise RuntimeError("the withheld message is not in the exception register")
    row = c.js("""(() => {
      const td = [...document.querySelectorAll('td')]
        .find(e => /was not applied/.test(e.textContent || ''));
      const tr = td.closest('tr');
      const r = tr.getBoundingClientRect();
      return {x:r.x, y:r.y, width:r.width, height:r.height};
    })()""")
    # Framed from the table's own top edge to the bottom of the row that
    # matters, so no half-row hangs off either end.
    frame = c.js("""(() => {
      const td = [...document.querySelectorAll('td')]
        .find(e => /was not applied/.test(e.textContent || ''));
      const table = td.closest('table');
      const t = table.getBoundingClientRect();
      const r = td.closest('tr').getBoundingClientRect();
      return {x: t.x, y: t.y, width: t.width, height: r.y + r.height - t.y};
    })()""")
    # The top edge is trimmed *into* the table rather than padded away from it:
    # the paragraph above sits close enough that any top pad clips its descenders
    # into shot.
    capture(c, "scope-withheld",
            clip_rect=(frame["x"] - 14, frame["y"] + 3, frame["width"] + 28, frame["height"] - 1),
            anchors={
                "who": c.js("""(() => {
                  const td = [...document.querySelectorAll('td')]
                    .find(e => /was not applied/.test(e.textContent || ''));
                  const first = td.closest('tr').querySelectorAll('td')[0];
                  const r = first.getBoundingClientRect();
                  return {x:r.x, y:r.y, width:r.width, height:r.height};
                })()"""),
                "reason": cell,
            })


def main():
    c = nav.browser()
    try:
        c.goto(nav.BASE, settle=2.5)
        nav.select_company(c)
        nav.select_role(c)

        add_register_row(c)
        configure(c)
        run_payroll(c)
        capture_trail(c)
        capture_withheld(c)
    finally:
        # Anchors are written even when a later step fails, so a partial run is
        # diagnosable from the images it did manage to take.
        sk.save("shots/anchors-binding.json")
        c.close()


if __name__ == "__main__":
    main()
