#!/usr/bin/env python3
"""Stop rule 1 — legacy GeoPDF post-reload raster, exact Zoom-to-point rerun.

HARNESS: geckodriver 0.37.1 + system Firefox via Selenium 4.46.0.
         NOT the Chrome extension bridge. Native <input type=file> send_keys.
         Fresh temporary Firefox profile per launch => empty IndexedDB at t0.

QUESTION: after reload, is the legacy raster
  (a) PERSISTED_BUT_OFFSCREEN  -- bytes intact, layer alive, viewport elsewhere;
                                  Zoom to point repaints it. NOT a bug.
  (b) LOST_BYTES               -- the persisted preview blob is missing/empty,
                                  so nothing can be drawn. Data-loss defect.
  (c) BLANK_RENDER_DEFECT      -- bytes intact and decodable, viewport over the
                                  drape, canvas still paints nothing. Render defect.

Discriminators captured, all three independently:
  * stored byte counts + MIME for `<id>:raster` and `<id>:preview` in IndexedDB
  * an INDEPENDENT reconstruction of the stored preview bytes into an offscreen
    canvas (dimensions + non-transparent pixel fraction) -- proves the bytes are
    a real image and not a blank PNG, without trusting the app's own layer
  * the live layer canvas in the user-maps pane: presence, size, bounding rect,
    non-transparent pixel fraction, sampled directly with getImageData
  * viewport geometry: container rect, canvas/container overlap, tile-derived
    zoom and centre, and the persisted GCP lat/lngs the drape actually occupies

Usage:
  ff_stoprule1.py <origin> <pdf> [budget_sec] [outdir]
"""
import json, sys, time, os

from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.firefox.options import Options
from selenium.webdriver.firefox.service import Service

ORIGIN = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:4340"
PDF = sys.argv[2] if len(sys.argv) > 2 else (
    "/Users/dfakkeldy/Developer/_geopdf-acceptance-tmp/corpus/"
    "NH_Isles_of_Shoals_OE_W_20150610_TM_geo.pdf")
BUDGET = int(sys.argv[3]) if len(sys.argv) > 3 else 300
OUT = sys.argv[4] if len(sys.argv) > 4 else \
    "/Users/dfakkeldy/Developer/_geopdf-acceptance-tmp/sr1-out"
os.makedirs(OUT, exist_ok=True)

T0 = time.time()
log = []


def L(msg):
    line = f"[{time.time() - T0:7.2f}s] {msg}"
    print(line, flush=True)
    log.append(line)


# --------------------------------------------------------------------------
# Injected JS
# --------------------------------------------------------------------------

INSTRUMENT = r"""
window.__errs = []; window.__rej = [];
window.addEventListener('error', e => window.__errs.push(String(e.message)));
window.addEventListener('unhandledrejection',
  e => window.__rej.push(String(e.reason)));
window.__longTasks = [];
try {
  new PerformanceObserver((l) => {
    for (const e of l.getEntries()) {
      window.__longTasks.push({ start: Math.round(e.startTime),
                                dur: Math.round(e.duration) });
    }
  }).observe({ entryTypes: ['longtask'] });
} catch (e) { window.__longTaskError = String(e); }
"""

# Locate the Leaflet map instance. Three tiers, most reliable first; the tier
# that succeeded is reported so a reader knows how the numbers were obtained.
FIND_MAP = r"""
window.__findMap = function () {
  const c = document.querySelector('.leaflet-container');
  if (!c) { return { tier: 'none', map: null }; }
  if (c._leaflet_map && typeof c._leaflet_map.getCenter === 'function') {
    return { tier: 'container-prop', map: c._leaflet_map };
  }
  // React fiber walk: react-leaflet keeps the map in context/state.
  const key = Object.keys(c).find(k => k.startsWith('__reactFiber$')
                                    || k.startsWith('__reactInternalInstance$'));
  if (key) {
    const seen = new Set();
    let node = c[key];
    let hops = 0;
    while (node && hops < 400) {
      hops++;
      for (const slot of [node.memoizedState, node.memoizedProps,
                          node.stateNode, node.pendingProps]) {
        let s = slot; let depth = 0;
        while (s && typeof s === 'object' && depth < 6) {
          depth++;
          if (seen.has(s)) { break; }
          seen.add(s);
          for (const v of [s, s.value, s.map, s.current, s.instance]) {
            if (v && typeof v.getCenter === 'function'
                  && typeof v.getZoom === 'function'
                  && typeof v.getPane === 'function') {
              return { tier: 'react-fiber', map: v };
            }
          }
          s = s.next || s.memoizedState || null;
        }
      }
      node = node.return;
    }
  }
  return { tier: 'not-found', map: null };
};
"""

