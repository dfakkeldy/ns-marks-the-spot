#!/usr/bin/env python3
"""Firefox lane — control fixtures: page-count reporting and the manual-points boundary.

HARNESS: geckodriver 0.37.1 + system Firefox via Selenium 4.46.0.
         NOT the Chrome extension bridge. Native <input type=file> send_keys.
         Fresh temporary profile per launch.

Instrumentation, the IndexedDB reset and the `recordsBeforeImport == 0`
assertion are imported verbatim from ff_chooser.py so this run carries BOTH
harness guards that the 2026-07-31 chooser matrix had to add:
  1. per-file IndexedDB + UI-state reset (records persist across driver.get()
     in a shared profile, so records[0] can silently describe an EARLIER file);
  2. an explicit recordsBeforeImport == 0 assertion per file.

WHAT THIS MUST PROVE

A. Page-count reporting. `byte_and_rgbsmall_2pages.pdf` has two pages; the
   product must REPORT two pages and import page 1 only.
   `registration-page-2.pdf` carries its registration on page 2 and must not
   let that registration affect page 1.

B. The manual-points boundary, in BOTH directions. Manual control points are
   reserved strictly for registration that is missing, malformed, unreadable,
   or unsupported (including unsupported CRS).
     - A file WITHOUT usable registration must fall back to manual and must
       say so. Silently placing it would be a defect.
     - A file WITH readable, supported, unambiguous registration must NEVER be
       pushed to manual. Doing so would be the opposite defect.
   Both directions are measured; neither is assumed.

Usage: ff_controls.py <origin> <outdir> <fixture-dir>
"""
import json
import os
import subprocess
import sys
import time

_ORIGIN = sys.argv[1]
_OUT = sys.argv[2]
_FIXDIR = sys.argv[3]

# ff_chooser parses sys.argv at module level; give it a well-formed argv with
# no PDFs so importing it is side-effect free.
sys.argv = ["ff_chooser", _ORIGIN, _OUT]
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from selenium import webdriver  # noqa: E402
from selenium.webdriver.common.by import By  # noqa: E402
from selenium.webdriver.firefox.options import Options  # noqa: E402
from selenium.webdriver.firefox.service import Service  # noqa: E402

import ff_chooser as C  # noqa: E402

ORIGIN = _ORIGIN
OUT = _OUT
FIXDIR = _FIXDIR
os.makedirs(OUT, exist_ok=True)

T0 = time.time()
log = []


def L(msg):
    line = f"[{time.time() - T0:7.2f}s] {msg}"
    print(line, flush=True)
    log.append(line)


# Extra surfaces the chooser harness did not need: error text, page-count copy,
# and the full row/button detail used for the manual-points boundary.
READ_CONTROL = r"""
function txt(el) { return el ? (el.textContent || '').replace(/\s+/g,' ').trim() : null; }
const rows = Array.from(document.querySelectorAll('.user-map-row')).map(r => {
  const cb = r.querySelector('input[type=checkbox]');
  return {
    text: txt(r),
    checked: cb ? cb.checked : null,
    checkboxDisabled: cb ? cb.disabled : null,
    buttons: Array.from(r.querySelectorAll('button')).map(b => b.textContent.trim()),
    georefButtons: Array.from(r.querySelectorAll('.user-map-georeference'))
                     .map(b => b.textContent.trim()),
    needsGeoreferenceBadge:
      Array.from(r.querySelectorAll('.user-map-needs-georeference')).map(s => txt(s)),
    provenance: Array.from(r.querySelectorAll('.user-map-provenance, .user-map-source'))
                  .map(s => txt(s)),
  };
});
return {
  rows: rows,
  outcomes: Array.from(document.querySelectorAll('.user-map-outcomes li')).map(li => txt(li)),
  errors: Array.from(document.querySelectorAll(
      '.user-map-error, .user-map-errors li, [role=alert]')).map(e => txt(e)),
  status: txt(document.querySelector('.user-map-status')),
  // Any on-screen "page N of M" copy, wherever it is rendered.
  pageCopy: Array.from(document.querySelectorAll('.user-map-row, .user-map-outcomes li'))
    .map(e => txt(e)).filter(t => t && /page\s+\d+(\s+of\s+\d+)?/i.test(t)),
  bodyMentionsManualPoints: /manual points/i.test(document.body.textContent || ''),
  bodyMentionsAbsentRegistration: /absent registration/i.test(document.body.textContent || ''),
};
"""

