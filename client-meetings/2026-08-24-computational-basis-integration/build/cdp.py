"""Minimal Chrome DevTools Protocol driver for capturing prototype screenshots.

Launches a headless Chrome, talks CDP over a websocket, and exposes just the
verbs the capture scripts need: navigate, evaluate, click, wait-for, and
screenshot with an explicit clip so every deck image is framed on purpose
rather than cropped by accident.
"""
import base64
import json
import os
import shutil
import subprocess
import tempfile
import time

import requests
from websockets.sync.client import connect

CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"


class Chrome:
    def __init__(self, width=1600, height=1000, scale=2, port=9333, profile=None):
        self.width, self.height, self.scale, self.port = width, height, scale, port
        # A named profile keeps localStorage between runs, so seeded sandbox
        # payroll data survives from the seeding script to the capture scripts.
        self.persistent = profile is not None
        if self.persistent:
            self.profile = os.path.abspath(profile)
            os.makedirs(self.profile, exist_ok=True)
        else:
            self.profile = tempfile.mkdtemp(prefix="atlas-cdp-")
        self.proc = subprocess.Popen(
            [
                CHROME,
                "--headless=new",
                f"--remote-debugging-port={port}",
                f"--user-data-dir={self.profile}",
                f"--window-size={width},{height}",
                "--hide-scrollbars",
                "--force-device-scale-factor=1",
                "--disable-gpu",
                "--no-first-run",
                "--no-default-browser-check",
                "--disable-extensions",
                "--disable-background-timer-throttling",
                "--force-color-profile=srgb",
                "--font-render-hinting=none",
                "about:blank",
            ],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        target = None
        for _ in range(120):
            try:
                tabs = requests.get(f"http://127.0.0.1:{port}/json", timeout=2).json()
                target = next((t for t in tabs if t["type"] == "page"), None)
                if target:
                    break
            except Exception:
                pass
            time.sleep(0.25)
        if not target:
            raise RuntimeError("Chrome did not expose a page target")
        self.ws = connect(target["webSocketDebuggerUrl"], max_size=200 * 1024 * 1024)
        self._id = 0
        self.send("Page.enable")
        self.send("Runtime.enable")
        self.send(
            "Emulation.setDeviceMetricsOverride",
            {
                "width": width,
                "height": height,
                "deviceScaleFactor": scale,
                "mobile": False,
            },
        )

    def send(self, method, params=None):
        self._id += 1
        mid = self._id
        self.ws.send(json.dumps({"id": mid, "method": method, "params": params or {}}))
        while True:
            msg = json.loads(self.ws.recv())
            if msg.get("id") == mid:
                if "error" in msg:
                    raise RuntimeError(f"{method}: {msg['error']}")
                return msg.get("result", {})

    # ---- page verbs -----------------------------------------------------
    def goto(self, url, settle=1.6):
        self.send("Page.navigate", {"url": url})
        time.sleep(settle)

    def js(self, expression, awaitp=False):
        res = self.send(
            "Runtime.evaluate",
            {
                "expression": expression,
                "returnByValue": True,
                "awaitPromise": awaitp,
                "userGesture": True,
            },
        )
        if res.get("exceptionDetails"):
            raise RuntimeError(res["exceptionDetails"].get("text", "js error")
                               + " :: " + str(res["exceptionDetails"].get("exception", {}).get("description", "")))
        return res.get("result", {}).get("value")

    def viewport(self, width=None, height=None):
        self.width = width or self.width
        self.height = height or self.height
        self.send(
            "Emulation.setDeviceMetricsOverride",
            {"width": self.width, "height": self.height,
             "deviceScaleFactor": self.scale, "mobile": False},
        )
        time.sleep(0.25)

    def click_text(self, text, tag="*", nth=0, settle=0.7, exact=False):
        """Click the nth element whose trimmed text matches."""
        cmp = "t === needle" if exact else "t.includes(needle)"
        script = f"""
        (() => {{
          const needle = {json.dumps(text)};
          const els = [...document.querySelectorAll({json.dumps(tag)})].filter(e => {{
            const t = (e.textContent || '').trim();
            if (!({cmp})) return false;
            if (e.querySelector('*') && [...e.children].some(c => (c.textContent||'').trim().includes(needle))) return false;
            const r = e.getBoundingClientRect();
            return r.width > 0 && r.height > 0;
          }});
          const el = els[{nth}];
          if (!el) return 'MISS:' + els.length;
          el.scrollIntoView({{block:'center'}});
          el.click();
          return 'OK';
        }})()
        """
        out = self.js(script)
        time.sleep(settle)
        if isinstance(out, str) and out.startswith("MISS"):
            raise RuntimeError(f"click_text({text!r}) found no match ({out})")
        return out

    def click_sel(self, selector, nth=0, settle=0.7):
        out = self.js(f"""
        (() => {{
          const els=[...document.querySelectorAll({json.dumps(selector)})];
          const el=els[{nth}]; if(!el) return 'MISS:'+els.length;
          el.scrollIntoView({{block:'center'}}); el.click(); return 'OK';
        }})()""")
        time.sleep(settle)
        if isinstance(out, str) and out.startswith("MISS"):
            raise RuntimeError(f"click_sel({selector!r}) found no match ({out})")
        return out

    def set_input(self, selector, value, nth=0, settle=0.35):
        out = self.js(f"""
        (() => {{
          const els=[...document.querySelectorAll({json.dumps(selector)})];
          const el=els[{nth}]; if(!el) return 'MISS:'+els.length;
          const proto = el.tagName==='TEXTAREA' ? window.HTMLTextAreaElement.prototype
                      : el.tagName==='SELECT' ? window.HTMLSelectElement.prototype
                      : window.HTMLInputElement.prototype;
          const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
          el.scrollIntoView({{block:'center'}});
          el.focus();
          setter.call(el, {json.dumps(value)});
          el.dispatchEvent(new Event('input', {{bubbles:true}}));
          el.dispatchEvent(new Event('change', {{bubbles:true}}));
          return 'OK';
        }})()""")
        time.sleep(settle)
        if isinstance(out, str) and out.startswith("MISS"):
            raise RuntimeError(f"set_input({selector!r}) found no match ({out})")
        return out

    def rect(self, selector, nth=0):
        return self.js(f"""
        (() => {{
          const els=[...document.querySelectorAll({json.dumps(selector)})];
          const el=els[{nth}]; if(!el) return null;
          const r=el.getBoundingClientRect();
          return {{x:r.x, y:r.y, width:r.width, height:r.height}};
        }})()""")

    def wait_text(self, text, timeout=12):
        end = time.time() + timeout
        while time.time() < end:
            if self.js(f"document.body.innerText.includes({json.dumps(text)})"):
                return True
            time.sleep(0.2)
        raise TimeoutError(f"wait_text({text!r}) timed out")

    def shot(self, path, clip=None, pad=0):
        params = {"format": "png", "captureBeyondViewport": bool(clip)}
        if clip:
            x, y, w, h = clip
            x, y = max(0, x - pad), max(0, y - pad)
            w, h = w + pad * 2, h + pad * 2
            # deviceScaleFactor already renders at 2x; clip scale must stay 1
            params["clip"] = {"x": x, "y": y, "width": w, "height": h, "scale": 1}
        data = self.send("Page.captureScreenshot", params)["data"]
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "wb") as fh:
            fh.write(base64.b64decode(data))
        return path

    def close(self):
        try:
            self.ws.close()
        except Exception:
            pass
        # Chrome spawns a process tree; terminating only the launcher leaves
        # children holding the profile directory open.
        try:
            self.send("Browser.close")
        except Exception:
            pass
        self.proc.terminate()
        try:
            self.proc.wait(timeout=8)
        except Exception:
            subprocess.run(["taskkill", "/F", "/T", "/PID", str(self.proc.pid)],
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        if not self.persistent:
            shutil.rmtree(self.profile, ignore_errors=True)

    def wait_rect(self, selector, timeout=8, nth=0):
        """Poll until an element exists and has a box; returns its rect."""
        end = time.time() + timeout
        while time.time() < end:
            r = self.rect(selector, nth)
            if r and r["width"] > 1 and r["height"] > 1:
                return r
            time.sleep(0.2)
        return None