# Viewport geometry + live layer canvas readback.
PROBE_RENDER = r"""
const out = { at: new Date().toISOString() };
const container = document.querySelector('.leaflet-container');
out.containerRect = container ? container.getBoundingClientRect().toJSON() : null;
out.dpr = window.devicePixelRatio;

const found = window.__findMap ? window.__findMap() : { tier: 'not-installed', map: null };
out.mapLookupTier = found.tier;
if (found.map) {
  try {
    const ctr = found.map.getCenter();
    out.mapCenter = { lat: ctr.lat, lng: ctr.lng };
    out.mapZoom = found.map.getZoom();
    const b = found.map.getBounds();
    out.mapBounds = { south: b.getSouth(), west: b.getWest(),
                      north: b.getNorth(), east: b.getEast() };
    out.mapSize = found.map.getSize();
  } catch (e) { out.mapReadError = String(e); }
}

// Tile-derived zoom/centre: independent of the map object.
const tiles = Array.from(document.querySelectorAll('img.leaflet-tile'))
  .map(t => t.currentSrc || t.src).filter(Boolean);
out.tileCount = tiles.length;
const zxy = [];
for (const src of tiles) {
  const m = src.match(/\/(\d{1,2})\/(\d+)\/(\d+)(?:@\dx)?\.(?:png|jpg|jpeg|webp|pbf)/);
  if (m) { zxy.push([+m[1], +m[2], +m[3]]); }
}
if (zxy.length) {
  const z = zxy[0][0];
  const xs = zxy.map(t => t[1]); const ys = zxy.map(t => t[2]);
  const cx = (Math.min(...xs) + Math.max(...xs) + 1) / 2;
  const cy = (Math.min(...ys) + Math.max(...ys) + 1) / 2;
  const n = Math.pow(2, z);
  const lng = cx / n * 360 - 180;
  const latRad = Math.atan(Math.sinh(Math.PI * (1 - 2 * cy / n)));
  out.tileDerived = { zoom: z, lat: latRad * 180 / Math.PI, lng: lng,
                      sampleTiles: zxy.length };
}

// The user-maps pane and its layer canvases.
const panes = Array.from(document.querySelectorAll('.leaflet-pane'));
out.paneNames = panes.map(p => p.className);
const pane = panes.find(p => /user-maps-pane/.test(p.className)) || null;
out.userMapsPanePresent = !!pane;
out.userMapsPaneChildren = pane ? pane.children.length : 0;

function readCanvas(cv) {
  const r = { width: cv.width, height: cv.height,
              cssRect: cv.getBoundingClientRect().toJSON(),
              opacity: cv.style.opacity,
              transform: cv.style.transform || getComputedStyle(cv).transform };
  // A 0x0 canvas is NOT a failed measurement and NOT a blank paint. It is the
  // one branch in WarpedRasterLayer.redraw() where computeBackingRect returned
  // null because the padded viewport does not intersect the drape
  // (WarpedRasterLayer.ts:438-443 sets width/height to 0). Record it as its own
  // measured state so it can never be silently scored as "blank".
  if (cv.width === 0 || cv.height === 0) {
    r.measuredState = 'unsized-no-backing-allocated';
    r.nonTransparentFraction = null;
    r.layerPresent = true;
    return r;
  }
  try {
    const ctx = cv.getContext('2d');
    if (!ctx) { r.readError = 'no 2d context'; return r; }
    const step = Math.max(1, Math.floor(Math.sqrt((cv.width * cv.height) / 200000)));
    const data = ctx.getImageData(0, 0, cv.width, cv.height).data;
    let sampled = 0, opaque = 0, sumA = 0;
    for (let y = 0; y < cv.height; y += step) {
      for (let x = 0; x < cv.width; x += step) {
        const i = (y * cv.width + x) * 4;
        sampled++; sumA += data[i + 3];
        if (data[i + 3] > 8) { opaque++; }
      }
    }
    r.sampledPixels = sampled;
    r.nonTransparentPixels = opaque;
    r.nonTransparentFraction = sampled ? +(opaque / sampled).toFixed(6) : 0;
    r.meanAlpha = sampled ? +(sumA / sampled).toFixed(3) : 0;
    r.sampleStep = step;
    r.measuredState = r.nonTransparentFraction > 0.005 ? 'painted' : 'sized-but-blank';
  } catch (e) { r.readError = String(e); r.measuredState = 'measurement-failed'; }
  return r;
}

out.paneCanvases = pane
  ? Array.from(pane.querySelectorAll('canvas')).map(readCanvas) : [];

// Overlap of the drawn canvas with the visible container.
if (out.containerRect && out.paneCanvases.length) {
  const c = out.containerRect;
  out.canvasContainerOverlap = out.paneCanvases.map(pc => {
    const r = pc.cssRect;
    const w = Math.max(0, Math.min(c.right, r.right) - Math.max(c.left, r.left));
    const h = Math.max(0, Math.min(c.bottom, r.bottom) - Math.max(c.top, r.top));
    return { overlapPx: Math.round(w * h),
             overlapFractionOfContainer:
               +((w * h) / Math.max(1, c.width * c.height)).toFixed(4) };
  });
}

out.rowCount = document.querySelectorAll('.user-map-row').length;
out.rows = Array.from(document.querySelectorAll('.user-map-row')).map(r => {
  const cb = r.querySelector('input[type=checkbox]');
  const range = r.querySelector('input[type=range]');
  return {
    text: (r.textContent || '').replace(/\s+/g, ' ').trim(),
    checked: cb ? cb.checked : null,
    disabled: cb ? cb.disabled : null,
    opacity: range ? range.value : null,
    buttons: Array.from(r.querySelectorAll('button')).map(b => b.textContent.trim()),
  };
});
out.statusText = (document.querySelector('.user-map-status') || {}).textContent || null;
out.outcomes = Array.from(document.querySelectorAll('.user-map-outcomes li'))
  .map(li => li.textContent.trim());
out.jsErrors = window.__errs || [];
out.unhandledRejections = window.__rej || [];
out.longTasksOver200ms = (window.__longTasks || []).filter(t => t.dur > 200);
out.longTaskMax = (window.__longTasks || []).reduce((m, t) => Math.max(m, t.dur), 0);
out.longTaskCount = (window.__longTasks || []).length;
// Firefox does not implement the Long Tasks API. Without this flag a reader
// would misread an empty list as "no long tasks" instead of "not measurable".
out.longTaskApiError = window.__longTaskError || null;
out.longTaskApiSupported =
  !window.__longTaskError &&
  typeof PerformanceObserver !== 'undefined' &&
  Array.isArray(PerformanceObserver.supportedEntryTypes) &&
  PerformanceObserver.supportedEntryTypes.indexOf('longtask') !== -1;
return out;
"""

