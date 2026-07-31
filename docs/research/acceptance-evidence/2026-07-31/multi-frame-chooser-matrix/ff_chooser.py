#!/usr/bin/env python3
"""Multi-frame chooser matrix — Firefox lane, real multi-registration USGS files.

HARNESS: geckodriver 0.37.1 + system Firefox via Selenium 4.46.0.
         NOT the Chrome extension bridge. Native <input type=file> send_keys,
         no 10 MB ceiling. Fresh temporary profile per launch.

WHAT THIS MUST PROVE, per file:
  1. the chooser appears with the FULL candidate list and NOTHING preselected,
     and the confirm button is disabled until a choice is made;
  2. EVERY candidate can be chosen explicitly - main map AND each inset - and
     each one places from embedded coordinates;
  3. NO supported frame requests manual GCP placement. The row must offer
     "Adjust points", never "Georeference"; the enable checkbox must not be
     disabled; the registration must persist as status "embedded".

A silent "first" or "largest" selection is a DEFECT, not a behaviour. If any
file ever reaches an embedded placement without an explicit choice, that is
recorded as SILENT_SELECTION_DEFECT.

Reopening the chooser through "Change frame" DOES pre-check the current frame.
That is correct and is captured separately so a reader cannot mistake it for
the initial-preselection defect.

Usage: ff_chooser.py <origin> <outdir> <pdf> [<pdf> ...]
"""
import json, sys, time, os

from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.firefox.options import Options
from selenium.webdriver.firefox.service import Service
from selenium.common.exceptions import NoAlertPresentException

ORIGIN = sys.argv[1]
OUT = sys.argv[2]
PDFS = sys.argv[3:]
os.makedirs(OUT, exist_ok=True)

# Candidate ids and Adjust-Points RMS the receipt records, for cross-check.
# docs/research/2026-07-28-geopdf-browser-acceptance.md
RECEIPT = {
    "NH_Isles_of_Shoals_OE_W_20150610_TM_geo.pdf": {
        "candidateIds": [
            "lgidict-direct-0-2103.0705723-3612.4027586-163.9554071-117.6496552",
            "lgidict-direct-1-410.6593103-338.9636426-2391.9006897-3245.1844389",
            "lgidict-direct-2-248.2317241-176.5361882-2716.7558621-3570.0393477",
        ],
        "rmsByLabel": {"Map Layers": 5, "Quadrangle": 0, "UTM": 7},
    },
    "ME_Isles_of_Shoals_20240805_TM_geo.pdf": {
        "candidateIds": [
            "measure-direct-0-21.1857165-0-3329.6884034-4020.0951565",
            "measure-direct-1-2185.6597333-3720.3094069-163.8361943-117.583821",
            "measure-direct-2-2172.5952-3898.2740941-93.2171525-127.1176337",
        ],
        "rmsByLabel": {"Map Layers": 9, "Quadrangle": 0, "Adjoining": 0},
    },
    "CA_Montara_Mountain_OE_W_20120515_TM_geo.pdf": {
        "candidateIds": [
            "lgidict-direct-0-2147.0896552-3608.6780362-163.9724138-117.6618587",
            "lgidict-direct-1-313.5604591-338.9572414-2586.120461-3241.4675862",
            "lgidict-direct-2-2126.6758621-3760.5737931-204.8-204.8",
            "lgidict-direct-3-151.132816-176.5296552-2910.9757472-3566.3227586",
        ],
        "rmsByLabel": {"Map Layers": 5, "Quadrangle": 0, "Adjoining": 0, "UTM": 6},
    },
    "CA_San_Francisco_South_OE_W_20211202_TM_geo.pdf": {
        "candidateIds": [
            "measure-direct-0-0-0-3389.7145968-3984.7847136",
            "measure-direct-1-2185.6597333-3720.3094069-163.8361943-117.583821",
            "measure-direct-2-2168.7111602-3898.2740941-100.9852322-127.1176337",
        ],
        "rmsByLabel": {"Map Layers": 8, "Quadrangle": 0, "Adjoining": 0},
    },
    "NH_Hampton_20240808_TM_geo.pdf": {
        "candidateIds": [
            "measure-direct-0-12.7114299-0-3346.6369766-4027.1572451",
            "measure-direct-1-2185.6597333-3720.3094069-163.8361943-117.583821",
            "measure-direct-2-2172.5952-3898.2740941-93.2171525-127.1176337",
        ],
        "rmsByLabel": {"Map Layers": 10, "Quadrangle": 0, "Adjoining": 0},
    },
}

