#!/usr/bin/env python3
"""Bounded Safari session-creation probe against an already-running safaridriver.

Read-only. Creates a session, records Safari version, checks that the
automation window is clean-state (IndexedDB empty), probes the Long Tasks API,
then quits. Nothing is imported.
"""
import json
import sys
import time
import urllib.request

BASE = "http://127.0.0.1:4444"
ORIGIN = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:4340"
TIMEOUT = float(sys.argv[2]) if len(sys.argv) > 2 else 60.0

out = {"origin": ORIGIN, "base": BASE, "startedAt": time.strftime("%Y-%m-%dT%H:%M:%S%z")}


def req(method, path, body=None, timeout=TIMEOUT):
    data = json.dumps(body).encode() if body is not None else None
    r = urllib.request.Request(BASE + path, data=data, method=method,
                               headers={"Content-Type": "application/json"})
    t0 = time.time()
    try:
        with urllib.request.urlopen(r, timeout=timeout) as resp:
            return resp.status, json.loads(resp.read().decode()), time.time() - t0
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()[:2000], time.time() - t0
    except Exception as e:  # noqa: BLE001
        return None, f"{type(e).__name__}: {e}", time.time() - t0


st, body, dt = req("GET", "/status")
out["status"] = {"http": st, "body": body, "seconds": round(dt, 3)}
print("status:", st, body, f"{dt:.2f}s", flush=True)

caps = {"capabilities": {"alwaysMatch": {"browserName": "safari"}}}
st, body, dt = req("POST", "/session", caps)
out["sessionCreate"] = {"http": st, "seconds": round(dt, 3)}
print("session create:", st, f"{dt:.2f}s", flush=True)
if st != 200:
    out["sessionCreate"]["body"] = body
    out["verdict"] = "SESSION_CREATE_FAILED"
    print("FAILED:", str(body)[:800], flush=True)
    print(json.dumps(out, indent=2))
    sys.exit(1)

sid = body["value"]["sessionId"]
out["sessionId"] = sid
out["capabilities"] = body["value"]["capabilities"]
print("sessionId:", sid, flush=True)
print("caps:", json.dumps(body["value"]["capabilities"], indent=2), flush=True)

try:
    st, b, dt = req("POST", f"/session/{sid}/url", {"url": ORIGIN})
    out["navigate"] = {"http": st, "seconds": round(dt, 3)}
    print("navigate:", st, f"{dt:.2f}s", flush=True)

    probe = r"""
    var cb = arguments[arguments.length - 1];
    (async function () {
      var res = {
        href: location.href,
        ua: navigator.userAgent,
        dpr: window.devicePixelRatio,
        innerWidth: window.innerWidth,
        innerHeight: window.innerHeight,
        supportedEntryTypes: (window.PerformanceObserver && PerformanceObserver.supportedEntryTypes)
          ? Array.prototype.slice.call(PerformanceObserver.supportedEntryTypes) : null,
        longTaskApiSupported: !!(window.PerformanceObserver &&
          PerformanceObserver.supportedEntryTypes &&
          PerformanceObserver.supportedEntryTypes.indexOf('longtask') !== -1),
        indexedDBAvailable: typeof indexedDB !== 'undefined',
        databases: null,
        userMapRecordCount: null,
        localStorageKeys: null,
        cookieCount: (document.cookie || '').split(';').filter(function (s) { return s.trim(); }).length
      };
      try { res.localStorageKeys = Object.keys(localStorage); } catch (e) { res.localStorageKeys = 'ERR:' + e; }
      try {
        if (indexedDB.databases) {
          var dbs = await indexedDB.databases();
          res.databases = dbs.map(function (d) { return { name: d.name, version: d.version }; });
        }
      } catch (e) { res.databases = 'ERR:' + e; }
      try {
        var open = indexedDB.open('ns-marks-the-spot-user-maps');
        res.userMapRecordCount = await new Promise(function (resolve) {
          open.onerror = function () { resolve('open-error'); };
          open.onsuccess = function () {
            var db = open.result;
            if (!db.objectStoreNames.contains('records')) { db.close(); resolve('no-records-store:' +
              Array.prototype.slice.call(db.objectStoreNames).join(',')); return; }
            var tx = db.transaction('records', 'readonly');
            var rq = tx.objectStore('records').count();
            rq.onsuccess = function () { db.close(); resolve(rq.result); };
            rq.onerror = function () { db.close(); resolve('count-error'); };
          };
          setTimeout(function () { resolve('timeout'); }, 8000);
        });
      } catch (e) { res.userMapRecordCount = 'ERR:' + e; }
      cb(res);
    })();
    """
    st, b, dt = req("POST", f"/session/{sid}/execute/async", {"script": probe, "args": []})
    out["pageProbe"] = {"http": st, "seconds": round(dt, 3), "value": b.get("value") if isinstance(b, dict) else b}
    print("page probe:", st, f"{dt:.2f}s", flush=True)
    print(json.dumps(out["pageProbe"]["value"], indent=2), flush=True)

    st, b, dt = req("GET", f"/session/{sid}/title")
    out["title"] = b.get("value") if isinstance(b, dict) else b
    print("title:", out["title"], flush=True)
    out["verdict"] = "SESSION_OK"
finally:
    st, b, dt = req("DELETE", f"/session/{sid}")
    out["sessionDelete"] = {"http": st, "seconds": round(dt, 3)}
    print("session delete:", st, flush=True)

with open("/Users/dfakkeldy/Developer/_geopdf-acceptance-tmp/sf-probe-result.json", "w") as f:
    json.dump(out, f, indent=2)
print("WROTE sf-probe-result.json", flush=True)
