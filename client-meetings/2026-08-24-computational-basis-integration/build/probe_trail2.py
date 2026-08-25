from atlas_nav import open_payroll_trail

c = open_payroll_trail()
for sel in [".payroll-source-trail", ".payroll-trail", ".payroll-trail-step",
            ".payroll-execution-heading", "main"]:
    print(sel, c.rect(sel), "count=", c.js("document.querySelectorAll(%r).length" % sel))
print()
print("exec classes:", c.js(
    "[...new Set([...document.querySelectorAll('*')].map(e=>e.className)"
    ".filter(cn=>typeof cn==='string'&&cn&&/execution|exec|ledger|step-row|payroll-step/i.test(cn)))].join(' | ')"))
print()
print("after heading siblings:", c.js("""
(() => {
  const h = document.querySelector('.payroll-execution-heading');
  if (!h) return 'none';
  let n = h.parentElement, out = [];
  for (const ch of n.children) { const r = ch.getBoundingClientRect();
    out.push(ch.tagName + '.' + ch.className + ' ' + Math.round(r.width) + 'x' + Math.round(r.height)); }
  return out.join(' | ');
})()"""))
print()
print("first step html:", c.js("document.querySelector('.payroll-trail-step').outerHTML.slice(0,900)"))
c.close()
