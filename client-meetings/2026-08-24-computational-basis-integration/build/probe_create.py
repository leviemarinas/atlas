import time
from atlas_nav import open_computational_basis

c = open_computational_basis()
c.click_text("Create computation", tag="button", settle=1.5)

M = "section.modal "
c.set_input(M + "input[placeholder^='e.g.']", "CUS-900")
c.set_input(M + "input", "Variable Allowance by Approved Units", nth=1)
c.set_input(M + "select", "Earnings", nth=0)
c.set_input(M + "textarea", "Values an approved variable allowance from the approved unit count and the assigned unit rate.", nth=0)

# expression: allowance_units x allowance_unit_rate
c.set_input(M + "select", "allowance_units", nth=2)
c.click_text("Insert field", tag="button", settle=0.5)
c.click_text("×", tag="button", settle=0.4, exact=True)
c.set_input(M + "select", "allowance_unit_rate", nth=2)
c.click_text("Insert field", tag="button", settle=0.7)
print("EXPR:", c.js("document.querySelectorAll('section.modal textarea')[1].value"))
print("MAPPED:", c.js("(()=>{const t=document.querySelector('section.modal table');return t?t.innerText:'none'})()"))

c.click_text("Test calculation", tag="button", settle=1.0)
print("=== TEST TAB ===")
print(c.js("document.querySelector('section.modal').innerText")[:1200])
print("TEST INPUTS:", c.js("[...document.querySelectorAll('section.modal input')].map((e,i)=>i+':'+e.type+'/'+(e.placeholder||'')+'/'+e.value).join(' | ')"))
c.close()
