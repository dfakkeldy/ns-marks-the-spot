#!/usr/bin/env python3
"""Firefox lane — responsive 320x640, import/remove cycles, console and resource failures.

HARNESS: geckodriver 0.37.1 + system Firefox via Selenium 4.46.0.
         Native <input type=file> send_keys. Fresh temporary profile.

Both guards from the chooser matrix are carried, imported from ff_chooser.py:
  1. per-file IndexedDB + UI-state reset;
  2. an explicit recordsBeforeImport == 0 assertion.

PHASE A - responsive 320x640
  The receipt's dedicated responsive case is exactly 320x640 CSS pixels with
  the original long Hampton filename. Reproduce the clientWidth/scrollWidth
  ledger and check for horizontal overflow. The viewport is CALIBRATED: the
  window is resized, innerWidth/innerHeight are measured, and the difference
  from the target is corrected, because set_window_size sets OUTER size.

PHASE B - import/remove cycles
  Three normal-size and three 35 MB import/remove cycles. A removal is only
  counted when BOTH the record and its blobs are gone from IndexedDB, not when
  the row disappears from the DOM.

PHASE C - console and resource failures
  PerformanceResourceTiming carries responseStatus in this Firefox, and it is
  populated from page start regardless of when the harness queries it, so
  4xx/5xx resources are detectable for the whole session. JS errors,
  unhandled rejections and console.error/warn are captured from injection
  time onward - see the limitation recorded in the README.

Usage: ff_responsive.py <origin> <outdir> <normal.pdf> <large.pdf>
"""
import json
import os
import subprocess
import sys
import time

_ORIGIN, _OUT, _NORMAL, _LARGE = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4]
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


# console capture + auto-accepting confirm, on top of ff_chooser's INSTRUMENT.
EXTRA_INSTRUMENT = r"""
window.__console = window.__console || [];
if (!window.__consoleHooked) {
  window.__consoleHooked = true;
  for (const level of ['error', 'warn']) {
    const orig = console[level].bind(console);
    console[level] = function (...a) {
      try {
        window.__console.push({ level: level,
          text: a.map(x => { try { return String(x); } catch (e) { return '?'; } }).join(' ') });
      } catch (e) { /* never let instrumentation break the page */ }
      return orig(...a);
    };
  }
}
// Removal is guarded by window.confirm. Auto-accept it so the cycle is
// deterministic; recorded in the README as a harness intervention.
if (!window.__confirmHooked) {
  window.__confirmHooked = true;
  window.__confirmCalls = [];
  window.confirm = function (m) { window.__confirmCalls.push(String(m)); return true; };
}
"""

READ_DIAGNOSTICS = r"""
const res = performance.getEntriesByType('resource').map(e => ({
  name: e.name, status: (typeof e.responseStatus === 'number' ? e.responseStatus : null),
  transferSize: e.transferSize, duration: Math.round(e.duration),
}));
return {
  resourceCount: res.length,
  responseStatusAvailable: res.some(r => r.status !== null),
  failedResources: res.filter(r => r.status !== null && r.status >= 400),
  zeroTransferNonCached: res.filter(r => r.status === 0).length,
  consoleEntries: window.__console || [],
  jsErrors: window.__errs || [],
  unhandledRejections: window.__rej || [],
  confirmCalls: window.__confirmCalls || [],
  longTaskApiSupported: window.__longTaskSupported === true,
};
"""

# clientWidth/scrollWidth ledger. Overflow exists only where scrollWidth
# exceeds clientWidth on an element that is not an intentional scroller.
READ_LEDGER = r"""
function m(el, label) {
  if (!el) { return { label: label, present: false }; }
  const cs = getComputedStyle(el);
  return { label: label, present: true, clientWidth: el.clientWidth,
           scrollWidth: el.scrollWidth, overflowX: cs.overflowX,
           overflows: el.scrollWidth > el.clientWidth };
}
const rows = Array.from(document.querySelectorAll('.user-map-row'));
const card = rows[0] || null;
const out = [
  m(document.documentElement, 'document'),
  m(document.body, 'body'),
  m(document.querySelector('.user-map-panel, .panel, aside'), 'panel'),
  m(document.querySelector('.user-map-list, .user-maps, .user-map-group'), 'group'),
  m(card, 'card (imported row)'),
];
rows.slice(1, 2).forEach(r => out.push(m(r, 'ordinary row')));
return {
  innerWidth: window.innerWidth, innerHeight: window.innerHeight,
  devicePixelRatio: window.devicePixelRatio,
  ledger: out,
  anyOverflow: out.some(x => x.present && x.overflows && x.overflowX !== 'auto'
                              && x.overflowX !== 'scroll'),
  rowText: card ? (card.textContent || '').replace(/\s+/g, ' ').trim() : null,
  rowButtons: card ? Array.from(card.querySelectorAll('button'))
                       .map(b => ({ text: b.textContent.trim(),
                                    disabled: b.disabled,
                                    w: Math.round(b.getBoundingClientRect().width),
                                    h: Math.round(b.getBoundingClientRect().height) })) : [],
};
"""


