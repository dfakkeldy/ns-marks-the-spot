#!/usr/bin/env python3
"""Responsive case at a TRUE 320x640 CSS viewport, via a same-origin iframe.

TWO EARLIER ATTEMPTS ARE DISCARDED. Their numbers must not be used.

  Attempt 1 (ff_responsive.py phase A): tried to reach 320 px with
  set_window_size. Firefox on macOS clamps the window to about 500 CSS px, so
  it measured a 500 px viewport and reported it as the requested one. It also
  read panel/group/card as clientWidth 0 without stopping - below the mobile
  breakpoint the control rail is collapsed and has no width until
  `.mobile-controls-trigger` adds `.mobile-open`. Zero was a collapsed rail,
  not a measurement.

  Attempt 2 (ff_responsive320.py): fixed the collapsed rail, and tried to reach
  320 px with `layout.css.devPixelsPerPx`. It did not work - innerWidth stayed
  at 500 while devicePixelRatio moved, so the CSS viewport never reached 320.
  The harness said so ("WARNING: innerWidth is 500, not 320") instead of
  quietly reporting 500 as 320. Its rail-open ledger at 500 px is valid as far
  as it goes, and is retained for comparison; its viewport is not 320.

THIS RUN. The application is loaded into a same-origin iframe sized to exactly
320x640 CSS pixels. An iframe establishes its own CSS viewport, so media
queries, layout and overflow inside it behave exactly as they would in a
320x640 window. The measurement is taken inside the frame, and the harness
ASSERTS innerWidth == 320 before believing anything it reads.

IndexedDB is per-origin and therefore shared with the parent document, so the
per-file reset and the recordsBeforeImport == 0 assertion still apply.

Usage: ff_responsive320b.py <origin> <outdir> <large.pdf>
"""
import json
import os
import subprocess
import sys
import time

_ORIGIN, _OUT, _LARGE = sys.argv[1], sys.argv[2], sys.argv[3]
# ff_chooser and ff_responsive320 both parse sys.argv at module level;
# ff_responsive320 needs argv[3], so keep a well-formed 4-element argv.
sys.argv = ["ff_chooser", _ORIGIN, _OUT, _LARGE]
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from selenium import webdriver  # noqa: E402
from selenium.webdriver.common.by import By  # noqa: E402
from selenium.webdriver.firefox.options import Options  # noqa: E402
from selenium.webdriver.firefox.service import Service  # noqa: E402

import ff_chooser as C  # noqa: E402
from ff_responsive320 import LEDGER  # noqa: E402

os.makedirs(_OUT, exist_ok=True)
T0 = time.time()
log = []


def L(msg):
    line = f"[{time.time() - T0:7.2f}s] {msg}"
    print(line, flush=True)
    log.append(line)


def shot(driver, stem):
    png = f"{_OUT}/{stem}.png"
    driver.save_screenshot(png)
    jpg = f"{_OUT}/{stem}.jpg"
    subprocess.run(["sips", "-s", "format", "jpeg", "-Z", "1440", png, "--out", jpg],
                   stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=False)
    if os.path.exists(jpg):
        os.remove(png)
        return os.path.basename(jpg)
    return os.path.basename(png)


