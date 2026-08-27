"""Capture helpers that record *where* things are, not just what they look like.

Every capture writes a PNG plus an anchor record: the pixel rectangle of each
named field inside that PNG. The deck builder then draws numbered markers that
are guaranteed to sit on the field they describe, which is the failure mode the
previous deck had.
"""
import json
import os

SHOTS = "shots"
ANCHORS = {}


def _rect_of(c, selector=None, nth=0, text=None, tag="*"):
    """Viewport rect of an element, by selector or by exact/contained text."""
    if selector:
        return c.rect(selector, nth)
    return c.js(f"""
    (() => {{
      const needle = {json.dumps(text)};
      const els = [...document.querySelectorAll({json.dumps(tag)})].filter(e => {{
        const t = (e.textContent||'').trim();
        if (!t.includes(needle)) return false;
        if (e.querySelector('*') && [...e.children].some(ch => (ch.textContent||'').trim().includes(needle))) return false;
        const r = e.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      }});
      const el = els[{nth}];
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return {{x:r.x, y:r.y, width:r.width, height:r.height}};
    }})()""")


def field_rect(c, label, nth=0):
    """Rect of the control that belongs to a form label, label included."""
    return c.js(f"""
    (() => {{
      const needle = {json.dumps(label)};
      const labels = [...document.querySelectorAll('label')].filter(l =>
        (l.childNodes[0] && (l.childNodes[0].textContent||'').trim() === needle)
        || (l.innerText||'').trim().split('\\n')[0] === needle);
      const l = labels[{nth}];
      if (!l) return null;
      const r = l.getBoundingClientRect();
      return {{x:r.x, y:r.y, width:r.width, height:r.height}};
    }})()""")


def capture(c, name, clip_sel=None, clip_rect=None, pad=0, anchors=None, scale=None):
    """Screenshot a region and translate every anchor rect into image pixels.

    Rects arrive from `getBoundingClientRect()`, which is viewport-relative,
    while the CDP screenshot clip is in document coordinates. The two agree only
    while the page is scrolled to the top — so a capture that had to scroll to
    reach its subject silently photographed the wrong part of the page. The
    scroll offset is added here, once, for every caller. Anchor positions are
    relative to the clip origin, so they are unaffected either way.
    """
    scale = scale or c.scale
    if clip_rect is None:
        r = c.rect(clip_sel) if clip_sel else {"x": 0, "y": 0, "width": c.width, "height": c.height}
        if r is None:
            raise RuntimeError(f"capture({name}): clip selector {clip_sel!r} not found")
        clip_rect = (r["x"], r["y"], r["width"], r["height"])
    x, y, w, h = clip_rect
    x, y = max(0.0, x - pad), max(0.0, y - pad)
    w, h = w + pad * 2, h + pad * 2
    scroll = c.js("({x: window.scrollX || 0, y: window.scrollY || 0})") or {"x": 0, "y": 0}
    path = os.path.join(SHOTS, name + ".png")
    c.shot(path, clip=(x + scroll["x"], y + scroll["y"], w, h))

    record = {"file": path, "width": round(w * scale), "height": round(h * scale), "anchors": {}}
    for key, rect in (anchors or {}).items():
        if not rect:
            print(f"  ! anchor missing: {name}/{key}")
            continue
        record["anchors"][key] = {
            "x": round((rect["x"] - x) * scale),
            "y": round((rect["y"] - y) * scale),
            "w": round(rect["width"] * scale),
            "h": round(rect["height"] * scale),
        }
    ANCHORS[name] = record
    print(f"  captured {name}  {record['width']}x{record['height']}  anchors={list(record['anchors'])}")
    return record


def save(path="shots/anchors.json"):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(ANCHORS, fh, indent=2)
    print(f"wrote {path} ({len(ANCHORS)} captures)")


def span(*rects, pad=0):
    """Bounding box (as a clip tuple) around several element rects."""
    rs = [r for r in rects if r]
    if not rs:
        raise RuntimeError("span(): no rects")
    x0 = min(r["x"] for r in rs) - pad
    y0 = min(r["y"] for r in rs) - pad
    x1 = max(r["x"] + r["width"] for r in rs) + pad
    y1 = max(r["y"] + r["height"] for r in rs) + pad
    return (x0, y0, x1 - x0, y1 - y0)


def bbox(*rects, pad=0):
    """Bounding box of several rects, as an anchor dict."""
    x, y, w, h = span(*rects, pad=pad)
    return {"x": x, "y": y, "width": w, "height": h}