T0 = time.time()
log = []


def L(msg):
    line = f"[{time.time() - T0:7.2f}s] {msg}"
    print(line, flush=True)
    log.append(line)


INSTRUMENT = r"""
window.__errs = window.__errs || []; window.__rej = window.__rej || [];
window.addEventListener('error', e => window.__errs.push(String(e.message)));
window.addEventListener('unhandledrejection',
  e => window.__rej.push(String(e.reason)));
window.__longTaskSupported =
  typeof PerformanceObserver !== 'undefined' &&
  Array.isArray(PerformanceObserver.supportedEntryTypes) &&
  PerformanceObserver.supportedEntryTypes.indexOf('longtask') !== -1;
"""

READ_CHOOSER = r"""
const dlg = document.querySelector('.geopdf-frame-chooser');
const radios = Array.from(document.querySelectorAll('input[name="geopdf-frame"]'));
const btn = dlg ? Array.from(dlg.querySelectorAll('button'))
                   .find(x => /use this frame/i.test(x.textContent)) : null;
return {
  dialogPresent: !!dlg,
  heading: dlg ? (dlg.querySelector('h2')||{}).textContent : null,
  intro: dlg ? (dlg.querySelector('p')||{}).textContent : null,
  legend: dlg ? (dlg.querySelector('legend')||{}).textContent : null,
  radioCount: radios.length,
  anyChecked: radios.some(r => r.checked),
  checkedValues: radios.filter(r => r.checked).map(r => r.value),
  options: radios.map((r, i) => ({
    index: i, value: r.value, checked: r.checked,
    label: ((r.closest('label')||{}).textContent||'').trim() })),
  confirmDisabled: btn ? btn.disabled : null,
  highlightPresent: !!document.querySelector('[data-testid="geopdf-frame-highlight"]'),
};
"""

