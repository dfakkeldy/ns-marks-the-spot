"""Check for a cleared turbine pad at each tabulated position in Sentinel-2 imagery.

Usage, from web/ (needs GDAL's Python bindings; reads public COGs over HTTP):
  python3 -I scripts/wind/pad_check.py 2026-07-01/2026-10-24 2022-06-01/2022-09-30 \
    scripts/wind/raw/*.geojson > scripts/wind/pad-check.txt
The first range is the "now" window, the second a pre-construction baseline.
For each position it takes the latest scene in the window whose scene
classification (SCL) is clear within 60 m, counts bare pixels (NDVI below 0.25)
within 30 m in the 10 m red and near-infrared bands, and reports the nearest
bare 30 m disk within 300 m, so a moved turbine shows as an offset. A turbine
pad (about 50 x 60 m of gravel) fills most of the 29-pixel disk; forest leaves
it empty, and a fall in mean NDVI since the baseline flags smaller earthworks
(or forestry). Thin cloud can pass the SCL test and read as vegetation loss,
so every flag is checked by eye before it is used (site-review.txt). The imagery is a check on build status only: no position is taken
from it. Contains modified Copernicus Sentinel data, via Earth Search (Element 84).
"""
import json, sys, urllib.request
import numpy as np
from osgeo import gdal, osr

gdal.UseExceptions()
gdal.SetConfigOption("GDAL_DISABLE_READDIR_ON_OPEN", "EMPTY_DIR")
gdal.SetConfigOption("GDAL_HTTP_MAX_RETRY", "4")
STAC = "https://earth-search.aws.element84.com/v1/search"
BARE_NDVI, PAD, PARTIAL, DROP, SEARCH_M = 0.25, 15, 5, 0.3, 300
CLOUDY = {0, 1, 3, 8, 9, 10, 11}  # no data, saturated, cloud shadow, cloud, cirrus, snow
WGS = osr.SpatialReference(); WGS.ImportFromEPSG(4326); WGS.SetAxisMappingStrategy(osr.OAMS_TRADITIONAL_GIS_ORDER)
YY, XX = np.mgrid[-3:4, -3:4]
DISK = (XX ** 2 + YY ** 2) <= 9  # 29 pixels within 30 m


def search(bbox, window):
    start, end = window.split("/")
    body = {"collections": ["sentinel-2-l2a"], "bbox": bbox, "datetime": f"{start}T00:00:00Z/{end}T23:59:59Z",
            "limit": 200, "query": {"eo:cloud_cover": {"lt": 60}}, "sortby": [{"field": "properties.datetime", "direction": "desc"}]}
    req = urllib.request.Request(STAC, json.dumps(body).encode(), {"Content-Type": "application/json"})
    return json.load(urllib.request.urlopen(req, timeout=120))["features"]


def inside(lon, lat, geometry):
    polys = geometry["coordinates"] if geometry["type"] == "MultiPolygon" else [geometry["coordinates"]]
    for poly in polys:
        ring, hit = poly[0], False
        for (x1, y1), (x2, y2) in zip(ring, ring[1:]):
            if (y1 > lat) != (y2 > lat) and lon < x1 + (lat - y1) * (x2 - x1) / (y2 - y1):
                hit = not hit
        if hit:
            return True
    return False


