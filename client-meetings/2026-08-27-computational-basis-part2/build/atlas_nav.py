"""Navigation helpers for driving the ATLAS prototype during Part 2 capture.

Carried over from the Part 1 build, with three changes:

  * the Computational Basis stores moved to company-scoped `-v4` keys, so the
    reset list is rebuilt by prefix rather than named one by one;
  * `open_standard_library()` is new — Part 2 spends real time in Settings,
    which Part 1 never opened;
  * `posted_transaction_number()` reads back the transaction the scenario
    runner posted, so the deck's copy quotes the run it actually captured.
"""
import os
import time

from cdp import Chrome

# The dev server the capture drives. Overridable because port 5175 is often
# already taken by another session's server, and capturing against a stale one
# silently produces screenshots of code that is not the code being shipped.
BASE = os.environ.get("ATLAS_BASE", "http://localhost:5175/")
PROFILE = "chrome-profile"


def browser(width=1600, height=1000, scale=2, port=9333):
    return Chrome(width=width, height=height, scale=scale, port=port, profile=PROFILE)


# One company for the whole deck. Part 1 was captured here because it is the
# only tenant carrying a posted payroll, and Part 2 has to line up with it.
COMPANY = "Atlas Simulator Sandbox"


def select_company(c, name=COMPANY):
    current = c.js("(()=>{const b=[...document.querySelectorAll('button')]"
                   ".find(e=>/PH-\\d{3}/.test(e.innerText));return b?b.innerText:''})()")
    if name in (current or ""):
        return
    c.js("[...document.querySelectorAll('button')].find(e=>/PH-\\d{3}/.test(e.innerText)).click()")
    time.sleep(0.8)
    c.js("(()=>{const b=[...document.querySelectorAll('button,li,[role=option]')]"
         ".find(e=>e.innerText.includes(%r));if(b)b.click();})()" % name)
    time.sleep(1.8)


def select_role(c, role="Client Admin"):
    c.js("(()=>{const b=[...document.querySelectorAll('button')]"
         ".find(e=>e.innerText.trim()===%r);if(b)b.click();})()" % role)
    time.sleep(1.8)


def rail(c, label):
    """The left brand rail buttons carry no text, only an aria-label."""
    c.js("(()=>{const b=[...document.querySelectorAll('.brand-rail button')]"
         ".find(e=>(e.getAttribute('aria-label')||'')===%r);if(b)b.click();})()" % label)
    time.sleep(1.4)


def run_e2e_payroll(c):
    """Drive Scenario Studio's end-to-end journey so a posted payroll exists.

    Seeding and capturing share one browser session: Chrome does not reliably
    flush localStorage between headless runs.
    """
    c.js("[...document.querySelectorAll('button')].find(e=>e.textContent.trim()==='Scenarios').click()")
    time.sleep(2.2)
    c.js("[...document.querySelectorAll('[role=tab]')].find(e=>e.textContent.includes('Full end-to-end')).click()")
    time.sleep(2.0)
    c.js("[...document.querySelectorAll('button')].find(e=>e.textContent.includes('Reset and run all')).click()")
    for _ in range(90):
        time.sleep(4)
        st = c.js("(()=>{const el=document.querySelector('.e2e-journey-progress');return el?el.innerText:''})()")
        if "6 of 7" in st or "7 of 7" in st:
            break
    time.sleep(2)
    c.goto(BASE, settle=3.0)
    select_role(c)


def reset_basis_stores(c):
    """Drop this browser's Computational Basis state back to seed.

    The v4 stores are company-scoped, so they are cleared by prefix. The
    payroll runs are deliberately left alone — the posted transaction is what
    the protection rules in this deck are demonstrated against.
    """
    c.js("""(() => {
      const prefixes = [
        'atlas-company-computations-v4',
        'atlas-computation-assignments-v4',
        'atlas-computation-references-v4',
        'atlas-computation-history-v4',
        'atlas-computation-versions-v4',
        'atlas-computation-migrated-v4',
      ];
      const exact = [
        'atlas-standard-computation-library-v4',
        'atlas-standard-computation-applicability-v4',
        'atlas-standard-computation-versions-v4',
      ];
      Object.keys(localStorage).forEach(k => {
        if (exact.includes(k) || prefixes.some(p => k.startsWith(p + ':'))) localStorage.removeItem(k);
      });
      return true;
    })()""")


def _runs_key(c):
    """The payroll-runs key for the company being captured.

    Other tenants in the same browser profile carry their own runs; reading the
    first matching key would report a transaction from a company this deck never
    opens.
    """
    return c.js("""(() => {
      const id = localStorage.getItem('atlas-active-company-v1') || '';
      const key = 'atlas-payroll-runs-v1:' + id;
      return localStorage.getItem(key) === null ? '' : key;
    })()""")


def transaction_state(c):
    """`{tx, status, errors}` for the captured company's payroll transaction."""
    key = _runs_key(c)
    if not key:
        return {"tx": "", "status": "", "errors": []}
    return c.js("""(() => {
      const runs = JSON.parse(localStorage.getItem(%r) || '[]');
      const r = runs.find(x => x.status !== 'Cancelled') || runs[0];
      if (!r) return {tx:'', status:'', errors:[]};
      return {tx: r.transactionNumber, status: r.status,
              errors: (r.result?.exceptions||[]).filter(e=>e.severity==='Error')
                        .map(e => (e.name||'') + ': ' + e.message)};
    })()""" % key)