def instrument(driver):
    driver.execute_script(C.INSTRUMENT)
    driver.execute_script(EXTRA_INSTRUMENT)


def calibrate_viewport(driver, target_w, target_h):
    """set_window_size sets OUTER size; correct to hit the CSS viewport exactly."""
    driver.set_window_size(target_w, target_h)
    time.sleep(1.2)
    for _ in range(6):
        inner = driver.execute_script(
            "return [window.innerWidth, window.innerHeight];")
        dw, dh = target_w - inner[0], target_h - inner[1]
        if dw == 0 and dh == 0:
            break
        rect = driver.get_window_rect()
        driver.set_window_size(rect["width"] + dw, rect["height"] + dh)
        time.sleep(1.0)
    return driver.execute_script(
        "return {innerWidth: window.innerWidth, innerHeight: window.innerHeight,"
        " dpr: window.devicePixelRatio};")


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


def fresh_page(driver, reset=True):
    driver.get(_ORIGIN)
    time.sleep(2)
    C.dismiss_dialog(driver)
    if reset:
        C.reset_storage(driver)
        driver.get(_ORIGIN)
        time.sleep(2)
        instrument(driver)
        C.dismiss_dialog(driver)
    instrument(driver)


def import_file(driver, pdf, choose="Map Layers", budget=300):
    inp = driver.find_elements(By.CSS_SELECTOR, "input[type=file]")[0]
    driver.execute_script(
        "arguments[0].style.display='block';arguments[0].style.visibility='visible';"
        "arguments[0].style.opacity=1;arguments[0].removeAttribute('hidden');", inp)
    t = time.time()
    inp.send_keys(pdf)
    ch = None
    while time.time() - t < budget:
        ch = driver.execute_script(C.READ_CHOOSER)
        if ch["dialogPresent"] and ch["radioCount"] > 0:
            break
        st = driver.execute_script(C.READ_STATE)
        if st["outcomes"]:
            return {"secondsToSettle": round(time.time() - t, 2), "chooser": ch,
                    "choseFrame": None}
        time.sleep(1.5)
    target = next((o for o in ch["options"] if o["label"].strip() == choose), None) \
        or ch["options"][0]
    C.choose_frame(driver, target["value"])
    return {"secondsToSettle": round(time.time() - t, 2), "chooser": ch,
            "choseFrame": target["label"]}


def remove_all(driver, budget=180):
    """Click Remove and wait until BOTH records and blobs are gone."""
    driver.execute_script(EXTRA_INSTRUMENT)
    clicked = driver.execute_script(r"""
      const rows = Array.from(document.querySelectorAll('.user-map-row'));
      let n = 0;
      for (const r of rows) {
        const b = Array.from(r.querySelectorAll('button'))
                   .find(x => /^remove$/i.test(x.textContent.trim()));
        if (b) { b.click(); n++; }
      }
      return n;
    """)
    C.clear_alert(driver)
    t = time.time()
    while time.time() - t < budget:
        idb = driver.execute_async_script(C.DUMP_IDB)
        if (idb.get("recordCount") or 0) == 0 and not (idb.get("blobs") or {}):
            return {"removeClicked": clicked, "cleared": True,
                    "seconds": round(time.time() - t, 2), "idb": idb}
        time.sleep(2)
    return {"removeClicked": clicked, "cleared": False,
            "seconds": round(time.time() - t, 2),
            "idb": driver.execute_async_script(C.DUMP_IDB)}