def main():
    opts = Options()
    opts.set_preference("pdfjs.disabled", True)
    driver = webdriver.Firefox(
        options=opts,
        service=Service(executable_path="/opt/homebrew/bin/geckodriver",
                        log_path=f"{_OUT}/geckodriver320b.log"))
    driver.set_script_timeout(300)
    R = {"case": "responsive 320x640 at a true 320 CSS px viewport (same-origin iframe)",
         "supersedes": [
             "ff_responsive.py phase A - never got below 500 CSS px; also read a "
             "collapsed rail as clientWidth 0",
             "ff_responsive320.py - fixed the rail but devPixelsPerPx did not "
             "shrink the CSS viewport; innerWidth stayed 500"],
         "viewportMethod": "same-origin iframe sized to exactly 320x640 CSS px; "
                           "an iframe establishes its own CSS viewport, so media "
                           "queries and overflow behave as in a 320x640 window",
         "origin": _ORIGIN, "file": os.path.basename(_LARGE)}
    try:
        caps = driver.capabilities
        R["browserVersion"] = caps.get("browserVersion")
        R["mozBuildID"] = caps.get("moz:buildID")
        L(f"ATTACHED firefox {caps.get('browserVersion')}")
        driver.set_window_size(1440, 1000)

        # parent document: reset the shared per-origin IndexedDB
        driver.get(_ORIGIN)
        time.sleep(2)
        C.dismiss_dialog(driver)
        C.reset_storage(driver)
        driver.get(_ORIGIN)
        time.sleep(2)
        C.dismiss_dialog(driver)
        pre = driver.execute_async_script(C.DUMP_IDB)
        R["recordsBeforeImport"] = pre.get("recordCount")
        L(f"recordsBeforeImport={pre.get('recordCount')} (shared per-origin store)")
        if pre.get("recordCount"):
            raise SystemExit("GUARD VIOLATION: records survived reset")

        # mount the app in a 320x640 iframe
        driver.execute_script(r"""
          document.querySelectorAll('#probe320').forEach(n => n.remove());
          const f = document.createElement('iframe');
          f.id = 'probe320';
          f.src = arguments[0];
          f.style.cssText =
            'position:fixed;top:0;left:0;width:320px;height:640px;border:0;' +
            'z-index:2147483647;background:#fff';
          f.setAttribute('width', '320');
          f.setAttribute('height', '640');
          document.body.appendChild(f);
        """, _ORIGIN)
        time.sleep(6)
        driver.switch_to.frame(driver.find_element(By.ID, "probe320"))
        time.sleep(3)
        driver.execute_script(C.INSTRUMENT)
        C.dismiss_dialog(driver)
        driver.execute_script(C.INSTRUMENT)

        vp = driver.execute_script(
            "return [window.innerWidth, window.innerHeight, window.devicePixelRatio];")
        R["achievedViewport"] = {"innerWidth": vp[0], "innerHeight": vp[1],
                                 "devicePixelRatio": vp[2]}
        L(f"iframe CSS viewport: {vp[0]} x {vp[1]} (dpr {vp[2]})")
        if vp[0] != 320 or vp[1] != 640:
            R["outcome"] = f"MEASUREMENT_INVALID_VIEWPORT_{vp[0]}x{vp[1]}"
            L(f"  *** viewport is {vp[0]}x{vp[1]}, not 320x640 — "
              f"measurement rejected, not reported ***")
            return

        # import the long-filename file inside the frame
        inp = driver.find_elements(By.CSS_SELECTOR, "input[type=file]")[0]
        driver.execute_script(
            "arguments[0].style.display='block';arguments[0].style.visibility='visible';"
            "arguments[0].style.opacity=1;arguments[0].removeAttribute('hidden');", inp)
        t = time.time()
        inp.send_keys(_LARGE)
        ch = None
        while time.time() - t < 300:
            ch = driver.execute_script(C.READ_CHOOSER)
            if ch["dialogPresent"] and ch["radioCount"] > 0:
                break
            time.sleep(1.5)
        R["chooserAt320"] = ch
        L(f"chooser at 320px: radios={ch['radioCount']} "
          f"anyChecked={ch['anyChecked']} confirmDisabled={ch['confirmDisabled']}")
        target = next(o for o in ch["options"] if o["label"].strip() == "Map Layers")
        C.choose_frame(driver, target["value"])
        R["secondsToImport"] = round(time.time() - t, 2)
        L(f"imported in {R['secondsToImport']}s")

        R["ledgerRailClosed"] = driver.execute_script(LEDGER)
        driver.switch_to.default_content()
        R["shotRailClosed"] = shot(driver, "responsive-320x640-iframe-rail-closed")
        driver.switch_to.frame(driver.find_element(By.ID, "probe320"))

        opened = driver.execute_script(r"""
          const b = document.querySelector('.mobile-controls-trigger');
          if (!b) { return { found: false }; }
          b.click();
          return { found: true, expanded: b.getAttribute('aria-expanded') };
        """)
        R["mobileTrigger"] = opened
        time.sleep(2.0)

        led = driver.execute_script(LEDGER)
        R["ledgerRailOpen"] = led
        L(f"innerWidth={led['innerWidth']} railOpen={led['railOpen']} "
          f"documentOverflows={led['documentOverflows']}")
        for e in led["ledger"]:
            if e.get("present"):
                L(f"  {e['label']:30s} client={e['clientWidth']:5d} "
                  f"scroll={e['scrollWidth']:5d} overflowX={e['overflowX']}")
            else:
                L(f"  {e['label']:30s} ABSENT")
        L(f"overflowing (non-scrollers): {led['overflowing']}")
        L(f"long filename visible in row: {led['filenameVisible']}")
        for b in led["rowButtons"]:
            L(f"  button {b['text']!r} {b['w']}x{b['h']} "
              f"insideViewport={b['insideViewport']}")

        panel = next((e for e in led["ledger"] if e["label"].startswith("panel")), {})
        if not panel.get("present") or panel.get("clientWidth", 0) <= 0:
            R["outcome"] = "MEASUREMENT_INVALID_PANEL_ZERO_WIDTH"
            L("  *** panel width zero with the rail open — measurement rejected ***")
        elif led["documentOverflows"] or led["overflowing"]:
            R["outcome"] = "HORIZONTAL_OVERFLOW_PRESENT"
        elif not all(b["insideViewport"] for b in led["rowButtons"]):
            R["outcome"] = "CONTROL_OUTSIDE_VIEWPORT"
        else:
            R["outcome"] = "NO_HORIZONTAL_OVERFLOW_CONTROLS_OPERABLE"
        L(f"OUTCOME {R['outcome']}")
        R["diagnostics"] = driver.execute_script(r"""
          return { jsErrors: window.__errs || [],
                   unhandledRejections: window.__rej || [],
                   longTaskApiSupported: window.__longTaskSupported === true };
        """)
        driver.switch_to.default_content()
        R["shotRailOpen"] = shot(driver, "responsive-320x640-iframe-rail-open")
    finally:
        R["log"] = log
        with open(f"{_OUT}/responsive-320-iframe-result.json", "w") as f:
            json.dump(R, f, indent=2, default=str)
        print("WROTE", f"{_OUT}/responsive-320-iframe-result.json")
        driver.quit()


if __name__ == "__main__":
    main()
