"""Shared navigation helpers for driving the ATLAS prototype during capture."""
import time

from cdp import Chrome

BASE = "http://localhost:5175/"
PROFILE = "chrome-profile"


def browser(width=1600, height=1000, scale=2, port=9333):
    return Chrome(width=width, height=height, scale=scale, port=port, profile=PROFILE)


COMPANY = "Atlas Simulator Sandbox"


def select_company(c, name=COMPANY):
    """Every capture runs against one company so the deck's screenshots agree."""
    current = c.js("(()=>{const b=[...document.querySelectorAll('button')]"
                   ".find(e=>/PH-\d{3}/.test(e.innerText));return b?b.innerText:''})()")
    if name in (current or ""):
        return
    c.js("[...document.querySelectorAll('button')].find(e=>/PH-\d{3}/.test(e.innerText)).click()")
    time.sleep(0.8)
    c.js("(()=>{const b=[...document.querySelectorAll('button,li,[role=option]')]"
         ".find(e=>e.innerText.includes(%r));if(b)b.click();})()" % name)
    time.sleep(1.8)


def select_role(c, role="Client Admin"):
    """The end-to-end journey leaves the app in the Employee role; the payroll
    screens need Client Admin back."""
    c.js("(()=>{const b=[...document.querySelectorAll('button')]"
         ".find(e=>e.innerText.trim()===%r);if(b)b.click();})()" % role)
    time.sleep(1.8)


def run_e2e_payroll(c):
    """Drive Scenario Studio's full end-to-end journey so a posted payroll run
    exists. Seeding and capturing must share one browser session: Chrome does not
    reliably flush localStorage between headless runs."""
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


BASIS_KEYS = [
    "atlas-computational-basis-library-v3",
    "atlas-computational-basis-assignments-v3",
    "atlas-computational-basis-history-v3",
]


def open_computational_basis(width=1600, height=1000, scale=2, port=9333, tab=None,
                             reset_basis=False):
    """`reset_basis` drops the Computational Basis stores back to their seeds so a
    capture run that creates CUS-900 is repeatable rather than hitting a
    duplicate-code error on the second run."""
    c = browser(width, height, scale, port)
    c.goto(BASE, settle=1.2)
    if reset_basis:
        for key in BASIS_KEYS:
            c.js("localStorage.removeItem(%r)" % key)
    c.goto(BASE, settle=3.0)
    select_company(c)
    c.click_text("Company Configuration")
    c.click_text("Services Information", settle=1.2)
    c.click_text("Payroll", tag="button", settle=1.2)
    c.click_text("Computational Basis", settle=1.8)
    c.wait_text("governed computations")
    if tab:
        c.click_text(tab, tag="button", settle=1.4)
    return c


def open_payroll_trail(width=1600, height=1000, scale=2, port=9333, seed=True, c=None):
    """Posted payroll PR-2025-11-E2E, first employee, 'How it was computed'."""
    if c is None:
        c = browser(width, height, scale, port)
        c.goto(BASE, settle=3.0)
    if seed:
        run_e2e_payroll(c)
    select_company(c)
    c.js("[...document.querySelectorAll('button')].find(e=>(e.getAttribute('aria-label')||'')==='Payroll').click()")
    time.sleep(1.6)
    c.click_text("Payroll Processing", settle=2.2)
    c.js("[...document.querySelectorAll('tbody button')].at(-1).click()")
    time.sleep(0.8)
    c.js("[...document.querySelectorAll('button')].find(e=>e.innerText.trim()==='View Transaction').click()")
    time.sleep(2.2)
    c.js("[...document.querySelectorAll('tbody tr')][0].querySelector('button').click()")
    time.sleep(2.0)
    c.wait_text("Source, policy, and output trail")
    return c


def dump(c, needle=None, n=4000):
    t = c.js("document.body.innerText")
    if needle:
        i = t.find(needle)
        t = t[i:] if i >= 0 else t
    return t[:n]
