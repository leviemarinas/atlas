import time
from atlas_nav import browser

c = browser()
c.goto("http://localhost:5175/", settle=3)


def switch(name):
    c.js("[...document.querySelectorAll('button')].find(e=>/PH-\\d{3}/.test(e.innerText)).click()")
    time.sleep(0.8)
    c.js("(()=>{const b=[...document.querySelectorAll('button,li,[role=option]')]"
         ".find(e=>e.innerText.includes(%r));if(b)b.click();})()" % name)
    time.sleep(1.6)


for company in ["Meridian Consumer Products", "Atlas Simulator Sandbox", "Northstar Retail", "ABC Company Ltd"]:
    switch(company)
    c.js("[...document.querySelectorAll('button')].find(e=>(e.getAttribute('aria-label')||'')==='Payroll').click()")
    time.sleep(1.4)
    c.click_text("Payroll Processing", settle=2.0)
    txt = c.js("document.body.innerText")
    rows = c.js("[...document.querySelectorAll('tbody tr')].map(t=>t.innerText.split('\\t').slice(0,2).join(' ')).join(' ;; ')")
    print(f"--- {company}: rows={rows[:200]!r}")
    c.js("[...document.querySelectorAll('button')].find(e=>(e.getAttribute('aria-label')||'')==='Core').click()")
    time.sleep(1.2)
c.close()