# Per fixture: what the committed manifest says, and what the SOURCE contract
# implies. Where these disagree the measurement adjudicates; nothing is assumed.
#   expectManual  - True  => must fall back to manual control points
#                   False => must place from embedded coordinates
#                   None  => expected to fail before producing a record
FIXTURES = [
    # --- must NOT be pushed to manual: readable, supported, unambiguous ------
    ("ns-utm20-lgidict.pdf", {
        "manifestExpected": "manual-unsupported",
        "sourceDerivedExpectation": "embedded",
        "expectManual": False,
        "why": "geoPdfMetadata.test.ts asserts rejected==[] and a sole "
               "'NAD83 / UTM zone 20N' candidate; EPSG:26920 is in "
               "SUPPORTED_EPSG_CODES. Manifest 'expected' contradicts both.",
    }),
    ("ns-utm20-iso.pdf", {
        "manifestExpected": "manual-unsupported",
        "sourceDerivedExpectation": "embedded",
        "expectManual": False,
        "why": "geoPdfMetadata.test.ts asserts rejected==[] and a sole 'Layer' "
               "Measure candidate with 4 gcps; EPSG:26920 supported.",
    }),
    # --- page-count control -------------------------------------------------
    ("byte_and_rgbsmall_2pages.pdf", {
        "manifestExpected": "page-1-only",
        "sourceDerivedExpectation": "page-1-only",
        "expectManual": None,
        "why": "two pages; must report 2 and import page 1 only.",
    }),
    ("registration-page-2.pdf", {
        "manifestExpected": "manual-page-1-missing",
        "sourceDerivedExpectation": "manual",
        "expectManual": True,
        "why": "registration lives on page 2; page 1 has none, so page 1 must "
               "fall back to manual rather than borrow page 2's registration.",
    }),
    # --- must fall back to manual ------------------------------------------
    ("plain.pdf", {
        "manifestExpected": "manual-missing",
        "sourceDerivedExpectation": "manual",
        "expectManual": True,
        "why": "registration absent -> 'absent registration - manual points'.",
    }),
    ("malformed-measure.pdf", {
        "manifestExpected": "manual-invalid",
        "sourceDerivedExpectation": "manual",
        "expectManual": True,
        "why": "measure registration with invalid cardinality.",
    }),
    ("unsupported-crs.pdf", {
        "manifestExpected": "manual-unsupported-crs",
        "sourceDerivedExpectation": "manual",
        "expectManual": True,
        "why": "EPSG 999999 is not in SUPPORTED_EPSG_CODES.",
    }),
    ("test_iso32000.pdf", {
        "manifestExpected": "manual-unsupported",
        "sourceDerivedExpectation": "manual",
        "expectManual": True,
        "why": "pinned to manual-unsupported by testFixtures.test.ts.",
    }),
    ("test_ogc_bp.pdf", {
        "manifestExpected": "manual-unsupported",
        "sourceDerivedExpectation": "manual",
        "expectManual": True,
        "why": "pinned to manual-unsupported by testFixtures.test.ts.",
    }),
    ("rotated-cropped.pdf", {
        "manifestExpected": "manual-unsupported",
        "sourceDerivedExpectation": "manual",
        "expectManual": True,
        "why": "rotated/cropped measure registration.",
    }),
    ("adobe_style_geospatial.pdf", {
        "manifestExpected": "manual-ambiguous",
        "sourceDerivedExpectation": "manual-or-chooser",
        "expectManual": True,
        "why": "two registrations; manifest expects ambiguous -> manual.",
    }),
    # --- must fail before producing a record --------------------------------
    ("corrupt.pdf", {
        "manifestExpected": "invalid-pdf",
        "sourceDerivedExpectation": "error",
        "expectManual": None,
        "why": "truncated bytes; not a renderable PDF.",
    }),
    ("byte_enc.pdf", {
        "manifestExpected": "password-protected",
        "sourceDerivedExpectation": "error",
        "expectManual": None,
        "why": "encrypted; typed unlock/export error with no password UI.",
    }),
]