# IndexedDB dump + independent reconstruction of the stored preview bytes.
DUMP_IDB = r"""
const done = arguments[arguments.length - 1];
(async () => {
  const out = { db: 'ns-marks-the-spot-user-maps' };
  try {
    out.localStorage = {};
    for (const k of Object.keys(window.localStorage)) {
      if (k.indexOf('user-map') !== -1) { out.localStorage[k] = window.localStorage.getItem(k); }
    }
    const db = await new Promise((res, rej) => {
      const q = indexedDB.open('ns-marks-the-spot-user-maps');
      q.onsuccess = () => res(q.result);
      q.onerror = () => rej(q.error);
    });
    out.dbVersion = db.version;
    out.storeNames = Array.from(db.objectStoreNames);
    const tx = db.transaction(Array.from(db.objectStoreNames), 'readonly');

    const records = await new Promise((res, rej) => {
      const q = tx.objectStore('maps').getAll();
      q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error);
    });
    out.records = records;
    out.recordCount = records.length;

    const blobStore = tx.objectStore('blobs');
    const keys = await new Promise((res, rej) => {
      const q = blobStore.getAllKeys();
      q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error);
    });
    out.blobKeys = keys;
    out.blobs = {};
    for (const k of keys) {
      const v = await new Promise((res, rej) => {
        const q = blobStore.get(k);
        q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error);
      });
      out.blobs[k] = {
        type: v && v.type,
        byteLength: v && v.data ? v.data.byteLength : null,
        ctor: v && v.data ? v.data.constructor.name : null,
      };
    }

    // INDEPENDENT RECONSTRUCTION: decode the stored preview bytes ourselves,
    // into a canvas the application never touched.
    out.reconstruction = {};
    for (const k of keys.filter(k => k.endsWith(':preview'))) {
      const rec = { key: k };
      try {
        const v = await new Promise((res, rej) => {
          const q = db.transaction('blobs', 'readonly').objectStore('blobs').get(k);
          q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error);
        });
        rec.byteLength = v && v.data ? v.data.byteLength : null;
        rec.type = v && v.type;
        const blob = new Blob([v.data], { type: v.type });
        const bmp = await createImageBitmap(blob);
        rec.decodedWidth = bmp.width;
        rec.decodedHeight = bmp.height;
        const cv = document.createElement('canvas');
        cv.width = Math.min(bmp.width, 1200);
        cv.height = Math.round(bmp.height * (cv.width / bmp.width));
        const ctx = cv.getContext('2d');
        ctx.drawImage(bmp, 0, 0, cv.width, cv.height);
        const d = ctx.getImageData(0, 0, cv.width, cv.height).data;
        let opaque = 0, nonWhite = 0, sumA = 0;
        const total = cv.width * cv.height;
        for (let i = 0; i < d.length; i += 4) {
          sumA += d[i + 3];
          if (d[i + 3] > 8) { opaque++; }
          if (d[i + 3] > 8 && !(d[i] > 247 && d[i + 1] > 247 && d[i + 2] > 247)) { nonWhite++; }
        }
        rec.sampledPixels = total;
        rec.nonTransparentFraction = +(opaque / total).toFixed(6);
        rec.nonWhiteFraction = +(nonWhite / total).toFixed(6);
        rec.meanAlpha = +(sumA / total).toFixed(3);
        rec.thumbnailDataUrl = (() => {
          const t = document.createElement('canvas');
          t.width = 220; t.height = Math.max(1, Math.round(bmp.height * (220 / bmp.width)));
          t.getContext('2d').drawImage(bmp, 0, 0, t.width, t.height);
          return t.toDataURL('image/png');
        })();
        bmp.close && bmp.close();
      } catch (e) { rec.error = String(e); }
      out.reconstruction[k] = rec;
    }
    db.close();
  } catch (e) { out.error = String(e); }
  done(out);
})();
"""


