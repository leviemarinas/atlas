import time
from atlas_nav import open_computational_basis

c = open_computational_basis()
c.set_input("input[placeholder^='Search code']", "CUS-900")
time.sleep(1.0)
print("ROWS:", c.js("document.querySelectorAll('table tbody tr').length"))
c.click_sel("table tbody tr td:last-child button", 0, settle=1.6)
print("classes containing modal/drawer/panel:", c.js(
    "[...document.querySelectorAll('*')].filter(e=>/modal|drawer|panel|sheet/i.test(e.className||''))"
    ".map(e=>e.tagName+'.'+e.className).slice(0,20).join(' | ')"))
print("has CUS text:", c.js("document.body.innerText.includes('Standard test result')"))

c.click_text("Reference sources", tag="button", settle=1.6)
print("grid:", c.js("""
(() => {
  const card = [...document.querySelectorAll('*')].filter(e=>(e.innerText||'').startsWith('REF-001') && e.getBoundingClientRect().height>140 && e.getBoundingClientRect().height<340).pop();
  if(!card) return 'no card';
  const g = card.parentElement;
  const r = g.getBoundingClientRect();
  return g.tagName+'.'+g.className+' @'+Math.round(r.x)+','+Math.round(r.y)+' '+Math.round(r.width)+'x'+Math.round(r.height)+' kids='+g.children.length;
})()"""))
c.close()