def shot(driver, stem):
    png = f"{OUT}/{stem}.png"
    driver.save_screenshot(png)
    jpg = f"{OUT}/{stem}.jpg"
    # Repo convention: JPEG at 1440 px wide.
    subprocess.run(["sips", "-s", "format", "jpeg", "-Z", "1440", png,
                    "--out", jpg],
                   stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                   check=False)
    if os.path.exists(jpg):
        os.remove(png)
        return os.path.basename(jpg)
    return os.path.basename(png)


def classify(idb, ctrl, chooser):
    recs = idb.get("records") or []
    if not recs:
        return "ERROR_NO_RECORD"
    r = recs[0]
    status = r.get("registrationStatus")
    if chooser.get("dialogPresent") and chooser.get("radioCount", 0) > 0:
        return "CHOOSER_PRESENTED"
    if status == "embedded":
        return "EMBEDDED"
    if status in ("manual", "absent", None) or r.get("manualReason"):
        return "MANUAL"
    return f"OTHER:{status}"


def run_fixture(driver, name, spec, results):
    path = os.path.join(FIXDIR, name)
    F = {"file": name, "bytes": os.path.getsize(path)}
    F.update(spec)
    L(f"===== {name} ({F['bytes']} B) =====")

    driver.get(ORIGIN)
    time.sleep(2)
    C.dismiss_dialog(driver)
    # GUARD 1 - per-file isolation (imported verbatim from ff_chooser).
    C.reset_storage(driver)
    driver.get(ORIGIN)
    time.sleep(2)
    driver.execute_script(C.INSTRUMENT)
    C.dismiss_dialog(driver)
    driver.execute_script(C.INSTRUMENT)

    # GUARD 2 - assert the reset actually emptied the store.
    pre = driver.execute_async_script(C.DUMP_IDB)
    F["recordsBeforeImport"] = pre.get("recordCount")
    if pre.get("recordCount"):
        F["guardViolation"] = (
            f"{pre.get('recordCount')} records survived the reset; every "
            f"per-record reading for {name} would describe an earlier file")
        L(f"  *** GUARD VIOLATION: {F['guardViolation']}")
        F["outcome"] = "HARNESS_GUARD_VIOLATION"
        results.append(F)
        return

    inp = driver.find_elements(By.CSS_SELECTOR, "input[type=file]")[0]
    driver.execute_script(
        "arguments[0].style.display='block';arguments[0].style.visibility='visible';"
        "arguments[0].style.opacity=1;arguments[0].removeAttribute('hidden');", inp)
    t_send = time.time()
    inp.send_keys(path)

    # Settle: stop as soon as a chooser, an outcome, or an error appears.
    chooser = {"dialogPresent": False, "radioCount": 0}
    while time.time() - t_send < 180:
        chooser = driver.execute_script(C.READ_CHOOSER)
        if chooser["dialogPresent"] and chooser["radioCount"] > 0:
            break
        ctrl = driver.execute_script(READ_CONTROL)
        if ctrl["outcomes"] or ctrl["errors"] or ctrl["rows"]:
            break
        time.sleep(1.5)
    time.sleep(3)
    C.clear_alert(driver)

    F["secondsToSettle"] = round(time.time() - t_send, 2)
    F["chooser"] = chooser
    ctrl = driver.execute_script(READ_CONTROL)
    F["control"] = ctrl
    state = driver.execute_script(C.READ_STATE)
    F["jsErrors"] = state.get("jsErrors")
    F["unhandledRejections"] = state.get("unhandledRejections")
    F["longTaskApiSupported"] = state.get("longTaskApiSupported")
    idb = driver.execute_async_script(C.DUMP_IDB)
    F["idb"] = idb

    F["observed"] = classify(idb, ctrl, chooser)
    recs = idb.get("records") or []
    if recs:
        r = recs[0]
        F["pageCount"] = r.get("pageCount")
        F["registrationStatus"] = r.get("registrationStatus")
        F["manualReason"] = r.get("manualReason")
        F["selection"] = r.get("selection")
        F["gcpCount"] = r.get("gcpCount")
        F["georefMethod"] = r.get("georefMethod")

    # Boundary adjudication.
    exp = spec.get("expectManual")
    if exp is True:
        F["boundaryVerdict"] = ("OK_MANUAL" if F["observed"] == "MANUAL"
                                else f"BOUNDARY_MISMATCH_expected_manual_got_{F['observed']}")
    elif exp is False:
        F["boundaryVerdict"] = ("OK_EMBEDDED" if F["observed"] == "EMBEDDED"
                                else f"BOUNDARY_MISMATCH_expected_embedded_got_{F['observed']}")
    else:
        F["boundaryVerdict"] = f"NOT_A_BOUNDARY_CASE_observed_{F['observed']}"

    F["manifestAgreesWithObservation"] = None
    me = spec.get("manifestExpected", "")
    if me.startswith("manual"):
        F["manifestAgreesWithObservation"] = (F["observed"] == "MANUAL")
    elif me in ("invalid-pdf", "password-protected"):
        F["manifestAgreesWithObservation"] = (F["observed"] == "ERROR_NO_RECORD")
    elif me == "page-1-only":
        F["manifestAgreesWithObservation"] = (F["observed"] in ("EMBEDDED", "MANUAL"))

    F["screenshot"] = shot(driver, f"control-{name.replace('.pdf','')}")
    L(f"  observed={F['observed']} pageCount={F.get('pageCount')} "
      f"manualReason={F.get('manualReason')} verdict={F['boundaryVerdict']}")
    L(f"  outcomes={ctrl['outcomes']}")
    L(f"  errors={ctrl['errors']}")
    if ctrl["rows"]:
        L(f"  row0={ctrl['rows'][0]['text'][:160]}")
        L(f"  georefButtons={ctrl['rows'][0]['georefButtons']}")
    results.append(F)


