#!/usr/bin/env python3
"""Bounded characterisation of the encrypted-PDF control on the Firefox lane.

The control-fixture run left `byte_enc.pdf` on `Reading "byte_enc.pdf"…` for
the full 180 s settle window with no outcome, no error row and no record.
The fixture manifest documents it as `password-protected` — "a typed
unlock/export error with no password UI".

"Still reading" is NOT "a typed error". This run samples the status surface on
a longer, explicitly bounded window so the state can be reported precisely
rather than inferred from one late snapshot. It is a characterisation, not a
pass or a fail.

Usage: ff_encrypted.py <origin> <outdir> <fixture> <seconds>
"""
import json
import os
import subprocess
import sys
import time

_ORIGIN, _OUT, _FIX, _SECS = sys.argv[1], sys.argv[2], sys.argv[3], float(sys.argv[4])
# Both ff_chooser and ff_controls parse sys.argv at module level; ff_controls
# also needs argv[3] (its fixture dir), so supply a placeholder third element.
sys.argv = ["ff_chooser", _ORIGIN, _OUT, os.path.dirname(_FIX)]
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from selenium import webdriver  # noqa: E402
from selenium.webdriver.common.by import By  # noqa: E402
from selenium.webdriver.firefox.options import Options  # noqa: E402
from selenium.webdriver.firefox.service import Service  # noqa: E402

import ff_chooser as C  # noqa: E402
from ff_controls import READ_CONTROL  # noqa: E402

os.makedirs(_OUT, exist_ok=True)
T0 = time.time()


def main():
    opts = Options()
    opts.set_preference("pdfjs.disabled", True)
    service = Service(executable_path="/opt/homebrew/bin/geckodriver",
                      log_path=f"{_OUT}/geckodriver-enc.log")
    driver = webdriver.Firefox(options=opts, service=service)
    driver.set_script_timeout(240)
    R = {"case": "encrypted PDF control - bounded characterisation",
         "fixture": os.path.basename(_FIX),
         "bytes": os.path.getsize(_FIX),
         "boundSeconds": _SECS,
         "origin": _ORIGIN,
         "samples": []}
    try:
        caps = driver.capabilities
        R["browserVersion"] = caps.get("browserVersion")
        R["mozBuildID"] = caps.get("moz:buildID")
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

        inp = driver.find_elements(By.CSS_SELECTOR, "input[type=file]")[0]
        driver.execute_script(
            "arguments[0].style.display='block';arguments[0].style.visibility='visible';"
            "arguments[0].style.opacity=1;arguments[0].removeAttribute('hidden');", inp)
        t0 = time.time()
        inp.send_keys(_FIX)

        settled_at = None
        while time.time() - t0 < _SECS:
            el = time.time() - t0
            ctrl = driver.execute_script(READ_CONTROL)
            st = driver.execute_script(C.READ_STATE)
            s = {"t": round(el, 1), "status": ctrl["status"],
                 "outcomes": ctrl["outcomes"], "errors": ctrl["errors"],
                 "rowCount": len(ctrl["rows"]),
                 "jsErrors": st.get("jsErrors"),
                 "unhandledRejections": st.get("unhandledRejections")}
            R["samples"].append(s)
            print(f"[{el:7.1f}s] status={ctrl['status']!r} outcomes={ctrl['outcomes']} "
                  f"errors={ctrl['errors']} rows={len(ctrl['rows'])}", flush=True)
            if ctrl["outcomes"] or ctrl["errors"] or ctrl["rows"]:
                settled_at = el
                break
            time.sleep(15)

        R["settledAtSeconds"] = settled_at
        R["idbFinal"] = driver.execute_async_script(C.DUMP_IDB)
        final = driver.execute_script(READ_CONTROL)
        R["final"] = final
        R["verdict"] = (
            "TYPED_ERROR_SURFACED" if final["errors"] else
            "OUTCOME_SURFACED" if final["outcomes"] else
            "RECORD_CREATED" if final["rows"] else
            f"NO_TYPED_ERROR_WITHIN_{int(_SECS)}S_STATUS_{final['status']!r}")
        png = f"{_OUT}/encrypted-control.png"
        driver.save_screenshot(png)
        subprocess.run(["sips", "-s", "format", "jpeg", "-Z", "1440", png,
                        "--out", f"{_OUT}/encrypted-control.jpg"],
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=False)
        if os.path.exists(f"{_OUT}/encrypted-control.jpg"):
            os.remove(png)
        print("VERDICT", R["verdict"])
    finally:
        with open(f"{_OUT}/encrypted-control.json", "w") as f:
            json.dump(R, f, indent=2, default=str)
        print("WROTE", f"{_OUT}/encrypted-control.json")
        driver.quit()


if __name__ == "__main__":
    main()