READ_STATE = r"""
function readCanvas(cv) {
  const r = { width: cv.width, height: cv.height, opacity: cv.style.opacity };
  if (cv.width === 0 || cv.height === 0) {
    r.measuredState = 'unsized-no-backing-allocated';
    r.nonTransparentFraction = null;
    return r;
  }
  try {
    const ctx = cv.getContext('2d');
    const step = Math.max(1, Math.floor(Math.sqrt((cv.width*cv.height)/150000)));
    const d = ctx.getImageData(0, 0, cv.width, cv.height).data;
    let s = 0, o = 0;
    for (let y = 0; y < cv.height; y += step) {
      for (let x = 0; x < cv.width; x += step) {
        const i = (y*cv.width + x)*4; s++; if (d[i+3] > 8) { o++; }
      }
    }
    r.sampledPixels = s;
    r.nonTransparentFraction = s ? +(o/s).toFixed(6) : 0;
    r.measuredState = r.nonTransparentFraction > 0.005 ? 'painted' : 'sized-but-blank';
  } catch (e) { r.readError = String(e); r.measuredState = 'measurement-failed'; }
  return r;
}
const pane = Array.from(document.querySelectorAll('.leaflet-pane'))
  .find(p => /user-maps-pane/.test(p.className)) || null;
// The app renders its own zoom/centre readout: "Z 12 · 43.00000, -66.50000".
// Independent of the tile-URL derivation below; both are reported so they can
// be compared.
let readout = null;
for (const el of document.querySelectorAll('div,span,p,small,code')) {
  const t = (el.textContent || '').trim();
  if (/^Z\s*\d+\s*[·.]\s*-?\d+\.\d+,\s*-?\d+\.\d+$/.test(t) && el.children.length === 0) {
    readout = t; break;
  }
}
const tiles = Array.from(document.querySelectorAll('img.leaflet-tile'))
  .map(t => t.currentSrc || t.src).filter(Boolean);
const zxy = [];
for (const s of tiles) {
  const m = s.match(/\/(\d{1,2})\/(\d+)\/(\d+)(?:@\dx)?\.(?:png|jpg|jpeg|webp)/);
  if (m) { zxy.push([+m[1], +m[2], +m[3]]); }
}
let tileDerived = null;
if (zxy.length) {
  const z = zxy[0][0];
  const xs = zxy.map(t=>t[1]), ys = zxy.map(t=>t[2]);
  const cx = (Math.min(...xs)+Math.max(...xs)+1)/2, cy = (Math.min(...ys)+Math.max(...ys)+1)/2;
  const n = Math.pow(2, z);
  tileDerived = { zoom: z, lng: cx/n*360-180,
    lat: Math.atan(Math.sinh(Math.PI*(1-2*cy/n)))*180/Math.PI };
}
const rows = Array.from(document.querySelectorAll('.user-map-row')).map(r => {
  const cb = r.querySelector('input[type=checkbox]');
  return {
    text: (r.textContent||'').replace(/\s+/g,' ').trim(),
    checked: cb ? cb.checked : null,
    checkboxDisabled: cb ? cb.disabled : null,
    buttons: Array.from(r.querySelectorAll('button')).map(b => b.textContent.trim()),
    needsGeoreferenceBadge:
      Array.from(r.querySelectorAll('.user-map-needs-georeference'))
        .map(s => s.textContent.trim()),
  };
});
return {
  rows: rows,
  paneCanvases: pane ? Array.from(pane.querySelectorAll('canvas')).map(readCanvas) : [],
  zoomReadout: readout,
  tileDerived: tileDerived,
  outcomes: Array.from(document.querySelectorAll('.user-map-outcomes li'))
              .map(li => li.textContent.trim()),
  status: (document.querySelector('.user-map-status')||{}).textContent || null,
  jsErrors: window.__errs || [],
  unhandledRejections: window.__rej || [],
  longTaskApiSupported: window.__longTaskSupported === true,
};
"""

DUMP_IDB = r"""
const done = arguments[arguments.length - 1];
(async () => {
  const out = {};
  try {
    const db = await new Promise((res, rej) => {
      const q = indexedDB.open('ns-marks-the-spot-user-maps');
      q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error);
    });
    const recs = await new Promise((res, rej) => {
      const q = db.transaction('maps','readonly').objectStore('maps').getAll();
      q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error);
    });
    out.recordCount = recs.length;
    out.records = recs.map(r => ({
      id: r.id, name: r.name, source: r.source, pixelSize: r.pixelSize,
      sourceRect: r.sourceRect,
      georefKind: r.georef && r.georef.kind,
      georefMethod: r.georef && r.georef.method,
      gcpCount: r.georef && r.georef.gcps ? r.georef.gcps.length : null,
      gcps: r.georef && r.georef.gcps ? r.georef.gcps : null,
      pageCount: r.pdf && r.pdf.pageCount,
      registrationStatus: r.pdf && r.pdf.registration && r.pdf.registration.status,
      selection: r.pdf && r.pdf.registration && r.pdf.registration.selection,
      selectedFrameId: r.pdf && r.pdf.registration && r.pdf.registration.selectedFrameId,
      selectedLabel: r.pdf && r.pdf.registration && r.pdf.registration.selectedLabel,
      flavor: r.pdf && r.pdf.registration && r.pdf.registration.flavor,
      adjusted: r.pdf && r.pdf.registration && r.pdf.registration.adjusted,
      manualReason: r.pdf && r.pdf.registration && r.pdf.registration.reason,
      candidates: r.pdf && r.pdf.registration && r.pdf.registration.candidates
        ? r.pdf.registration.candidates.map(c => ({
            id: c.id, flavor: c.flavor, embeddedLabel: c.embeddedLabel,
            sourceRect: c.sourceRect, gcpCount: c.gcps ? c.gcps.length : null }))
        : null,
    }));
    const bs = db.transaction('blobs','readonly').objectStore('blobs');
    const keys = await new Promise((res, rej) => {
      const q = bs.getAllKeys(); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error);
    });
    out.blobs = {};
    for (const k of keys) {
      const v = await new Promise((res, rej) => {
        const q = db.transaction('blobs','readonly').objectStore('blobs').get(k);
        q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error);
      });
      out.blobs[k] = { type: v && v.type,
                       byteLength: v && v.data ? v.data.byteLength : null };
    }
    db.close();
  } catch (e) { out.error = String(e); }
  done(out);
})();
"""