def main():
    opts = Options()
    opts.set_preference("pdfjs.disabled", True)
    service = Service(executable_path="/opt/homebrew/bin/geckodriver",
                      log_path=f"{OUT}/geckodriver.log")
    driver = webdriver.Firefox(options=opts, service=service)
    driver.set_script_timeout(240)
    R = {
        "case": "control fixtures - page count and the manual-points boundary",
        "harness": "geckodriver 0.37.1 + system Firefox via Selenium 4.46.0 "
                   "(NOT the Chrome extension bridge)",
        "delivery": "native <input type=file> send_keys",
        "profile": "fresh geckodriver temporary profile per launch",
        "guards": [
            "per-file IndexedDB + UI-state reset (ff_chooser.reset_storage)",
            "recordsBeforeImport == 0 asserted per file",
        ],
        "origin": ORIGIN,
        "fixtureDir": FIXDIR,
        "fixtures": [],
    }
    try:
        caps = driver.capabilities
        R["browserVersion"] = caps.get("browserVersion")
        R["mozBuildID"] = caps.get("moz:buildID")
        R["geckodriverVersion"] = caps.get("moz:geckodriverVersion")
        L(f"ATTACHED firefox {caps.get('browserVersion')} "
          f"buildID={caps.get('moz:buildID')} "
          f"gecko={caps.get('moz:geckodriverVersion')}")
        driver.set_window_size(1440, 900)
        for name, spec in FIXTURES:
            try:
                run_fixture(driver, name, spec, R["fixtures"])
            except Exception as e:
                L(f"  FIXTURE ERROR {name}: {e}")
                R["fixtures"].append({"file": name, "outcome": "HARNESS_ERROR",
                                      "error": str(e)})
    finally:
        R["log"] = log
        with open(f"{OUT}/control-matrix.json", "w") as f:
            json.dump(R, f, indent=2, default=str)
        print("WROTE", f"{OUT}/control-matrix.json")
        driver.quit()


if __name__ == "__main__":
    main()
