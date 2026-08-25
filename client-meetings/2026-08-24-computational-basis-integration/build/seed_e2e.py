"""Run the Scenario Studio full end-to-end payroll journey so a posted payroll
transaction (and its computation trail) exists to photograph."""
import time
from cdp import Chrome

c = Chrome(width=1600, height=1000, scale=2, port=9334, profile="chrome-profile")
c.goto("http://localhost:5175/", settle=3)
c.js("[...document.querySelectorAll('button')].find(e=>e.textContent.trim()==='Scenarios').click()")
time.sleep(2.0)
c.js("[...document.querySelectorAll('[role=tab]')].find(e=>e.textContent.includes('Full end-to-end')).click()")
time.sleep(2.0)
c.js("[...document.querySelectorAll('button')].find(e=>e.textContent.includes('Reset and run all')).click()")

last = ""
for i in range(90):
    time.sleep(5)
    st = c.js("(()=>{const el=document.querySelector('.e2e-journey-progress');return el?el.innerText:'n/a'})()")
    st = " / ".join(str(st).split("\n"))
    if st != last:
        print(i, st, flush=True)
        last = st
    if "7 of 7" in st:
        break

time.sleep(2)
print("STATUS:", c.js("(()=>{const el=document.querySelector('.e2e-status,.scenario-status');return el?el.innerText:''})()"))
c.shot("probe/e2e-done.png")
c.close()
print("done")