def dismiss_dialog(driver):
    for label in ["Continue without", "Continue", "Accept", "Agree", "Dismiss"]:
        try:
            btns = [b for b in driver.find_elements(By.TAG_NAME, "button")
                    if label.lower() in (b.text or "").lower() and b.is_displayed()]
            if btns:
                driver.execute_script("arguments[0].click();", btns[0])
                time.sleep(2)
                return btns[0].text
        except Exception:
            pass
    return None


def clear_alert(driver):
    try:
        a = driver.switch_to.alert
        text = a.text
        a.accept()
        return text
    except NoAlertPresentException:
        return None
    except Exception:
        return None


def read_adjust_points(driver):
    opened = driver.execute_script(r"""
      const bs = Array.from(document.querySelectorAll('.user-map-georeference'));
      const b = bs.find(x => /adjust points|georeference/i.test(x.textContent));
      if (!b) { return { opened: false, available: bs.map(x=>x.textContent.trim()) }; }
      b.click();
      return { opened: true, buttonText: b.textContent.trim() };
    """)
    if not opened.get("opened"):
        return opened
    time.sleep(2.5)
    opened.update(driver.execute_script(r"""
      const st = document.querySelector('.georeference-status');
      const rows = Array.from(document.querySelectorAll('table.gcp-list tr.gcp-row'));
      return {
        panelPresent: !!document.querySelector('.georeference-panel'),
        rmsText: st ? st.textContent.trim() : null,
        pointCount: rows.length,
        points: rows.map(r => {
          const td = Array.from(r.querySelectorAll('td')).map(c=>c.textContent.trim());
          return { i: td[0], scan: td[1], map: td[2], offBy: td[3] }; }),
      };
    """))
    driver.execute_script(r"""
      const d = document.querySelector('.georeference-done');
      if (d) { d.click(); return; }
      const b = Array.from(document.querySelectorAll('button'))
                 .find(x => x.textContent.trim() === 'Done');
      if (b) { b.click(); }
    """)
    time.sleep(2)
    return opened


def wait_for_chooser(driver, timeout=90):
    """The chooser mounts only after its page-1 preview is ready. Poll instead
    of sleeping a fixed interval."""
    deadline = time.time() + timeout
    while time.time() < deadline:
        st = driver.execute_script(READ_CHOOSER)
        if st["dialogPresent"] and st["radioCount"] > 0:
            return st
        time.sleep(1)
    return driver.execute_script(READ_CHOOSER)


def reset_storage(driver):
    """Delete IndexedDB and the UI-state key so each file starts from an empty
    record list. Without this, records accumulate in the shared profile and
    records[0]/rows[0] silently refer to an EARLIER file."""
    driver.execute_async_script(r"""
      const done = arguments[arguments.length - 1];
      (async () => {
        try {
          for (const k of Object.keys(window.localStorage)) {
            if (k.indexOf('user-map') !== -1) { window.localStorage.removeItem(k); }
          }
          await new Promise((res) => {
            const q = indexedDB.deleteDatabase('ns-marks-the-spot-user-maps');
            q.onsuccess = q.onerror = q.onblocked = () => res();
            setTimeout(res, 8000);
          });
          done({ ok: true });
        } catch (e) { done({ ok: false, error: String(e) }); }
      })();
    """)