def dismiss_dialog(driver, tag):
    """Clear the startup Province-data licence dialog if present."""
    for label in ["Continue without", "Continue", "Accept", "Agree", "Dismiss", "Close"]:
        try:
            btns = [b for b in driver.find_elements(By.TAG_NAME, "button")
                    if label.lower() in (b.text or "").lower() and b.is_displayed()]
            if btns:
                L(f"[{tag}] clicking startup button {btns[0].text!r}")
                driver.execute_script("arguments[0].click();", btns[0])
                time.sleep(2)
                return btns[0].text
        except Exception as e:
            L(f"[{tag}] dialog attempt {label}: {e}")
    return None


def main():
    opts = Options()
    opts.set_preference("pdfjs.disabled", True)
    service = Service(executable_path="/opt/homebrew/bin/geckodriver",
                      log_path=f"{OUT}/geckodriver.log")
    driver = webdriver.Firefox(options=opts, service=service)
    driver.set_script_timeout(180)

    R = {
        "case": "stop-rule-1 legacy post-reload raster, Zoom-to-point rerun",
        "harness": "geckodriver 0.37.1 + system Firefox via Selenium 4.46.0 "
                   "(NOT the Chrome extension bridge)",
        "delivery": "native <input type=file> send_keys, no bridge size ceiling",
        "profile": "fresh geckodriver temporary profile; IndexedDB empty at t0",
        "origin": ORIGIN,
        "file": os.path.basename(PDF),
        "fileBytes": os.path.getsize(PDF),
        "budgetSec": BUDGET,
    }
    try:
        caps = driver.capabilities
        R["browserName"] = caps.get("browserName")
        R["browserVersion"] = caps.get("browserVersion")
        R["mozBuildID"] = caps.get("moz:buildID")
        R["geckodriverVersion"] = caps.get("moz:geckodriverVersion")
        R["platformName"] = caps.get("platformName")
        L(f"ATTACHED {caps.get('browserName')} {caps.get('browserVersion')} "
          f"buildID={caps.get('moz:buildID')} geckodriver={caps.get('moz:geckodriverVersion')}")

        driver.set_window_size(1440, 900)
        driver.get(ORIGIN)
        time.sleep(3)
        driver.execute_script(INSTRUMENT + FIND_MAP)
        R["startupDialogButton"] = dismiss_dialog(driver, "initial")
        driver.execute_script(INSTRUMENT + FIND_MAP)
        driver.save_screenshot(f"{OUT}/01-app-loaded.png")

        R["idbAtStart"] = driver.execute_async_script(DUMP_IDB)
        L(f"IndexedDB at t0: {R['idbAtStart'].get('recordCount')} records "
          f"(expect 0 — fresh profile)")

        # ---- deliver ------------------------------------------------------
        inputs = driver.find_elements(By.CSS_SELECTOR, "input[type=file]")
        R["fileInputCount"] = len(inputs)
        if not inputs:
            R["outcome"] = "HARNESS_BLOCKED_no_file_input"
            return R, driver
        inp = inputs[0]
        driver.execute_script(
            "arguments[0].style.display='block';arguments[0].style.visibility='visible';"
            "arguments[0].style.opacity=1;arguments[0].removeAttribute('hidden');", inp)
        L(f"delivering {os.path.basename(PDF)} ({os.path.getsize(PDF)} bytes)")
        t_send = time.time()
        inp.send_keys(PDF)

        # ---- wait for the chooser ----------------------------------------
        chooser = None
        while time.time() - t_send < BUDGET:
            chooser = driver.execute_script(r"""
              const dlg = document.querySelector('.geopdf-frame-chooser');
              const radios = Array.from(document.querySelectorAll('input[name="geopdf-frame"]'));
              return {
                dialogPresent: !!dlg,
                heading: dlg ? (dlg.querySelector('h2')||{}).textContent : null,
                intro: dlg ? (dlg.querySelector('p')||{}).textContent : null,
                legend: dlg ? (dlg.querySelector('legend')||{}).textContent : null,
                radioCount: radios.length,
                anyChecked: radios.some(r => r.checked),
                checkedValues: radios.filter(r => r.checked).map(r => r.value),
                options: radios.map(r => ({
                  value: r.value,
                  checked: r.checked,
                  label: ((r.closest('label')||{}).textContent||'').trim()
                })),
                confirmDisabled: (() => {
                  const bs = dlg ? Array.from(dlg.querySelectorAll('button')) : [];
                  const b = bs.find(x => /use this frame/i.test(x.textContent));
                  return b ? b.disabled : null;
                })(),
                status: (document.querySelector('.user-map-status')||{}).textContent||null,
                outcomes: Array.from(document.querySelectorAll('.user-map-outcomes li'))
                            .map(li => li.textContent.trim()),
                highlightPresent: !!document.querySelector('[data-testid="geopdf-frame-highlight"]')
              };
            """)
            if chooser["dialogPresent"] and chooser["radioCount"] > 0:
                break
            if chooser["outcomes"]:
                break
            time.sleep(2)

        R["importElapsedToChooserSec"] = round(time.time() - t_send, 2)
        R["chooserInitialState"] = chooser
        L(f"chooser after {R['importElapsedToChooserSec']}s: "
          f"present={chooser['dialogPresent']} radios={chooser['radioCount']} "
          f"anyChecked={chooser['anyChecked']} confirmDisabled={chooser['confirmDisabled']}")
        L(f"  options: {[o['label'] for o in chooser['options']]}")
        driver.save_screenshot(f"{OUT}/02-chooser-initial.png")

        if not chooser["dialogPresent"] or chooser["radioCount"] == 0:
            R["outcome"] = "NO_CHOOSER"
            R["renderPreReload"] = driver.execute_script(PROBE_RENDER)
            return R, driver

        # ---- explicit main-map selection ---------------------------------
        target = next((o for o in chooser["options"]
                       if o["label"].strip() == "Map Layers"), None)
        R["mainMapLabelPresent"] = target is not None
        if target is None:
            target = chooser["options"][0]
            R["mainMapFallbackUsed"] = True
        R["selectedCandidate"] = target
        L(f"explicitly selecting {target['label']!r} value={target['value']}")
        driver.execute_script("""
          const v = arguments[0];
          const r = Array.from(document.querySelectorAll('input[name="geopdf-frame"]'))
                     .find(x => x.value === v);
          r.click();
        """, target["value"])
        time.sleep(1)
        R["chooserAfterSelect"] = driver.execute_script(r"""
          const radios = Array.from(document.querySelectorAll('input[name="geopdf-frame"]'));
          const dlg = document.querySelector('.geopdf-frame-chooser');
          const bs = dlg ? Array.from(dlg.querySelectorAll('button')) : [];
          const b = bs.find(x => /use this frame/i.test(x.textContent));
          return { checkedValues: radios.filter(r=>r.checked).map(r=>r.value),
                   confirmDisabled: b ? b.disabled : null,
                   highlightPresent: !!document.querySelector('[data-testid="geopdf-frame-highlight"]') };
        """)
        driver.save_screenshot(f"{OUT}/03-chooser-selected.png")

        driver.execute_script("""
          const dlg = document.querySelector('.geopdf-frame-chooser');
          const b = Array.from(dlg.querySelectorAll('button'))
                     .find(x => /use this frame/i.test(x.textContent));
          b.click();
        """)
        L("clicked 'Use this frame'")

        deadline = time.time() + BUDGET
        while time.time() < deadline:
            st = driver.execute_script(
                "return {chooser: !!document.querySelector('.geopdf-frame-chooser'),"
                " rows: document.querySelectorAll('.user-map-row').length,"
                " canvases: document.querySelectorAll('.leaflet-pane[class*=user-maps-pane] canvas').length};")
            if not st["chooser"] and st["rows"] > 0 and st["canvases"] > 0:
                break
            time.sleep(2)
        time.sleep(4)  # let the fit + first warp settle

        R["renderPreReload"] = driver.execute_script(PROBE_RENDER)
        L(f"PRE-RELOAD canvases={len(R['renderPreReload']['paneCanvases'])} "
          f"nonTransparent="
          f"{[c.get('nonTransparentFraction') for c in R['renderPreReload']['paneCanvases']]} "
          f"mapTier={R['renderPreReload']['mapLookupTier']} "
          f"zoom={R['renderPreReload'].get('mapZoom')}")
        driver.save_screenshot(f"{OUT}/04-rendered-pre-reload.png")

        # ---- Adjust points, pre-reload -----------------------------------
        R["adjustPointsPreReload"] = open_adjust_points(driver)
        L(f"PRE-RELOAD RMS: {R['adjustPointsPreReload'].get('rmsText')!r} "
          f"points={R['adjustPointsPreReload'].get('pointCount')}")
        driver.save_screenshot(f"{OUT}/05-adjust-points-pre-reload.png")
        close_panel(driver)
        time.sleep(2)

        R["idbPreReload"] = driver.execute_async_script(DUMP_IDB)
        L(f"PRE-RELOAD idb: records={R['idbPreReload'].get('recordCount')} "
          f"blobs={R['idbPreReload'].get('blobs')}")

        # ---- RELOAD -------------------------------------------------------
        L("RELOADING")
        driver.refresh()
        t_reload = time.time()
        time.sleep(4)
        driver.execute_script(INSTRUMENT + FIND_MAP)
        R["startupDialogButtonAfterReload"] = dismiss_dialog(driver, "post-reload")
        driver.execute_script(INSTRUMENT + FIND_MAP)
        time.sleep(5)

        # SETTLE CONTROL. A 0x0 canvas could in principle mean the bitmap had
        # not finished decoding yet rather than the drape being offscreen.
        # Sample repeatedly, touching nothing, so decode latency is excluded by
        # observation and not only by argument.
        R["postReloadSettleSeries"] = []
        for wait_to in (10, 25, 45):
            while time.time() - t_reload < wait_to:
                time.sleep(1)
            probe = driver.execute_script(PROBE_RENDER)
            cs = probe.get("paneCanvases") or []
            entry = {
                "tSinceReloadSec": round(time.time() - t_reload, 1),
                "canvasCount": len(cs),
                "states": [c.get("measuredState") for c in cs],
                "dims": [[c.get("width"), c.get("height")] for c in cs],
                "nonTransparentFraction": [c.get("nonTransparentFraction") for c in cs],
                "tileDerived": probe.get("tileDerived"),
            }
            R["postReloadSettleSeries"].append(entry)
            L(f"  settle +{entry['tSinceReloadSec']}s: canvases={entry['canvasCount']} "
              f"states={entry['states']} dims={entry['dims']}")

        R["idbPostReload"] = driver.execute_async_script(DUMP_IDB)
        R["renderPostReloadBeforeZoom"] = driver.execute_script(PROBE_RENDER)
        driver.save_screenshot(f"{OUT}/06-post-reload-before-zoom.png")
        pr = R["renderPostReloadBeforeZoom"]
        L(f"POST-RELOAD/BEFORE-ZOOM canvases={len(pr['paneCanvases'])} "
          f"nonTransparent={[c.get('nonTransparentFraction') for c in pr['paneCanvases']]} "
          f"rows={pr['rowCount']} zoom={pr.get('mapZoom')} centre={pr.get('mapCenter')}")
        recon = R["idbPostReload"].get("reconstruction", {})
        for k, v in recon.items():
            L(f"  reconstructed {k}: bytes={v.get('byteLength')} "
              f"{v.get('decodedWidth')}x{v.get('decodedHeight')} "
              f"nonTransparent={v.get('nonTransparentFraction')} "
              f"nonWhite={v.get('nonWhiteFraction')}")

        # ---- Zoom to point ------------------------------------------------
        R["adjustPointsPostReload"] = open_adjust_points(driver)
        L(f"POST-RELOAD RMS: {R['adjustPointsPostReload'].get('rmsText')!r} "
          f"points={R['adjustPointsPostReload'].get('pointCount')}")
        driver.save_screenshot(f"{OUT}/07-adjust-points-post-reload.png")

        zoomed = driver.execute_script(r"""
          const b = document.querySelector('.gcp-zoom')
                 || document.querySelector('[aria-label^="Zoom to point"]');
          if (!b) { return { clicked: false }; }
          b.click();
          return { clicked: true, ariaLabel: b.getAttribute('aria-label'),
                   text: b.textContent.trim() };
        """)
        R["zoomToPointClick"] = zoomed
        L(f"Zoom to point: {zoomed}")
        time.sleep(4)
        R["renderPanelOpenAfterZoom"] = driver.execute_script(PROBE_RENDER)
        driver.save_screenshot(f"{OUT}/08-after-zoom-panel-open.png")

        close_panel(driver)
        time.sleep(5)
        R["renderPostReloadAfterZoom"] = driver.execute_script(PROBE_RENDER)
        driver.save_screenshot(f"{OUT}/09-post-reload-after-zoom.png")
        az = R["renderPostReloadAfterZoom"]
        L(f"POST-RELOAD/AFTER-ZOOM canvases={len(az['paneCanvases'])} "
          f"nonTransparent={[c.get('nonTransparentFraction') for c in az['paneCanvases']]} "
          f"zoom={az.get('mapZoom')} centre={az.get('mapCenter')}")

        R["verdict"] = verdict(R)
        L(f"VERDICT: {R['verdict']['classification']}")
        L(f"  {R['verdict']['reason']}")
    finally:
        try:
            R["finalBodyText"] = driver.find_element(By.TAG_NAME, "body").text[:2000]
        except Exception:
            pass
    return R, driver