class Scene:
    """One item's red, NIR and SCL rasters, read once over a project window."""
    def __init__(self, item, points):
        self.item = item
        red = gdal.Open("/vsicurl/" + item["assets"]["red"]["href"])
        srs = osr.SpatialReference(wkt=red.GetProjection()); srs.SetAxisMappingStrategy(osr.OAMS_TRADITIONAL_GIS_ORDER)
        to_utm = osr.CoordinateTransformation(WGS, srs)
        gt = red.GetGeoTransform()
        self.px = {p["id"]: (int((x - gt[0]) / 10), int((gt[3] - y) / 10)) for p in points
                   for x, y, _ in [to_utm.TransformPoint(p["lon"], p["lat"])]}
        cols = [c for c, _ in self.px.values()]; rows = [r for _, r in self.px.values()]
        pad = SEARCH_M // 10 + 4
        self.c0, self.r0 = max(min(cols) - pad, 0), max(min(rows) - pad, 0)
        w = min(max(cols) + pad, red.RasterXSize - 1) - self.c0 + 1
        h = min(max(rows) + pad, red.RasterYSize - 1) - self.r0 + 1
        r = red.ReadAsArray(self.c0, self.r0, w, h).astype(float)
        n = gdal.Open("/vsicurl/" + item["assets"]["nir"]["href"]).ReadAsArray(self.c0, self.r0, w, h).astype(float)
        props = item["properties"]
        if not props.get("earthsearch:boa_offset_applied", True) and props.get("s2:processing_baseline", "00") >= "04.00":
            r, n = np.clip(r - 1000, 0, None), np.clip(n - 1000, 0, None)
        valid = (r > 0) & (n > 0)
        self.ndvi = np.where(valid, (n - r) / np.maximum(n + r, 1), np.nan)
        self.bare = valid & (self.ndvi < BARE_NDVI)
        scl = gdal.Open("/vsicurl/" + item["assets"]["scl"]["href"])
        sc0, sr0 = self.c0 // 2, self.r0 // 2
        s = scl.ReadAsArray(sc0, sr0, min(w // 2 + 2, scl.RasterXSize - sc0), min(h // 2 + 2, scl.RasterYSize - sr0))
        self.scl = np.kron(s, np.ones((2, 2), dtype=s.dtype))[self.r0 % 2:self.r0 % 2 + h, self.c0 % 2:self.c0 % 2 + w]
        # Bare pixels within 30 m of every pixel (a disk sum), for the offset search.
        padded = np.pad(self.bare.astype(int), 3)
        self.disk = sum(padded[3 + dy:3 + dy + h, 3 + dx:3 + dx + w] for dy, dx in zip(YY[DISK], XX[DISK]))

    def clear(self, pid):
        c, r = self.px[pid][0] - self.c0, self.px[pid][1] - self.r0
        win = self.scl[max(r - 6, 0):r + 7, max(c - 6, 0):c + 7]
        return win.size > 0 and not np.isin(win, list(CLOUDY)).any()

    def mean_ndvi(self, pid):
        c, r = self.px[pid][0] - self.c0, self.px[pid][1] - self.r0
        return float(np.nanmean(self.ndvi[r - 3:r + 4, c - 3:c + 4][DISK]))

    def measure(self, pid):
        c, r = self.px[pid][0] - self.c0, self.px[pid][1] - self.r0
        here = int(self.disk[r, c])
        k = SEARCH_M // 10
        sub = self.disk[max(r - k, 0):r + k + 1, max(c - k, 0):c + k + 1]
        ys, xs = np.nonzero(sub >= PAD)
        if len(ys) == 0:
            return here, None
        dist = np.hypot(ys + max(r - k, 0) - r, xs + max(c - k, 0) - c) * 10
        return here, int(dist.min())


def pick(points, items):
    """Latest clear scene per point; returns {point id: Scene} and the unclear ids."""
    chosen, cache, left = {}, {}, list(points)
    for item in items:
        here = [p for p in left if inside(p["lon"], p["lat"], item["geometry"])]
        if not here:
            continue
        scene = cache.setdefault(item["id"], Scene(item, here))
        for p in here:
            if scene.clear(p["id"]):
                chosen[p["id"]] = scene
        left = [p for p in left if p["id"] not in chosen]
        if not left:
            break
    return chosen, [p["id"] for p in left]


def verdict(now, base, drop):
    if now >= PAD:
        return "new clearing" if base is not None and base < PARTIAL else "clearing (also in baseline)" if base is not None else "clearing"
    if drop is not None and drop >= DROP:
        return "vegetation loss"
    return "partial" if now >= PARTIAL else "none"


now_window, base_window, *paths = sys.argv[1:]
projects = {}
for path in paths:
    for f in json.load(open(path, encoding="utf-8"))["features"]:
        p = f["properties"]
        lon, lat = f["geometry"]["coordinates"][:2]
        projects.setdefault(p["project"], []).append({"id": p["id"], "turbine": p.get("turbine"), "role": p.get("layout_role") or "assessed", "lon": lon, "lat": lat})

print(f"Sentinel-2 pad check: now {now_window}, baseline {base_window}")
print(f"bare = NDVI < {BARE_NDVI}; counts are bare pixels of the 29 within 30 m; clearing >= {PAD}, partial {PARTIAL}-{PAD - 1};")
print(f"'ndvi' is the mean NDVI within 30 m and 'drop' its fall from the baseline; a drop of {DROP} or more without a pad")
print("reads 'vegetation loss' (earthworks or a forestry cut: look before calling it construction).")
print(f"'nearest' is the distance to the nearest 30 m disk with >= {PAD} bare pixels within {SEARCH_M} m.")
for name, points in sorted(projects.items()):
    lons = [p["lon"] for p in points]; lats = [p["lat"] for p in points]
    bbox = [min(lons) - 0.01, min(lats) - 0.01, max(lons) + 0.01, max(lats) + 0.01]
    now, unclear = pick(points, search(bbox, now_window))
    base, base_unclear = pick(points, search(bbox, base_window))
    counts = {}
    rows = []
    for p in points:
        if p["id"] not in now:
            rows.append(f"  {p['id']:<32} no clear scene"); counts["no clear scene"] = counts.get("no clear scene", 0) + 1; continue
        here, nearest = now[p["id"]].measure(p["id"])
        b = base[p["id"]].measure(p["id"])[0] if p["id"] in base else None
        ndvi_now = now[p["id"]].mean_ndvi(p["id"])
        drop = base[p["id"]].mean_ndvi(p["id"]) - ndvi_now if p["id"] in base else None
        v = verdict(here, b, drop)
        counts[v] = counts.get(v, 0) + 1
        role = "" if p["role"] in ("assessed", "primary", "modelled") else f" [{p['role']}]"
        rows.append(f"  {p['id']:<32} now {here:2d}  base {'-' if b is None else f'{b:2d}'}  ndvi {ndvi_now:.2f} drop {'-' if drop is None else f'{drop:+.2f}'}  "
                    f"nearest {'-' if nearest is None else f'{nearest} m':>6}  "
                    f"{now[p['id']].item['properties']['datetime'][:10]}  {v}{role}")
    scenes = sorted({s.item["id"] for s in now.values()}); bases = sorted({s.item["id"] for s in base.values()})
    print(f"\n{name} ({len(points)} positions): " + ", ".join(f"{k} {v}" for k, v in sorted(counts.items())))
    print(f"  now scenes: {', '.join(scenes) or '-'}")
    print(f"  baseline scenes: {', '.join(bases) or '-'}{' (no clear baseline for ' + str(len(base_unclear)) + ')' if base_unclear else ''}")
    print("\n".join(rows))
