import time
from cdp import Chrome

c = Chrome(width=1600, height=1000, scale=2, port=9334, profile="chrome-profile")
c.goto("http://localhost:5175/", settle=3)
c.js("[...document.querySelectorAll('button')].find(e=>(e.getAttribute('aria-label')||'')==='Payroll').click()")
time.sleep(1.6)
c.click_text("Payroll Processing", settle=2.2)
c.js("[...document.querySelectorAll('tbody button')].at(-1).click()")
time.sleep(0.8)
c.js("[...document.querySelectorAll('button')].find(e=>e.innerText.trim()==='View Transaction').click()")
time.sleep(2.2)
c.js("[...document.querySelectorAll('tbody tr')][0].querySelector('button').click()")
time.sleep(1.6)
print("PAGE H:", c.js("document.body.scrollHeight"))
print(c.js("document.body.innerText"))
c.close()
