"""Project simplified electoral geometries to SVG path strings.

Reads the GeoJSON fetched from the official services and writes paths.json:
  { "view": [w, h], "ed2026": [...], "results2024": [...], "fed2025": [...], "hrm2024": [...], "munpd": [...] }
Each entry: { id, name, d, cx, cy, area, props }.
Projection: equirectangular about lat 45.0 (cos scaling), fitted to the province box.
"""
import json, math, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
W, H = 1000, 640
LON0, LON1 = -66.45, -59.55
LAT0, LAT1 = 43.35, 47.10
COS = math.cos(math.radians(45.2))


def fit():
    sx = W / ((LON1 - LON0) * COS)
    sy = H / (LAT1 - LAT0)
    s = min(sx, sy)
    ox = (W - (LON1 - LON0) * COS * s) / 2
    oy = (H - (LAT1 - LAT0) * s) / 2
    return s, ox, oy


S, OX, OY = fit()


def proj(lon, lat):
    x = OX + (lon - LON0) * COS * S
    y = OY + (LAT1 - lat) * S
    return x, y


def ring_area(pts):
    a = 0.0
    for i in range(len(pts)):
        x1, y1 = pts[i]
        x2, y2 = pts[(i + 1) % len(pts)]
        a += x1 * y2 - x2 * y1
    return a / 2


def ring_centroid(pts):
    a = ring_area(pts)
    if abs(a) < 1e-9:
        xs = [p[0] for p in pts]; ys = [p[1] for p in pts]
        return sum(xs) / len(xs), sum(ys) / len(ys)
    cx = cy = 0.0
    for i in range(len(pts)):
        x1, y1 = pts[i]
        x2, y2 = pts[(i + 1) % len(pts)]
        f = x1 * y2 - x2 * y1
        cx += (x1 + x2) * f
        cy += (y1 + y2) * f
    return cx / (6 * a), cy / (6 * a)


def dedupe(pts, tol=0.35):
    out = []
    for p in pts:
        if not out or (abs(p[0] - out[-1][0]) > tol or abs(p[1] - out[-1][1]) > tol):
            out.append(p)
    return out


def geom_to_path(geom, min_ring_pts=4, tol=0.35):
    if not geom:
        return None
    polys = []
    if geom["type"] == "Polygon":
        polys = [geom["coordinates"]]
    elif geom["type"] == "MultiPolygon":
        polys = geom["coordinates"]
    parts = []
    best = None
    total_area = 0.0
    for poly in polys:
        for ri, ring in enumerate(poly):
            pts = dedupe([proj(x, y) for x, y in ring], tol)
            if len(pts) < min_ring_pts:
                continue
            a = abs(ring_area(pts))
            if ri == 0:
                total_area += a
                if best is None or a > best[0]:
                    best = (a, pts)
            d = "M" + " ".join(f"{x:.1f},{y:.1f}" for x, y in pts) + "Z"
            parts.append(d)
    if best is None:
        return None
    cx, cy = ring_centroid(best[1])
    return {"d": "".join(parts), "cx": round(cx, 1), "cy": round(cy, 1), "area": round(total_area, 1)}


def load_fc(name):
    with open(os.path.join(HERE, name)) as f:
        return json.load(f)


out = {"view": [W, H]}

ed = load_fc("ed2026.geojson")
out["ed2026"] = []
for f in ed["features"]:
    p = f["properties"]
    g = geom_to_path(f["geometry"])
    if g:
        out["ed2026"].append({"id": p["ED_NO"], "name": p["ED_NAME"].strip(), "electors": p.get("electorcount"), **g})

res = load_fc("results2024.geojson")
out["results2024"] = []
for f in res["features"]:
    p = f["properties"]
    g = geom_to_path(f["geometry"], tol=0.6)
    if g:
        votes = {
            "PC": p.get("PC_Votes") or 0,
            "Liberal": p.get("Liberal_Votes") or 0,
            "NDP": p.get("NDP_Votes") or 0,
            "Green": p.get("Green_Votes") or 0,
            "Independent": p.get("Independent_Votes") or 0,
        }
        ranked = sorted(votes.items(), key=lambda kv: -kv[1])
        winner, second = ranked[0], ranked[1]
        total = p.get("Total") or sum(votes.values())
        out["results2024"].append({
            "id": p["ED_NO"], "name": p["ED_NAME"].strip(), "mla": (p.get("MLA") or "").strip(),
            "party": p.get("PARTY"), "winner": winner[0], "second": second[0],
            "margin_pct": round(100 * (winner[1] - second[1]) / total, 1) if total else None,
            "winner_share": round(100 * winner[1] / total, 1) if total else None,
            "turnout": round(p.get("PctVoterTurnout") or 0, 1), "total": total,
            "votes": votes, "rejected": p.get("Rejected"), "declined": p.get("Declined"), **g})

fed = load_fc("fed2025.geojson")
out["fed2025"] = []
for f in fed["features"]:
    p = f["properties"]
    g = geom_to_path(f["geometry"])
    if g:
        out["fed2025"].append({"id": str(p["FED_NUM"]), "name": p["ED_NAMEE"], **g})

hrm = load_fc("hrm2024.geojson")
out["hrm2024"] = []
for f in hrm["features"]:
    p = f["properties"]
    g = geom_to_path(f["geometry"])
    if g:
        out["hrm2024"].append({"id": str(p["DIST_ID"]), "name": (p["DISTNAME"] or "").strip(), **g})

mun_path = os.path.join(HERE, "munpd.json")
out["munpd"] = []
if os.path.exists(mun_path):
    try:
        rows = json.load(open(mun_path))
        if isinstance(rows, list):
            for r in rows:
                if not r.get("g"):
                    continue
                g = geom_to_path(r["g"], tol=0.5)
                if g:
                    out["munpd"].append({"id": f"{r.get('mu_code')}-{r.get('poll_dist')}", "name": f"{r.get('mun')} · {r.get('poll_dist')}", **g})
    except Exception as e:  # noqa: BLE001
        print("munpd skipped:", e, file=sys.stderr)

with open(os.path.join(HERE, "paths.json"), "w") as f:
    json.dump(out, f)

for k in ("ed2026", "results2024", "fed2025", "hrm2024", "munpd"):
    n = len(out[k]); size = sum(len(e["d"]) for e in out[k])
    print(f"{k}: {n} features, {size/1024:.1f} KB of path data")
print("extent check ed2026:", min(e["cx"] for e in out["ed2026"]), max(e["cx"] for e in out["ed2026"]), min(e["cy"] for e in out["ed2026"]), max(e["cy"] for e in out["ed2026"]))