def main():
    opts = Options()
    opts.set_preference("pdfjs.disabled", True)
    service = Service(executable_path="/opt/homebrew/bin/geckodriver",
                      log_path=f"{_OUT}/geckodriver.log")
    driver = webdriver.Firefox(options=opts, service=service)
    driver.set_script_timeout(300)
    R = {"case": "responsive 320x640, import/remove cycles, console and resource failures",
         "harness": "geckodriver 0.37.1 + system Firefox via Selenium 4.46.0 "
                    "(NOT the Chrome extension bridge)",
         "delivery": "native <input type=file> send_keys",
         "profile": "fresh geckodriver temporary profile",
         "guards": ["per-file IndexedDB + UI-state reset (ff_chooser.reset_storage)",
                    "recordsBeforeImport == 0 asserted"],
         "harnessInterventions": [
             "window.confirm auto-accepts so the remove cycle is deterministic; "
             "the calls it received are recorded in confirmCalls"],
         "origin": _ORIGIN}
    try:
        caps = driver.capabilities
        R["browserVersion"] = caps.get("browserVersion")
        R["mozBuildID"] = caps.get("moz:buildID")
        R["geckodriverVersion"] = caps.get("moz:geckodriverVersion")
        L(f"ATTACHED firefox {caps.get('browserVersion')} build={caps.get('moz:buildID')}")

        # ---------- PHASE A : responsive 320x640 --------------------------
        L("PHASE A - responsive 320x640 with the long Hampton filename")
        driver.set_window_size(1440, 900)
        fresh_page(driver)
        pre = driver.execute_async_script(C.DUMP_IDB)
        R["phaseA_recordsBeforeImport"] = pre.get("recordCount")
        L(f"  recordsBeforeImport={pre.get('recordCount')}")
        imp = import_file(driver, _LARGE)
        R["phaseA_import"] = imp
        L(f"  imported in {imp['secondsToSettle']}s, chose {imp['choseFrame']}")
        R["phaseA_ledgerAt1440"] = driver.execute_script(READ_LEDGER)
        R["phaseA_shotWide"] = shot(driver, "responsive-1440-before")

        cal = calibrate_viewport(driver, 320, 640)
        R["phaseA_calibratedViewport"] = cal
        L(f"  calibrated viewport: {cal}")
        time.sleep(2)
        led = driver.execute_script(READ_LEDGER)
        R["phaseA_ledgerAt320"] = led
        L(f"  innerWidth={led['innerWidth']} anyOverflow={led['anyOverflow']}")
        for e in led["ledger"]:
            if e.get("present"):
                L(f"    {e['label']:22s} client={e['clientWidth']:5d} "
                  f"scroll={e['scrollWidth']:5d} overflowX={e['overflowX']}")
        R["phaseA_shot320"] = shot(driver, "responsive-320x640")
        R["phaseA_diagnostics"] = driver.execute_script(READ_DIAGNOSTICS)

        # ---------- PHASE B : import/remove cycles ------------------------
        L("PHASE B - import/remove cycles")
        driver.set_window_size(1440, 900)
        time.sleep(1.5)
        cycles = []
        for kind, pdf, n in (("normal", _NORMAL, 3), ("large", _LARGE, 3)):
            for i in range(1, n + 1):
                fresh_page(driver)
                pre = driver.execute_async_script(C.DUMP_IDB)
                if (pre.get("recordCount") or 0) != 0:
                    cycles.append({"kind": kind, "i": i,
                                   "outcome": "HARNESS_GUARD_VIOLATION",
                                   "recordsBeforeImport": pre.get("recordCount")})
                    L(f"  {kind} #{i}: GUARD VIOLATION "
                      f"{pre.get('recordCount')} records before import")
                    continue
                imp = import_file(driver, pdf)
                after = driver.execute_async_script(C.DUMP_IDB)
                blobs_after = list((after.get("blobs") or {}).keys())
                rem = remove_all(driver)
                cyc = {"kind": kind, "i": i,
                       "file": os.path.basename(pdf),
                       "recordsBeforeImport": pre.get("recordCount"),
                       "secondsToImport": imp["secondsToSettle"],
                       "recordsAfterImport": after.get("recordCount"),
                       "blobsAfterImport": blobs_after,
                       "removeClicked": rem["removeClicked"],
                       "recordsAfterRemove": rem["idb"].get("recordCount"),
                       "blobsAfterRemove": list((rem["idb"].get("blobs") or {}).keys()),
                       "secondsToClear": rem["seconds"],
                       "cleared": rem["cleared"],
                       "confirmCalls": driver.execute_script(
                           "return window.__confirmCalls || [];")}
                cyc["outcome"] = ("RECORD_AND_BLOBS_REMOVED" if rem["cleared"]
                                  else "NOT_FULLY_CLEARED")
                cycles.append(cyc)
                L(f"  {kind} #{i}: import {imp['secondsToSettle']}s "
                  f"records {pre.get('recordCount')}->{after.get('recordCount')}"
                  f"->{cyc['recordsAfterRemove']} blobs "
                  f"{len(blobs_after)}->{len(cyc['blobsAfterRemove'])} "
                  f"{cyc['outcome']}")
        R["phaseB_cycles"] = cycles

        # ---------- PHASE C : console and resource failures ---------------
        L("PHASE C - console and resource failures")
        diag = driver.execute_script(READ_DIAGNOSTICS)
        R["phaseC_diagnostics"] = diag
        L(f"  resources={diag['resourceCount']} "
          f"responseStatusAvailable={diag['responseStatusAvailable']} "
          f"failed={len(diag['failedResources'])}")
        L(f"  console entries={len(diag['consoleEntries'])} "
          f"jsErrors={len(diag['jsErrors'])} "
          f"rejections={len(diag['unhandledRejections'])}")
        for c in diag["consoleEntries"][:20]:
            L(f"    console.{c['level']}: {c['text'][:160]}")
        for f in diag["failedResources"][:20]:
            L(f"    FAILED {f['status']} {f['name'][:140]}")
        R["phaseC_shot"] = shot(driver, "final-state")
    finally:
        R["log"] = log
        with open(f"{_OUT}/responsive-cycles-diagnostics.json", "w") as f:
            json.dump(R, f, indent=2, default=str)
        print("WROTE", f"{_OUT}/responsive-cycles-diagnostics.json")
        driver.quit()


if __name__ == "__main__":
    main()
