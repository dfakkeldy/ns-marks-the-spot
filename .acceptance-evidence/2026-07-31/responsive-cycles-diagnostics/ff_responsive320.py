#!/usr/bin/env python3
"""Responsive case at a TRUE 320 CSS-pixel viewport — corrected re-run.

WHY THIS RE-RUN EXISTS. The first attempt (ff_responsive.py, phase A) is
DISCARDED and its numbers must not be used. Two harness defects:

  1. It tried to reach 320 CSS px with set_window_size. Firefox on macOS will
     not make a window narrower than about 500 CSS px, so the smallest viewport
     it actually reached was 500 - not 320. It then measured and reported that
     viewport as if it were the requested one.
  2. It measured `panel`, `group` and `card` as clientWidth 0 and did not stop.
     Below the mobile breakpoint the control rail (`aside#map-controls
     .layer-rail`) is collapsed and has no width until the
     `.mobile-controls-trigger` button adds `.mobile-open`. Zero was a
     collapsed rail, not a measurement.

CORRECTIONS.

  1. The 320 px viewport is produced with `layout.css.devPixelsPerPx`. The
     window is set as narrow as Firefox allows, innerWidth is measured, and the
     pref is set to innerWidth/320 so the CSS viewport becomes exactly 320 px.
     Media queries and layout then behave exactly as at 320 px, because the CSS
     viewport genuinely IS 320 px. The trade-off is recorded: devicePixelRatio
     becomes that scale factor rather than a phone's 2 or 3. This case is a
     layout-overflow ledger, and layout is driven by the CSS viewport.
  2. The rail is opened via `.mobile-controls-trigger` before measuring, and
     the harness ASSERTS a non-zero panel width. A zero width is now a hard
     failure rather than a silently reported number.

Usage: ff_responsive320.py <origin> <outdir> <large.pdf>
"""
import json
import os
import subprocess
import sys
import time

_ORIGIN, _OUT, _LARGE = sys.argv[1], sys.argv[2], sys.argv[3]
sys.argv = ["ff_chooser", _ORIGIN, _OUT]
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from selenium import webdriver  # noqa: E402
from selenium.webdriver.common.by import By  # noqa: E402
from selenium.webdriver.firefox.options import Options  # noqa: E402
from selenium.webdriver.firefox.service import Service  # noqa: E402

import ff_chooser as C  # noqa: E402

os.makedirs(_OUT, exist_ok=True)
T0 = time.time()
log = []


def L(msg):
    line = f"[{time.time() - T0:7.2f}s] {msg}"
    print(line, flush=True)
    log.append(line)