def choose_frame(driver, value):
    deadline = time.time() + 60
    while time.time() < deadline:
        present = driver.execute_script("""
          return !!Array.from(document.querySelectorAll('input[name="geopdf-frame"]'))
                    .find(x => x.value === arguments[0]);
        """, value)
        if present:
            break
        time.sleep(1)
    driver.execute_script("""
      const v = arguments[0];
      const r = Array.from(document.querySelectorAll('input[name="geopdf-frame"]'))
                 .find(x => x.value === v);
      if (!r) { throw new Error('radio not found for value ' + v); }
      r.click();
    """, value)
    time.sleep(0.8)
    after = driver.execute_script(READ_CHOOSER)
    driver.execute_script("""
      const dlg = document.querySelector('.geopdf-frame-chooser');
      const b = Array.from(dlg.querySelectorAll('button'))
                 .find(x => /use this frame/i.test(x.textContent));
      b.click();
    """)
    alert = clear_alert(driver)
    deadline = time.time() + 120
    while time.time() < deadline:
        if not driver.execute_script(
                "return !!document.querySelector('.geopdf-frame-chooser');"):
            break
        time.sleep(1)
    time.sleep(4)
    return after, alert


def run_file(driver, pdf, results):
    name = os.path.basename(pdf)
    L(f"===== {name} ({os.path.getsize(pdf)} bytes) =====")
    F = {"file": name, "bytes": os.path.getsize(pdf),
         "receiptExpectation": RECEIPT.get(name)}
    driver.get(ORIGIN)
    time.sleep(3)
    dismiss_dialog(driver)
    # Per-file isolation. Records persist in the shared profile, so without
    # this the first record belongs to an EARLIER file and every per-record
    # reading below would silently describe the wrong map.
    reset_storage(driver)
    driver.get(ORIGIN)
    time.sleep(3)
    driver.execute_script(INSTRUMENT)
    dismiss_dialog(driver)
    driver.execute_script(INSTRUMENT)
    pre = driver.execute_async_script(DUMP_IDB)
    F["recordsBeforeImport"] = pre.get("recordCount")
    if pre.get("recordCount"):
        L(f"  WARNING: {pre.get('recordCount')} records survived the reset")

    inp = driver.find_elements(By.CSS_SELECTOR, "input[type=file]")[0]
    driver.execute_script(
        "arguments[0].style.display='block';arguments[0].style.visibility='visible';"
        "arguments[0].style.opacity=1;arguments[0].removeAttribute('hidden');", inp)
    t_send = time.time()
    inp.send_keys(pdf)

    ch = None
    while time.time() - t_send < 420:
        ch = driver.execute_script(READ_CHOOSER)
        if ch["dialogPresent"] and ch["radioCount"] > 0:
            break
        st = driver.execute_script(READ_STATE)
        if st["outcomes"]:
            break
        time.sleep(2)
    F["secondsToChooser"] = round(time.time() - t_send, 2)
    F["chooserInitial"] = ch
    F["stateAtChooser"] = driver.execute_script(READ_STATE)
    L(f"  chooser in {F['secondsToChooser']}s: present={ch['dialogPresent']} "
      f"radios={ch['radioCount']} anyChecked={ch['anyChecked']} "
      f"confirmDisabled={ch['confirmDisabled']}")
    L(f"  labels: {[o['label'] for o in ch['options']]}")

    if not ch["dialogPresent"] or ch["radioCount"] == 0:
        idb = driver.execute_async_script(DUMP_IDB)
        F["idb"] = idb
        recs = idb.get("records") or []
        if recs and recs[0].get("registrationStatus") == "embedded" \
                and (recs[0].get("selection") or {}).get("kind") != "sole":
            F["outcome"] = "SILENT_SELECTION_DEFECT"
            L("  *** SILENT_SELECTION_DEFECT: embedded placement with no chooser "
              "and selection.kind != 'sole' ***")
        else:
            F["outcome"] = "NO_CHOOSER"
        results.append(F)
        return

    # Nothing may be preselected on the FIRST presentation.
    F["noPreselectionOnFirstPresentation"] = (
        ch["anyChecked"] is False and ch["confirmDisabled"] is True
        and ch["highlightPresent"] is False)
    if not F["noPreselectionOnFirstPresentation"]:
        L("  *** PRESELECTION DEFECT: chooser arrived with a selection ***")

    ids = [o["value"] for o in ch["options"]]
    exp = (RECEIPT.get(name) or {}).get("candidateIds")
    F["candidateIdsMatchReceipt"] = (sorted(ids) == sorted(exp)) if exp else None
    F["candidateIdsObserved"] = ids
    L(f"  candidate ids match receipt: {F['candidateIdsMatchReceipt']}")

    # Cycle EVERY candidate: main map and every inset.
    F["frames"] = []
    for i, opt in enumerate(ch["options"]):
        if i > 0:
            reopen = driver.execute_script(r"""
              const b = Array.from(document.querySelectorAll('.user-map-georeference'))
                         .find(x => /change frame|choose frame/i.test(x.textContent));
              if (!b) { return { reopened: false,
                 available: Array.from(document.querySelectorAll('.user-map-georeference'))
                              .map(x=>x.textContent.trim()) }; }
              b.click(); return { reopened: true, buttonText: b.textContent.trim() };
            """)
            if not reopen.get("reopened"):
                L(f"  cannot reopen chooser for frame {i}: {reopen}")
                F["frames"].append({"index": i, "label": opt["label"],
                                    "error": "could-not-reopen", "detail": reopen})
                continue
            reopened_state = wait_for_chooser(driver)
            if not reopened_state.get("radioCount"):
                L(f"  chooser did not reopen for frame {i}")
                F["frames"].append({"index": i, "label": opt["label"],
                                    "error": "chooser-did-not-reopen",
                                    "detail": reopened_state})
                continue
        else:
            reopen = {"reopened": False, "note": "first choice uses the initial chooser"}
            reopened_state = ch

        after, alert = choose_frame(driver, opt["value"])
        state = driver.execute_script(READ_STATE)
        idb = driver.execute_async_script(DUMP_IDB)
        ap = read_adjust_points(driver)
        rec = (idb.get("records") or [{}])[0]
        row = (state.get("rows") or [{}])[0]
        canvases = state.get("paneCanvases") or []
        painted = max([c.get("nonTransparentFraction") or 0 for c in canvases],
                      default=0)
        entry = {
            "index": i,
            "label": opt["label"],
            "candidateId": opt["value"],
            "isMainMapLabel": opt["label"].strip() == "Map Layers",
            "reopenedVia": reopen,
            # Reopening SHOULD pre-check the current frame. Recorded separately
            # from the initial-presentation rule so the two are never confused.
            "reopenedChooserPrechecked": reopened_state.get("anyChecked"),
            "reopenedCheckedValues": reopened_state.get("checkedValues"),
            "selectionEnabledConfirm": after.get("confirmDisabled") is False,
            "highlightAfterSelect": after.get("highlightPresent"),
            "confirmAlert": alert,
            "registrationStatus": rec.get("registrationStatus"),
            "selectionKind": (rec.get("selection") or {}).get("kind"),
            "selectedLabel": rec.get("selectedLabel"),
            "selectedFrameId": rec.get("selectedFrameId"),
            "flavor": rec.get("flavor"),
            "pageCount": rec.get("pageCount"),
            "georefKind": rec.get("georefKind"),
            "gcpCount": rec.get("gcpCount"),
            "manualReason": rec.get("manualReason"),
            "rowText": row.get("text"),
            "rowButtons": row.get("buttons"),
            "rowCheckboxDisabled": row.get("checkboxDisabled"),
            "rowChecked": row.get("checked"),
            "needsGeoreferenceBadge": row.get("needsGeoreferenceBadge"),
            "rmsText": ap.get("rmsText"),
            "pointCount": ap.get("pointCount"),
            "points": ap.get("points"),
            "canvasPaintedFraction": painted,
            "canvasStates": [c.get("measuredState") for c in canvases],
            "zoomReadout": state.get("zoomReadout"),
            "tileDerived": state.get("tileDerived"),
            "outcomes": state.get("outcomes"),
        }
        # The decisive rule: a supported frame must never ask for GCP placement.
        entry["requestsGcpPlacement"] = bool(
            (row.get("buttons") and any(b == "Georeference" for b in row["buttons"]))
            or row.get("checkboxDisabled")
            or (row.get("needsGeoreferenceBadge") or [])
            or rec.get("registrationStatus") == "manual")
        entry["placedFromEmbedded"] = (
            rec.get("registrationStatus") == "embedded"
            and (rec.get("selection") or {}).get("kind") == "user")
        F["frames"].append(entry)
        L(f"  [{i}] {opt['label']!r} -> status={entry['registrationStatus']} "
          f"selection={entry['selectionKind']} gcps={entry['gcpCount']} "
          f"rms={entry['rmsText']!r} painted={painted} "
          f"requestsGCP={entry['requestsGcpPlacement']}")
        driver.save_screenshot(f"{OUT}/{name}-frame{i}-{opt['label'].replace(' ','_')}.png")

    good = [f for f in F["frames"] if "error" not in f]
    F["allFramesPlacedFromEmbedded"] = bool(good) and all(
        f["placedFromEmbedded"] for f in good)
    F["noFrameRequestedGcpPlacement"] = bool(good) and not any(
        f["requestsGcpPlacement"] for f in good)
    F["insetsProven"] = [f["label"] for f in good if not f["isMainMapLabel"]]
    F["mainMapProven"] = [f["label"] for f in good if f["isMainMapLabel"]]
    F["rmsByLabel"] = {f["label"]: f["rmsText"] for f in good}
    F["outcome"] = ("ALL_FRAMES_EXPLICIT_AND_EMBEDDED"
                    if F["allFramesPlacedFromEmbedded"]
                    and F["noFrameRequestedGcpPlacement"]
                    and F["noPreselectionOnFirstPresentation"]
                    else "SEE_DETAIL")
    F["idbFinal"] = driver.execute_async_script(DUMP_IDB)
    L(f"  OUTCOME {F['outcome']} | insets proven: {F['insetsProven']}")
    results.append(F)