def posted_transaction_number(c):
    return (transaction_state(c) or {}).get("tx", "")


# The workflow Annex C 5a defines, in order. The scenario runner leaves the
# transaction at Draft; the protection rules this deck demonstrates only bite
# once a transaction is posted, so it is walked the rest of the way through the
# app's own buttons rather than by writing a status into storage.
POST_SEQUENCE = ["Submit for Review", "Submit for Approval", "Approve", "Post"]


def post_transaction(c):
    """Advance the open company's transaction to Posted through the UI."""
    rail(c, "Payroll")
    c.click_text("Payroll Processing", settle=2.2)
    c.js("[...document.querySelectorAll('tbody button')].at(-1).click()")
    time.sleep(0.8)
    c.js("[...document.querySelectorAll('button')].find(e=>e.innerText.trim()==='View Transaction').click()")
    time.sleep(2.2)

    for label in POST_SEQUENCE:
        # Each action opens a remarks dialog and commits on the dialog's own
        # button, which repeats the action's label. Clicking the toolbar button
        # alone only opens the dialog, so the confirm is scoped to the modal.
        clicked = c.js("""(() => {
          const b = [...document.querySelectorAll('button')]
            .filter(e => !e.closest('.hrm-modal, [role=dialog], .modal'))
            .find(e => e.textContent.trim() === %r);
          if (!b) return false;
          b.click();
          return true;
        })()""" % label)
        time.sleep(1.2)
        confirmed = c.js("""(() => {
          const scope = document.querySelector('.hrm-modal, [role=dialog], .modal');
          if (!scope) return 'no-dialog';
          const b = [...scope.querySelectorAll('button')]
            .find(e => e.textContent.trim() === %r);
          if (!b) return 'no-confirm';
          b.click();
          return 'confirmed';
        })()""" % label)
        time.sleep(2.0)
        state = transaction_state(c)
        print(f"  {label}: {'ok' if clicked else 'not offered'} / {confirmed} -> {state.get('status')}")
        if state.get("status") in ("Posted", "Locked"):
            break

    state = transaction_state(c)
    if state.get("status") not in ("Posted", "Locked"):
        raise RuntimeError(
            f"transaction {state.get('tx')} stopped at {state.get('status')}; "
            f"blocking errors: {state.get('errors')}")
    return state


def open_computational_basis(width=1600, height=1000, scale=2, port=9333, tab=None,
                             reset=False, c=None):
    """Core › Company Configuration › Services Information › Payroll › Computational Basis."""
    if c is None:
        c = browser(width, height, scale, port)
        c.goto(BASE, settle=1.2)
    if reset:
        reset_basis_stores(c)
    c.goto(BASE, settle=3.0)
    select_company(c)
    select_role(c)
    c.click_text("Company Configuration")
    c.click_text("Services Information", settle=1.2)
    c.click_text("Payroll", tag="button", settle=1.2)
    c.click_text("Computational Basis", settle=1.8)
    c.wait_text("governed computations")
    if tab:
        c.click_text(tab, tag="button", settle=1.4)
    return c


def open_service_module(c, label, reset=False):
    """Services Information › Payroll › <label> — an Earning, Deduction, Bonus … register.

    The sibling of `open_computational_basis`. Part 3's subject is the join
    between the two: the formula library says what a calculation is, and these
    registers say what the company pays and who it reaches.
    """
    if reset:
        reset_basis_stores(c)
    c.goto(BASE, settle=3.0)
    select_company(c)
    select_role(c)
    c.click_text("Company Configuration")
    c.click_text("Services Information", settle=1.2)
    c.click_text("Payroll", tag="button", settle=1.2)
    c.click_text(label, settle=1.8)
    c.wait_text("Configuration")
    return c


def open_deduction_register(c):
    """Payroll › Deduction Management — the per-employee assignment register."""
    rail(c, "Payroll")
    c.click_text("Deduction Management", settle=2.2)
    c.wait_text("Deduction Management")
    return c


def open_standard_library(c):
    """Settings › Standard Computation Library — where a standard is defined once."""
    rail(c, "Settings")
    c.click_text("Standard Computation Library", settle=2.0)
    c.wait_text("Central source library")
    return c


def open_payroll_trail(width=1600, height=1000, scale=2, port=9333, seed=True, c=None):
    """The posted payroll, first employee, 'How it was computed'."""
    if c is None:
        c = browser(width, height, scale, port)
        c.goto(BASE, settle=3.0)
    if seed:
        run_e2e_payroll(c)
    select_company(c)
    rail(c, "Payroll")
    c.click_text("Payroll Processing", settle=2.2)
    c.js("[...document.querySelectorAll('tbody button')].at(-1).click()")
    time.sleep(0.8)
    c.js("[...document.querySelectorAll('button')].find(e=>e.innerText.trim()==='View Transaction').click()")
    time.sleep(2.2)
    c.js("[...document.querySelectorAll('tbody tr')][0].querySelector('button').click()")
    time.sleep(2.0)
    c.wait_text("Source, policy, and output trail")
    return c


def search_register(c, term):
    """Filter the computation register down to one code."""
    c.js("""(() => {
      const el = document.querySelector('.search-box input');
      const set = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value').set;
      set.call(el, %r);
      el.dispatchEvent(new Event('input', {bubbles:true}));
    })()""" % term)
    time.sleep(0.9)


def dump(c, needle=None, n=4000):
    t = c.js("document.body.innerText")
    if needle:
        i = t.find(needle)
        t = t[i:] if i >= 0 else t
    return t[:n]
