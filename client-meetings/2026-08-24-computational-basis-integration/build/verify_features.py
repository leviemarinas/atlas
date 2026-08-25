# -*- coding: utf-8 -*-
"""Prove the two new features work in the running app.

1. An expression can build on a published computation, the mapped-field table
   names it, and the test resolves the whole chain.
2. Import CSV offers a template whose headers match what the importer reads.
"""
import time

from atlas_nav import open_computational_basis

M = "section.modal "
c = open_computational_basis(reset_basis=True)

# ── 1 · the template download ─────────────────────────────────────────────
print("TOOLBAR:", c.js(
    "[...document.querySelectorAll('.basis-toolbar-actions button')]"
    ".map(e=>e.innerText.trim()).join(' | ')"))

# downloadFile builds a Blob URL, so intercept the Blob itself
c.js("""
window.__dl = [];
const realCreate = URL.createObjectURL;
URL.createObjectURL = function (blob) {
  const entry = { text: null };
  window.__dl.push(entry);
  blob.text().then(t => { entry.text = t; });
  return realCreate.call(URL, blob);
};
const realClick = HTMLAnchorElement.prototype.click;
HTMLAnchorElement.prototype.click = function () {
  if (this.download) { const e = window.__dl[window.__dl.length - 1]; if (e) e.name = this.download; return; }
  return realClick.call(this);
};
""")
c.click_text("Download template", tag="button", settle=1.5)
print("TEMPLATE FILE:", c.js("(window.__dl[0]||{}).name || '(none)'"))
print("TEMPLATE CONTENT:")
for line in (c.js("(window.__dl[0]||{}).text || ''") or "").split("\n"):
    print("   ", line[:160])

# the header row must match the columns the importer actually reads
header = (c.js("((window.__dl[0]||{}).text || '').split('\\n')[0]") or "")
print("HEADER MATCHES IMPORTER:",
      all(col in header.lower() for col in ("code", "name", "category", "expression", "status", "effective date")))

# ── 2 · building on a published computation ───────────────────────────────
c.click_text("Create computation", tag="button", settle=1.6)
print("\nINSERT CONTROLS:", c.js(
    "[...document.querySelectorAll('section.modal .formula-insert-row button')]"
    ".map(e=>e.innerText.trim()).filter(Boolean).join(' | ')"))

c.set_input(M + "input[placeholder^='e.g.']", "CUS-910")
c.set_input(M + "input", "Overtime Value from Hourly Rate", nth=1)
c.set_input(M + "select", "Earnings", nth=0)
c.set_input(M + "textarea",
            "Values approved overtime using the published hourly rate formula rather than "
            "repeating its arithmetic.", nth=0)

# {{BAS-002}} * {{ot_hours}} — BAS-002 is Hourly Rate (daily rate / work hours)
c.set_input(M + ".formula-reference-row select", "BAS-002")
c.click_text("Insert computation", tag="button", settle=0.6)
c.click_text("×", tag="button", settle=0.4, exact=True)
c.set_input(M + "select", "ot_hours", nth=2)
c.click_text("Insert field", tag="button", settle=0.8)

print("EXPRESSION:", c.js("document.querySelectorAll('section.modal textarea')[1].value"))
print("MAPPED TABLE:")
for row in (c.js("[...document.querySelectorAll('section.modal table tr')]"
                 ".map(r=>[...r.children].map(td=>td.innerText.replace(/\\s+/g,' ').trim())"
                 ".join(' | ')).join('\\n')") or "").split("\n"):
    print("   ", row)

c.click_text("Test calculation", tag="button", settle=1.0)
labels = c.js("[...document.querySelectorAll('section.modal .test-input-grid label')]"
              ".map(e=>e.innerText.split('\\n')[0])")
print("\nCHAIN NOTE:", c.js(
    "(()=>{const e=document.querySelector('.test-reference-note');return e?e.innerText:'(none)'})()"))
print("INPUTS ASKED FOR:", " | ".join(labels))

# drive by label, not by position
values = {"Daily rate": "1600", "Hours per workday": "8", "Overtime hours": "10"}
for i, label in enumerate(labels):
    c.set_input(M + "input[type=number]", values[label], nth=i)
c.click_text("Run test", tag="button", settle=1.4)
print("RESULT:", c.js(
    "(()=>{const e=document.querySelector('.test-result');return e?e.innerText.replace(/\\n/g,' '):'(none)'})()"),
    "  — expected 1600 / 8 * 10 = 2,000")

# ── 3 · a self-reference is refused ───────────────────────────────────────
c.click_text("Formula setup", tag="button", settle=0.8)
c.set_input(M + "textarea", "{{CUS-910}} + 1", nth=1)
c.click_text("Validate and create", tag="button", settle=1.2)
print("\nSELF-REFERENCE REFUSED:", c.js(
    "(()=>{const e=document.querySelector('.basis-error');return e?e.innerText:'(no error shown)'})()"))
c.set_input(M + "textarea", "{{ZZZ-999}} + 1", nth=1)
c.click_text("Validate and create", tag="button", settle=1.2)
print("UNKNOWN CODE REFUSED:", c.js(
    "(()=>{const e=document.querySelector('.basis-error');return e?e.innerText:'(no error shown)'})()"))

# ── 4 · save the good version and confirm it lands ────────────────────────
c.set_input(M + "textarea", "{{BAS-002}} * {{ot_hours}}", nth=1)
c.click_text("Change details", tag="button", settle=0.8)
c.set_input(M + "textarea", "Initial release; builds on the published hourly rate.", nth=0)
c.click_text("Validate and create", tag="button", settle=2.0)
c.set_input("input[placeholder^='Search code']", "CUS-910")
time.sleep(1.0)
print("\nSAVED ROW:", c.js(
    "(()=>{const t=document.querySelector('table tbody tr');"
    "return t?[...t.children].map(td=>td.innerText.replace(/\\s+/g,' ').trim()).join(' | '):'MISSING'})()"))

c.click_sel("table tbody tr td:last-child button", 0, settle=1.4)
print("DRAWER 'BUILDS ON':", c.js(
    "(()=>{const e=[...document.querySelectorAll('.record-drawer section')]"
    ".find(s=>s.innerText.startsWith('Builds on'));"
    "return e?e.innerText.replace(/\\n/g,' | '):'(missing)'})()"))
c.close()
print("\nverification complete")