def open_adjust_points(driver):
    """Open the georeference panel and read the RMS line and point rows."""
    opened = driver.execute_script(r"""
      const bs = Array.from(document.querySelectorAll('.user-map-georeference'));
      const b = bs.find(x => /adjust points|georeference/i.test(x.textContent));
      if (!b) { return { opened: false,
                         available: bs.map(x => x.textContent.trim()) }; }
      b.click();
      return { opened: true, buttonText: b.textContent.trim(),
               ariaLabel: b.getAttribute('aria-label') };
    """)
    time.sleep(3)
    detail = driver.execute_script(r"""
      const panel = document.querySelector('.georeference-panel');
      const status = document.querySelector('.georeference-status');
      const bar = document.querySelector('.georeference-map-bar-status');
      const rows = Array.from(document.querySelectorAll('table.gcp-list tr.gcp-row'));
      return {
        panelPresent: !!panel,
        rmsText: status ? status.textContent.trim() : null,
        mapBarStatusText: bar ? bar.textContent.trim() : null,
        pointCount: rows.length,
        points: rows.map(r => {
          const td = Array.from(r.querySelectorAll('td')).map(c => c.textContent.trim());
          return { index: td[0], scanPixel: td[1], map: td[2], offBy: td[3] };
        }),
        zoomButtons: Array.from(document.querySelectorAll('.gcp-zoom'))
                       .map(b => b.getAttribute('aria-label')),
      };
    """)
    opened.update(detail)
    return opened