def main():
    opts = Options()
    opts.set_preference("pdfjs.disabled", True)
    service = Service(executable_path="/opt/homebrew/bin/geckodriver",
                      log_path=f"{OUT}/geckodriver.log")
    driver = webdriver.Firefox(options=opts, service=service)
    driver.set_script_timeout(240)
    R = {
        "case": "multi-frame chooser matrix",
        "harness": "geckodriver 0.37.1 + system Firefox via Selenium 4.46.0 "
                   "(NOT the Chrome extension bridge)",
        "delivery": "native <input type=file> send_keys, no bridge size ceiling",
        "profile": "fresh geckodriver temporary profile per launch",
        "origin": ORIGIN,
        "files": [],
    }
    try:
        caps = driver.capabilities
        R["browserVersion"] = caps.get("browserVersion")
        R["mozBuildID"] = caps.get("moz:buildID")
        R["geckodriverVersion"] = caps.get("moz:geckodriverVersion")
        L(f"ATTACHED firefox {caps.get('browserVersion')} "
          f"buildID={caps.get('moz:buildID')} gecko={caps.get('moz:geckodriverVersion')}")
        driver.set_window_size(1440, 900)
        for pdf in PDFS:
            try:
                run_file(driver, pdf, R["files"])
            except Exception as e:
                L(f"  FILE ERROR {os.path.basename(pdf)}: {e}")
                R["files"].append({"file": os.path.basename(pdf),
                                   "outcome": "HARNESS_ERROR", "error": str(e)})
    finally:
        R["log"] = log
        with open(f"{OUT}/chooser-matrix.json", "w") as f:
            json.dump(R, f, indent=2, default=str)
        print("WROTE", f"{OUT}/chooser-matrix.json")
        driver.quit()


if __name__ == "__main__":
    main()