LEDGER = r"""
function m(el, label) {
  if (!el) { return { label: label, present: false }; }
  const cs = getComputedStyle(el);
  const r = el.getBoundingClientRect();
  return { label: label, present: true,
           clientWidth: el.clientWidth, scrollWidth: el.scrollWidth,
           boundingWidth: Math.round(r.width * 100) / 100,
           overflowX: cs.overflowX, display: cs.display,
           overflows: el.scrollWidth > el.clientWidth };
}
const rail = document.querySelector('#map-controls');
const group = document.querySelector('.user-map-group');
const rows = Array.from(document.querySelectorAll('.user-map-row'));
const card = rows[0] || null;
const ordinary = Array.from(document.querySelectorAll('.layer-control'))
                   .find(x => !x.classList.contains('user-map-row')) || null;
const out = [
  m(document.documentElement, 'document'),
  m(document.body, 'body'),
  m(rail, 'panel (#map-controls)'),
  m(group, 'group (.user-map-group)'),
  m(card, 'card (.user-map-row)'),
  m(ordinary, 'ordinary row (.layer-control)'),
];
return {
  innerWidth: window.innerWidth, innerHeight: window.innerHeight,
  devicePixelRatio: window.devicePixelRatio,
  railClass: rail ? rail.className : null,
  railOpen: !!(rail && rail.classList.contains('mobile-open')),
  ledger: out,
  // Horizontal overflow only counts where the element is not an intentional
  // scroller; auto/scroll containers are designed to scroll.
  overflowing: out.filter(x => x.present && x.overflows
                 && x.overflowX !== 'auto' && x.overflowX !== 'scroll')
                 .map(x => x.label),
  documentOverflows:
    document.documentElement.scrollWidth > document.documentElement.clientWidth,
  rowText: card ? (card.textContent || '').replace(/\s+/g, ' ').trim() : null,
  rowButtons: card ? Array.from(card.querySelectorAll('button')).map(b => {
      const r = b.getBoundingClientRect();
      return { text: b.textContent.trim(), disabled: b.disabled,
               w: Math.round(r.width), h: Math.round(r.height),
               insideViewport: r.left >= -0.5 && r.right <= window.innerWidth + 0.5 };
    }) : [],
  filenameVisible: card ? /NH_Hampton_20240808_TM_geo/.test(card.textContent || '') : false,
};
"""


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
    # PASS 1 - discover the narrowest CSS viewport Firefox will give us, so the
    # scale factor is measured rather than hard-coded. Setting the pref at
    # runtime needs chrome context, which geckodriver will not grant via
    # capabilities, so the pref is set at PROFILE CREATION in pass 2 instead.
    probe_opts = Options()
    probe_opts.set_preference("pdfjs.disabled", True)
    probe = webdriver.Firefox(
        options=probe_opts,
        service=Service(executable_path="/opt/homebrew/bin/geckodriver",
                        log_path=f"{_OUT}/geckodriver-probe.log"))
    try:
        probe.set_window_size(400, 700)
        time.sleep(1.5)
        min_w = probe.execute_script("return window.innerWidth;")
    finally:
        probe.quit()
    scale = min_w / 320.0
    L(f"pass 1: narrowest CSS viewport Firefox allows = {min_w} px; "
      f"devPixelsPerPx will be {scale:.6f} to reach 320")

    opts = Options()
    opts.set_preference("pdfjs.disabled", True)
    opts.set_preference("layout.css.devPixelsPerPx", str(scale))
    service = Service(executable_path="/opt/homebrew/bin/geckodriver",
                      log_path=f"{_OUT}/geckodriver320.log")
    driver = webdriver.Firefox(options=opts, service=service)
    driver.set_script_timeout(300)
    R = {"case": "responsive 320x640 - corrected re-run at a true 320 CSS px viewport",
         "supersedes": "ff_responsive.py phase A, which never got below 500 CSS px "
                       "and measured a collapsed rail as zero width",
         "origin": _ORIGIN, "file": os.path.basename(_LARGE),
         "viewportMethod": "layout.css.devPixelsPerPx scaling; the CSS viewport "
                           "is genuinely 320 px, devicePixelRatio is the scale "
                           "factor rather than a phone's 2 or 3"}
    try:
        caps = driver.capabilities
        R["browserVersion"] = caps.get("browserVersion")
        R["mozBuildID"] = caps.get("moz:buildID")
        L(f"ATTACHED firefox {caps.get('browserVersion')}")

        driver.set_window_size(1440, 900)
        driver.get(_ORIGIN)
        time.sleep(2)
        C.dismiss_dialog(driver)
        C.reset_storage(driver)
        driver.get(_ORIGIN)
        time.sleep(2)
        driver.execute_script(C.INSTRUMENT)
        C.dismiss_dialog(driver)
        driver.execute_script(C.INSTRUMENT)
        pre = driver.execute_async_script(C.DUMP_IDB)
        R["recordsBeforeImport"] = pre.get("recordCount")
        L(f"recordsBeforeImport={pre.get('recordCount')}")
        if pre.get("recordCount"):
            raise SystemExit("GUARD VIOLATION: records survived reset")

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
        target = next(o for o in ch["options"] if o["label"].strip() == "Map Layers")
        C.choose_frame(driver, target["value"])
        R["secondsToImport"] = round(time.time() - t, 2)
        L(f"imported the long-filename file in {R['secondsToImport']}s")

        # --- produce a TRUE 320 CSS px viewport --------------------------
        # devPixelsPerPx was applied at profile creation, so shrinking the
        # window to Firefox's minimum now yields a 320 px CSS viewport.
        R["narrowestWindowInnerWidth"] = min_w
        R["devPixelsPerPx"] = scale
        driver.set_window_size(400, 700)
        time.sleep(2.0)
        got = driver.execute_script(
            "return [window.innerWidth, window.innerHeight, window.devicePixelRatio];")
        L(f"with devPixelsPerPx={scale:.6f}: innerWidth={got[0]} "
          f"innerHeight={got[1]} dpr={got[2]}")
        # correct the height to 640 CSS px
        for _ in range(5):
            if got[1] == 640:
                break
            rect = driver.get_window_rect()
            driver.set_window_size(
                rect["width"],
                int(round(rect["height"] + (640 - got[1]) / scale)))
            time.sleep(1.2)
            got = driver.execute_script(
                "return [window.innerWidth, window.innerHeight, window.devicePixelRatio];")
        R["achievedViewport"] = {"innerWidth": got[0], "innerHeight": got[1],
                                 "devicePixelRatio": got[2]}
        L(f"ACHIEVED CSS viewport: {got[0]} x {got[1]} (dpr {got[2]})")
        if got[0] != 320:
            R["viewportWarning"] = f"innerWidth is {got[0]}, not 320"
            L(f"  WARNING: innerWidth is {got[0]}, not 320")

        R["ledgerRailClosed"] = driver.execute_script(LEDGER)
        R["shotRailClosed"] = shot(driver, "responsive-320x640-rail-closed")

        # --- open the mobile rail before measuring -----------------------
        opened = driver.execute_script(r"""
          const b = document.querySelector('.mobile-controls-trigger');
          if (!b) { return { found: false }; }
          b.click();
          return { found: true, expanded: b.getAttribute('aria-expanded') };
        """)
        R["mobileTrigger"] = opened
        L(f"mobile controls trigger: {opened}")
        time.sleep(2.0)

        led = driver.execute_script(LEDGER)
        R["ledgerRailOpen"] = led
        L(f"railOpen={led['railOpen']} documentOverflows={led['documentOverflows']}")
        for e in led["ledger"]:
            if e.get("present"):
                L(f"  {e['label']:28s} client={e['clientWidth']:5d} "
                  f"scroll={e['scrollWidth']:5d} overflowX={e['overflowX']}")
            else:
                L(f"  {e['label']:28s} ABSENT")
        L(f"overflowing (non-scrollers): {led['overflowing']}")
        L(f"filename visible in row: {led['filenameVisible']}")
        for b in led["rowButtons"]:
            L(f"  button {b['text']!r} {b['w']}x{b['h']} insideViewport={b['insideViewport']}")

        panel = next((e for e in led["ledger"]
                      if e["label"].startswith("panel")), {})
        if not panel.get("present") or panel.get("clientWidth", 0) <= 0:
            R["outcome"] = "MEASUREMENT_INVALID_PANEL_ZERO_WIDTH"
            L("  *** panel width is zero even with the rail open — "
              "measurement rejected, not reported ***")
        elif led["documentOverflows"] or led["overflowing"]:
            R["outcome"] = "HORIZONTAL_OVERFLOW_PRESENT"
        else:
            R["outcome"] = "NO_HORIZONTAL_OVERFLOW_CONTROLS_OPERABLE"
        L(f"OUTCOME {R['outcome']}")
        R["shotRailOpen"] = shot(driver, "responsive-320x640-rail-open")
        R["diagnostics"] = driver.execute_script(r"""
          return { jsErrors: window.__errs || [],
                   unhandledRejections: window.__rej || [],
                   longTaskApiSupported: window.__longTaskSupported === true };
        """)
        # No pref cleanup is needed: devPixelsPerPx was set on a throwaway
        # geckodriver profile that is discarded when the driver quits. The
        # user's own Firefox profile is never touched.
    finally:
        R["log"] = log
        with open(f"{_OUT}/responsive-320-result.json", "w") as f:
            json.dump(R, f, indent=2, default=str)
        print("WROTE", f"{_OUT}/responsive-320-result.json")
        driver.quit()


if __name__ == "__main__":
    main()