def close_panel(driver):
    driver.execute_script(r"""
      const d = document.querySelector('.georeference-done');
      if (d) { d.click(); return; }
      const b = Array.from(document.querySelectorAll('button'))
                 .find(x => x.textContent.trim() === 'Done');
      if (b) { b.click(); }
    """)
    time.sleep(2)


def verdict(R):
    """Classify into the three outcomes. Only two of them are bugs."""
    idb = R.get("idbPostReload", {}) or {}
    recon = idb.get("reconstruction", {}) or {}
    previews = [v for v in recon.values()]
    before = R.get("renderPostReloadBeforeZoom", {}) or {}
    after = R.get("renderPostReloadAfterZoom", {}) or {}

    def canvas_state(probe):
        """Collapse the pane canvases to one measured state. 'unsized' (no
        backing allocated because the drape misses the viewport), 'sized-but-
        blank', 'painted', 'measurement-failed' and 'no-canvas' are all
        distinct. A failed measurement must never score as a blank paint."""
        cs = probe.get("paneCanvases") or []
        if not cs:
            return "no-canvas", None
        if any(c.get("measuredState") == "measurement-failed" for c in cs):
            return "measurement-failed", None
        frac = max([c.get("nonTransparentFraction") or 0
                    for c in cs if c.get("nonTransparentFraction") is not None],
                   default=None)
        if any(c.get("measuredState") == "painted" for c in cs):
            return "painted", frac
        if all(c.get("measuredState") == "unsized-no-backing-allocated" for c in cs):
            return "unsized", None
        return "sized-but-blank", frac

    s_before, f_before = canvas_state(before)
    s_after, f_after = canvas_state(after)
    v_states = {"canvasStateBeforeZoom": s_before, "canvasStateAfterZoom": s_after}
    settle = R.get("postReloadSettleSeries") or []
    v_states["settleStates"] = [e.get("states") for e in settle]
    v_states["decodeLatencyExcluded"] = bool(settle) and all(
        st == ["unsized-no-backing-allocated"] for st in v_states["settleStates"])
    bytes_ok = any((p.get("byteLength") or 0) > 0
                   and (p.get("nonTransparentFraction") or 0) > 0.01
                   for p in previews)
    record_ok = (idb.get("recordCount") or 0) > 0

    v = {
        "recordPersisted": record_ok,
        "previewBytesPresentAndDecodable": bytes_ok,
        "previewByteLengths": {k: v.get("byteLength") for k, v in recon.items()},
        "previewNonTransparentFraction": {
            k: v.get("nonTransparentFraction") for k, v in recon.items()},
        "liveCanvasFractionBeforeZoom": f_before,
        "liveCanvasFractionAfterZoom": f_after,
        "canvasCountBeforeZoom": len(before.get("paneCanvases") or []),
        "canvasCountAfterZoom": len(after.get("paneCanvases") or []),
    }
    v.update(v_states)
    BLANK = 0.005
    if s_before == "measurement-failed" or s_after == "measurement-failed":
        v["classification"] = "MEASUREMENT_FAILED"
        v["reason"] = ("A canvas readback errored on a sized canvas. No "
                       "classification is made from a failed measurement.")
    elif not record_ok:
        v["classification"] = "RECORD_NOT_PERSISTED"
        v["reason"] = "No record survived reload; this is not the stop-rule-1 question."
    elif not bytes_ok:
        v["classification"] = "LOST_BYTES"
        v["reason"] = ("The persisted preview blob is missing, empty, or decodes "
                       "to a fully transparent image, so nothing could be drawn. "
                       "Data-loss defect.")
    elif s_before == "painted":
        v["classification"] = "RENDERS_IMMEDIATELY_AFTER_RELOAD"
        v["reason"] = ("The raster repainted after reload without needing the "
                       "Zoom-to-point move.")
    elif s_after == "painted" and s_before in ("unsized", "sized-but-blank", "no-canvas"):
        v["classification"] = "PERSISTED_BUT_OFFSCREEN"
        v["reason"] = (
            "Bytes intact and decodable; the record, frame choice and provenance "
            "all persisted. Before the move the layer canvas was "
            f"'{s_before}' — for 'unsized' this is the single branch in "
            "WarpedRasterLayer.redraw() where computeBackingRect returns null "
            "because the padded viewport does not intersect the drape, which "
            "sets canvas width/height to 0. Zoom to point moved the viewport "
            "onto the drape and it repainted. NOT a render defect and NOT lost "
            "bytes: the viewport is simply not restored across reload.")
    else:
        v["classification"] = "BLANK_RENDER_DEFECT"
        v["reason"] = ("Bytes intact and decodable and the viewport was moved to "
                       "a persisted GCP, yet the layer canvas still paints "
                       "nothing. Genuine post-reload render defect.")
    return v


if __name__ == "__main__":
    result, drv = (None, None)
    try:
        result, drv = main()
    finally:
        if result is not None:
            result["log"] = log
            with open(f"{OUT}/stop-rule-1-result.json", "w") as f:
                json.dump(result, f, indent=2, default=str)
            print("WROTE", f"{OUT}/stop-rule-1-result.json")
        if drv is not None:
            drv.quit()
