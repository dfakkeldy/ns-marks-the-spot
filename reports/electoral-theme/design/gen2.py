"""Round-two artboards: results over time, swing, poll-level maps, census theme, representatives, data notes.

Imports the helpers and tokens from gen.py and writes additional .dc.html files plus the full canvas.json (pages).
All figures come from the files under ../geo written from official sources on 2026-09-12.
"""
import json, math, os
import gen as g
from gen import esc, DAY, UI, DISPLAY, MONO, helmet, dc, token_style, caption, category_heading, layer_row, group_heading, pill, legend, collapsed_categories, LOCATE_ICON, RULER_ICON, AREA_ICON, SEARCH_ICON

HERE = g.HERE
GEODIR = os.path.join(HERE, "..", "geo")


def load(name):
    return json.load(open(os.path.join(GEODIR, name)))


EXTRA_VARS = ("--ink1: #e9eeee; --ink2: #c4cfd0; --ink3: #8fa2a5; --ink4: #587074; --ink5: #12343b; "
              "--grow1: #d6e4f7; --grow2: #8fb4e8; --grow3: #1e66cc; --fall1: #f7e3cf; --fall2: #e7a86b; --fall3: #b8742c; "
              "--band: #dfe2de; --mute: #eceeea; --hatch: #9aa4a6")


def root_style():
    return token_style(DAY) + "; " + EXTRA_VARS


# ---------------------------------------------------------------- local projections
class LocalProj:
    def __init__(self, lon0, lat0, lon1, lat1, w, h, pad=0.02):
        dlon = (lon1 - lon0) * pad; dlat = (lat1 - lat0) * pad
        self.lon0, self.lat0, self.lon1, self.lat1 = lon0 - dlon, lat0 - dlat, lon1 + dlon, lat1 + dlat
        self.cos = math.cos(math.radians((lat0 + lat1) / 2))
        sx = w / ((self.lon1 - self.lon0) * self.cos); sy = h / (self.lat1 - self.lat0)
        self.s = min(sx, sy)
        self.ox = (w - (self.lon1 - self.lon0) * self.cos * self.s) / 2
        self.oy = (h - (self.lat1 - self.lat0) * self.s) / 2
        self.w, self.h = w, h

    def __call__(self, lon, lat):
        return self.ox + (lon - self.lon0) * self.cos * self.s, self.oy + (self.lat1 - lat) * self.s


def rings_of(geom):
    if not geom:
        return []
    if geom["type"] == "Polygon":
        return [(geom["coordinates"][0], True)] + [(r, False) for r in geom["coordinates"][1:]]
    out = []
    for poly in geom["coordinates"]:
        out.append((poly[0], True)); out += [(r, False) for r in poly[1:]]
    return out


def path_for(geom, proj, tol=0.6):
    parts = []; best = None
    for ring, outer in rings_of(geom):
        pts = []
        for lon, lat in ring:
            x, y = proj(lon, lat)
            if not pts or abs(x - pts[-1][0]) > tol or abs(y - pts[-1][1]) > tol:
                pts.append((x, y))
        if len(pts) < 4:
            continue
        parts.append("M" + " ".join(f"{x:.1f},{y:.1f}" for x, y in pts) + "Z")
        if outer:
            a = abs(sum(pts[i][0] * pts[(i + 1) % len(pts)][1] - pts[(i + 1) % len(pts)][0] * pts[i][1] for i in range(len(pts))) / 2)
            if best is None or a > best[0]:
                cx = sum(p[0] for p in pts) / len(pts); cy = sum(p[1] for p in pts) / len(pts)
                best = (a, cx, cy)
    if not parts:
        return None
    return {"d": "".join(parts), "cx": round(best[1], 1), "cy": round(best[2], 1), "area": round(best[0], 1)}


def bbox_of(features):
    xs = []; ys = []
    for f in features:
        for ring, _ in rings_of(f["geometry"]):
            for lon, lat in ring:
                xs.append(lon); ys.append(lat)
    return min(xs), min(ys), max(xs), max(ys)


HATCH = ('<defs><pattern id="hatch" patternUnits="userSpaceOnUse" width="6" height="6" patternTransform="rotate(45)">'
         '<line x1="0" y1="0" x2="0" y2="6" style="stroke: var(--hatch); stroke-width: 1.2"></line></pattern>'
         '<pattern id="dots" patternUnits="userSpaceOnUse" width="5" height="5"><circle cx="2.5" cy="2.5" r="0.8" style="fill: var(--hatch)"></circle></pattern></defs>')

PARTY_TOK = {"PC": "pc", "Liberal": "lib", "NDP": "ndp", "Green": "grn", "Independent": "ind", "Conservative": "pc", "Other": "ind"}


def swatch(tok, opacity=1.0, w=12, h=10):
    return f'<span style="display: inline-block; width: {w}px; height: {h}px; background: var(--{tok}); opacity: {opacity}; border: 1px solid rgba(0,0,0,0.35); border-radius: 2px"></span>'


def legend_row(items, extra_style=""):
    return ('<div style="display: flex; flex-wrap: wrap; gap: 6px 12px; font-size: 11px; color: var(--ink); ' + extra_style + '">'
            + "".join(f'<span style="display: inline-flex; gap: 5px; align-items: center">{sw}{esc(label)}</span>' for sw, label in items) + '</div>')


def eyebrow(text, color="var(--deep)"):
    return f'<p style="margin: 0 0 4px; color: {color}; font-family: {MONO}; font-size: 11.2px; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase">{esc(text)}</p>'


def source_line(text):
    return f'<p style="margin: 8px 0 0; color: var(--muted); font-size: 10.5px; line-height: 1.4">{text}</p>'


def dl_row(k, v, mono_value=True, note=False):
    vs = f'font-family: {MONO}; text-align: right' if mono_value else f'font-family: {UI}; text-align: left; max-width: 60%'
    color = "color: var(--muted); " if note else ""
    return (f'<div style="display: flex; justify-content: space-between; gap: 18px; padding: 5px 0; font-family: {MONO}; font-size: 12.8px; {color}">'
            f'<dt>{k}</dt><dd style="margin: 0; {vs}">{v}</dd></div>')


# ================================================================ 1. Results over time (small multiples)
def build_results_over_time():
    H = load("paths_history.json"); S = load("history_summary.json")
    years = ["2003", "2006", "2009", "2013", "2017", "2021", "2024"]
    turnout = {str(y["year"]): y["turnout_pct"] for y in S["years"]}
    shares = {str(y["year"]): y.get("vote_share_pct") or y.get("valid_vote_share_pct") or y.get("province_vote_share") for y in S["years"]}
    tiles = []
    for y in years:
        feats = H["years"][y]; seats = H["seats"][y]
        total_seats = sum(seats.values())
        paths = "".join(f'<path d="{f["d"]}" style="fill: var(--{PARTY_TOK.get(f["winner"], "ind")})"><title>{esc(f["name"])} · {esc(f["winner"])}</title></path>' for f in feats)
        outline = "".join(f'<path d="{f["d"]}"></path>' for f in feats)
        svg = (f'<svg viewBox="0 0 1000 640" width="176" height="113" style="display: block; background: var(--water); border-radius: 4px">'
               f'<g style="fill: var(--land); stroke: none">{outline}</g><g opacity="0.62" style="stroke: none">{paths}</g>'
               f'<g style="fill: none; stroke: var(--mapink); stroke-width: 1.1; stroke-linejoin: round; opacity: 0.8">{outline}</g></svg>')
        # seat bar: stacked, 2px surface gaps, thin
        order = [("PC", "pc"), ("Liberal", "lib"), ("NDP", "ndp"), ("Independent", "ind"), ("Other", "ind")]
        segs = "".join(f'<span title="{p} {seats.get(p,0)}" style="display: block; width: {100*seats.get(p,0)/total_seats:.1f}%; height: 10px; background: var(--{tok}); border-radius: {"4px 0 0 4px" if i==0 else "0"}"></span>'
                       for i, (p, tok) in enumerate(order) if seats.get(p, 0))
        top = max(seats.items(), key=lambda kv: kv[1])
        tiles.append(
            f'<div style="display: grid; gap: 6px; width: 176px">'
            f'<div style="display: flex; justify-content: space-between; align-items: baseline"><strong style="font-family: {DISPLAY}; font-size: 20px">{y}</strong>'
            f'<span style="font-family: {MONO}; font-size: 11px; color: var(--muted)">turnout {turnout.get(y, "–")}%</span></div>'
            f'{svg}'
            f'<span style="display: flex; gap: 2px; background: var(--surface)">{segs}</span>'
            f'<span style="font-size: 11.5px; line-height: 1.35"><strong>{esc(top[0])} {top[1]}</strong> of {total_seats} seats' + "".join(f' · {esc(p)} {n}' for p, n in sorted(seats.items(), key=lambda kv: -kv[1])[1:] if n) + '</span></div>')
    # turnout sparkline 2003..2024
    xs = [0, 1, 2, 3, 4, 5, 6]; vals = [turnout[y] for y in years]
    lo, hi = 40, 70
    def px(i): return 24 + i * 60
    def py(v): return 8 + (hi - v) / (hi - lo) * 44
    pts = " ".join(f"{px(i):.1f},{py(v):.1f}" for i, v in zip(xs, vals))
    spark = (f'<svg viewBox="0 0 400 64" width="400" height="64" style="display: block">'
             f'<line x1="24" y1="{py(50):.1f}" x2="384" y2="{py(50):.1f}" style="stroke: var(--line); stroke-width: 1"></line>'
             f'<polyline points="{pts}" style="fill: none; stroke: var(--deep); stroke-width: 2; stroke-linejoin: round; stroke-linecap: round"></polyline>'
             + "".join(f'<circle cx="{px(i):.1f}" cy="{py(v):.1f}" r="4" style="fill: var(--deep); stroke: var(--surface); stroke-width: 2"></circle>' for i, v in zip(xs, vals))
             + f'<text x="{px(0):.1f}" y="{py(vals[0])+16:.1f}" style="font-family: {MONO}; font-size: 10px; fill: var(--ink)" text-anchor="middle">{vals[0]}%</text>'
             + f'<text x="{px(6):.1f}" y="{py(vals[6])+16:.1f}" style="font-family: {MONO}; font-size: 10px; fill: var(--ink)" text-anchor="middle">{vals[6]}%</text></svg>')
    body = (
        f'{helmet()}<article style="{root_style()}; width: 1440px; height: 560px; padding: 28px 32px; box-sizing: border-box; color: var(--ink); background: var(--surface); font-family: {UI}; font-size: 14px">'
        f'{eyebrow("Provincial general elections · 2003 to 2024 · one panel per election, each on its own boundaries")}'
        f'<h2 style="margin: 0 0 14px; font-family: {DISPLAY}; font-size: 26px; font-weight: 700">Who won where, seven times over</h2>'
        f'<div style="display: flex; gap: 18px; align-items: start">{"".join(tiles)}</div>'
        f'<div style="display: grid; grid-template-columns: 420px minmax(0, 1fr); gap: 32px; align-items: start; margin-top: 22px; padding-top: 16px; border-top: 1px solid var(--line)">'
        f'<div><strong style="font-size: 12.5px">Province-wide turnout</strong>{spark}<span style="font-size: 11px; color: var(--muted)">Historical_Voter_Turnout table · 65.8% in 2003 to 44.9% in 2024</span></div>'
        f'<div style="font-size: 12.5px; line-height: 1.5"><strong>How to read it.</strong> Each panel uses the district polygons of its own election (52 seats 2003–2009, 51 in 2013–2017, 55 since 2021), so the maps are not overlaid and no result is re-projected. '
        f'Party fills are the validated survey blue, survey red and amber; Cumberland North (Independent) is grey. A district selected on the live map would list its own line through these seven elections by point-in-polygon, with no crosswalk between boundary sets.'
        f'{source_line("Elections Nova Scotia general election results 2003–2024 via GeoNOVA BND_GeneralElectionResults_UT83 (layers 1–7 and table 0), fetched September 12, 2026. 2003 minor-party columns are unreliable and are not drawn; 2006 Queens has a missing Liberal count.")}</div></div></article>')
    return dc(body)


# ================================================================ 2. Swing 2021 -> 2024
def build_swing():
    SW = load("swing_2021_2024.json")["districts"]
    by_name = {d["name"]: d for d in SW}
    def cls(delta):
        return "seq1" if delta < 5 else "seq2" if delta < 10 else "seq3" if delta < 20 else "seq4" if delta < 30 else "seq5"
    fills = []; changed = []
    for r in g.GEO["results2024"]:
        d = by_name.get(r["name"])
        if not d:
            continue
        fills.append(f'<path d="{r["d"]}" style="fill: var(--{cls(d["delta_pc_points"])})"><title>{esc(r["name"])} · PC {d["pc_share_2021"]}% → {d["pc_share_2024"]}% (+{d["delta_pc_points"]} pts)</title></path>')
        if d["changed_hands"]:
            changed.append(f'<path d="{r["d"]}" style="fill: none; stroke: var(--{PARTY_TOK[d["winner_2024"]]}); stroke-width: 2.4; stroke-linejoin: round"></path>')
    outline = "".join(f'<path d="{r["d"]}"></path>' for r in g.GEO["results2024"])
    svg = (f'<svg viewBox="0 0 1000 640" width="640" height="410" style="display: block; background: var(--water)">'
           f'<g style="fill: var(--land); stroke: none">{outline}</g><g opacity="0.9" style="stroke: none">{"".join(fills)}</g>'
           f'<g style="fill: none; stroke: var(--mapink); stroke-width: 1.05; stroke-linejoin: round; opacity: 0.7">{outline}</g>{"".join(changed)}</svg>')
    ramp = "".join(f'<span style="width: 26px; height: 10px; background: var(--seq{i})"></span>' for i in range(1, 6))
    n_changed = sum(1 for d in SW if d["changed_hands"])
    overlay = (f'<div style="position: absolute; top: 10px; left: 12px; display: grid; gap: 6px; padding: 8px 10px; background: rgba(255, 255, 255, 0.92); border: 1px solid var(--line); border-radius: 6px; font-size: 11px; color: var(--ink)">'
               f'<strong style="font-family: {MONO}; font-size: 10.5px; letter-spacing: 0.04em; text-transform: uppercase; color: var(--deep)">PC share change, 2021 → 2024</strong>'
               f'<div style="display: flex; gap: 2px; border: 1px solid rgba(0,0,0,0.25); border-radius: 2px; width: fit-content">{ramp}</div>'
               f'<div style="display: flex; justify-content: space-between; width: 138px; font-family: {MONO}; font-size: 9.5px; color: var(--muted)"><span>+0</span><span>+10</span><span>+20</span><span>+30</span></div>'
               f'<span style="display: inline-flex; gap: 6px; align-items: center"><span style="width: 14px; height: 10px; border: 2px solid var(--pc); border-radius: 2px"></span>changed hands ({n_changed}); outline = new party</span></div>')
    cap = caption("Swing map", "Every one of the 55 districts moved toward the PC vote in 2024, so this is a one-hue ramp rather than a diverging one: a diverging scale would invent a losing side that does not exist in the data. Seats that changed hands wear the new party's outline.",
                  "Only shows the winning party's swing; a district can change hands on a small move. 2021 and 2024 share identical boundaries, which is the only reason a per-district swing is honest here.", "Elections · 2021 → 2024 swing")
    body = (f'{helmet()}<div style="{root_style()}; display: grid; grid-template-rows: 410px minmax(0, 1fr); width: 640px; height: 610px; overflow: hidden; background: var(--water); font-family: {UI}">'
            f'<div style="position: relative; overflow: hidden">{svg}{overlay}</div>{cap}</div>')
    return dc(body)


# ================================================================ 3. Poll-level boards
def poll_fill_style(tok, margin):
    op = 0.35 if margin < 5 else 0.55 if margin < 15 else 0.75 if margin < 30 else 0.9
    return f"fill: var(--{tok}); fill-opacity: {op}"


def build_polls_provincial():
    P = load("prov_polls_01.json"); PD = load("prov_pd_01.geojson")["features"]
    bx = bbox_of(PD); proj = LocalProj(bx[0], bx[1], bx[2], bx[3], 900, 720)
    by_pd = {p["pd_no"]: p for p in P["polls"] if p.get("matched_polygon") and p.get("pd_no")}
    fills = []; outlines = []; labels = []; squares = []
    ties = 0; won = {"PC": 0, "Liberal": 0}
    for f in PD:
        pr = f["properties"]; pth = path_for(f["geometry"], proj, tol=0.5)
        if not pth:
            continue
        outlines.append(f'<path d="{pth["d"]}"></path>')
        p = by_pd.get(pr["PD_NO"])
        if pr.get("IND_POLL") == "Y":
            squares.append(f'<rect x="{pth["cx"]-5:.1f}" y="{pth["cy"]-5:.1f}" width="10" height="10" style="fill: var(--surface); stroke: var(--ink); stroke-width: 1.2"><title>PD {pr["PD_NO"]} · institutional poll</title></rect>')
            continue
        if not p:
            fills.append(f'<path d="{pth["d"]}" style="fill: url(#hatch)"></path>')
            continue
        if p["tie"]:
            ties += 1
            fills.append(f'<path d="{pth["d"]}" style="fill: var(--band)"><title>PD {pr["PD_NO"]} · tie</title></path>')
        else:
            w = p["winner"]["party"]; won[w] = won.get(w, 0) + 1
            fills.append(f'<path d="{pth["d"]}" style="{poll_fill_style(PARTY_TOK[w], p["margin_pct"])}"><title>PD {pr["PD_NO"]} {esc(p["poll_name"])} · {esc(w)} by {p["margin_votes"]} ({p["margin_pct"]} pts) · turnout {round(100*p["turnout"])}%</title></path>')
        if pth["area"] > 900:
            labels.append(f'<text x="{pth["cx"]}" y="{pth["cy"]+3}">{pr["PD_NO"]}</text>')
    svg = (f'<svg viewBox="0 0 900 720" width="900" height="720" style="display: block; background: var(--water)">{HATCH}'
           f'<g style="fill: var(--land); stroke: none">{"".join(outlines)}</g><g style="stroke: none">{"".join(fills)}</g>'
           f'<g style="fill: none; stroke: var(--mapink); stroke-width: 0.9; stroke-linejoin: round; opacity: 0.8">{"".join(outlines)}</g>{"".join(squares)}'
           f'<g style="font-family: {MONO}; font-size: 10px; fill: var(--ink); text-anchor: middle; paint-order: stroke; stroke: var(--land); stroke-width: 3px">{"".join(labels)}</g></svg>')
    t = P["district_totals"]
    mapped_rows = [p for p in P["polls"] if p.get("matched_polygon")]
    mapped_total = sum(p["total"] for p in mapped_rows)
    unmapped = [p for p in P["polls"] if not p.get("matched_polygon")]
    unmapped_total = sum(p["total"] for p in unmapped)
    def party_sum(rows, party):
        return sum(p["by_party"].get(party, 0) for p in rows)
    ledger_rows = []
    for p in unmapped:
        ledger_rows.append(f'<div style="display: flex; justify-content: space-between; gap: 10px; font-family: {MONO}; font-size: 11.5px"><span style="font-family: {UI}">{esc(p["poll_label_as_printed"])} · {esc(p["poll_name"][:34])}</span><span>{p["total"]:,}</span></div>')
    closest = sorted([p for p in mapped_rows if not p["tie"]], key=lambda p: p["margin_votes"])[:4]
    closest_html = "".join(f'<div style="display: flex; justify-content: space-between; gap: 10px; font-size: 11.5px"><span>PD {p["pd_no"]} · {esc(p["poll_name"].split(",")[0][:30])}</span><span style="font-family: {MONO}">{esc(p["winner"]["party"])} by {p["margin_votes"]}</span></div>' for p in closest)
    share_mapped = 100 * mapped_total / t["total_votes"]
    panel = (
        f'<aside style="display: grid; gap: 12px; align-content: start; padding: 22px 24px; background: var(--surface); border-left: 1px solid var(--line); overflow: hidden">'
        f'{eyebrow("Provincial · ED 01 · 2024 general election · poll by poll")}'
        f'<h2 style="margin: -4px 0 0; font-family: {DISPLAY}; font-size: 26px; font-weight: 700; line-height: 1.1">Annapolis, poll by poll</h2>'
        f'<p style="margin: 0; font-size: 12.5px; line-height: 1.45">David Bowlby (PC) won the district by <strong>8 votes</strong>. The map shows the 36 ordinary polls and the mobile poll that have a division polygon; PC won {won["PC"]} polls, Liberal {won["Liberal"]}, {ties} tied.</p>'
        f'{legend_row([(swatch("pc", 0.75), "PC poll"), (swatch("lib", 0.75), "Liberal poll"), (swatch("band"), "tie"), ("<span style=\"display: inline-block; width: 10px; height: 10px; background: var(--surface); border: 1.2px solid var(--ink)\"></span>", "institutional poll"), ("<span style=\"display: inline-block; width: 12px; height: 10px; background: repeating-linear-gradient(45deg, #9aa4a6 0 1px, transparent 1px 4px); border: 1px solid rgba(0,0,0,0.3)\"></span>", "no result for this division")])}'
        f'<p style="margin: 0; color: var(--muted); font-size: 11px">Paler fill = closer poll (under 5, 15, 30 points).</p>'
        f'<section style="padding: 12px 14px; background: var(--paper); border: 1px solid var(--line); border-radius: 6px">'
        f'<strong style="font-size: 12.5px">Where the 7,446 ballots were cast</strong>'
        f'<div style="display: flex; height: 14px; gap: 2px; margin: 8px 0 6px; background: var(--surface)"><span title="mapped" style="width: {share_mapped:.1f}%; background: var(--deep); border-radius: 4px 0 0 4px"></span><span title="unmapped" style="flex: 1; background: var(--peach); border-radius: 0 4px 4px 0"></span></div>'
        f'<div style="display: flex; justify-content: space-between; font-family: {MONO}; font-size: 11.5px"><span>on the map {mapped_total:,} ({share_mapped:.0f}%)</span><span>no map location {unmapped_total:,} ({100-share_mapped:.0f}%)</span></div>'
        f'<div style="display: grid; gap: 3px; margin-top: 8px">{"".join(ledger_rows)}</div>'
        f'<p style="margin: 8px 0 0; font-size: 11.5px; line-height: 1.45">In the mapped polls PC led Liberal {party_sum(mapped_rows, "PC"):,} to {party_sum(mapped_rows, "Liberal"):,}; the unmapped ballots went Liberal {party_sum(unmapped, "Liberal"):,} to PC {party_sum(unmapped, "PC"):,}. The map alone would call this district wrong.</p></section>'
        f'<section><strong style="font-size: 12.5px">Closest polls</strong><div style="display: grid; gap: 3px; margin-top: 6px">{closest_html}</div></section>'
        f'<details><summary style="font-size: 11.5px; font-weight: 600; color: var(--muted); cursor: pointer">▸ Evidence and caveats</summary>'
        f'<p style="margin: 6px 0 0; color: var(--muted); font-size: 11px; line-height: 1.45">2024 election results on polling divisions released September 1, 2020, which were in force for that election; the current provincial layer is dated 2026 but unchanged for 54 of 56 districts. Advance, returning-office, write-in and out-of-district ballots have no map location. Poll boundaries are simplified; elector counts on polygons are a register snapshot, not the 2024 final list. Inverness and Chéticamp-Margarees-Pleasant Bay were renumbered April 9, 2026 and cannot be shaded from 2024 poll numbers.</p></details>'
        f'{source_line("Elections Nova Scotia, 42nd General Election poll-by-poll workbook (final) and GeoNOVA BND_ElectoralBoundaries_UT83 layer 3 · fetched September 12, 2026 · 37 of 37 division numbers matched.")}'
        f'</aside>')
    body = (f'{helmet()}<div style="{root_style()}; display: grid; grid-template-columns: 900px minmax(0, 1fr); width: 1440px; height: 720px; overflow: hidden; color: var(--ink); background: var(--water); font-family: {UI}; font-size: 14px">'
            f'<div style="position: relative">{svg}'
            f'<div style="position: absolute; top: 10px; left: 12px; padding: 6px 10px; background: rgba(255, 255, 255, 0.92); border: 1px solid var(--line); border-radius: 6px; font-family: {MONO}; font-size: 10.5px; color: var(--ink)">2024 results on 2020-release polling divisions · advance, write-in and returning-office votes not mapped</div></div>{panel}</div>')
    return dc(body)


def build_polls_federal():
    F = load("fed_polls_12001.json"); PD = load("fed_pd_12001.geojson")["features"]
    bx = bbox_of(PD); proj = LocalProj(bx[0], bx[1], bx[2], bx[3], 900, 720)
    by_key = {p["pd"]: p for p in F["polls"]}
    fills = []; outlines = []; squares = []; won = {}
    ties = 0
    for f in PD:
        pr = f["properties"]; pth = path_for(f["geometry"], proj, tol=0.5)
        if not pth:
            continue
        p = by_key.get(pr["key"])
        if pr["pd_type"] in ("M", "S"):
            squares.append(f'<rect x="{pth["cx"]-4:.1f}" y="{pth["cy"]-4:.1f}" width="8" height="8" style="fill: var(--surface); stroke: var(--ink); stroke-width: 1.1"><title>{esc(pr["key"])} · {"mobile" if pr["pd_type"]=="M" else "single-building"} poll</title></rect>')
            continue
        outlines.append(f'<path d="{pth["d"]}"></path>')
        if not p or p["status"] == "combined_elsewhere":
            fills.append(f'<path d="{pth["d"]}" style="fill: url(#hatch)"><title>{esc(pr["key"])} · counted with a neighbouring division</title></path>')
            continue
        votes = sorted(p["votes"], key=lambda v: -v["votes"])
        total = sum(v["votes"] for v in p["votes"])
        if total == 0:
            fills.append(f'<path d="{pth["d"]}" style="fill: url(#dots)"></path>'); continue
        if len(votes) > 1 and votes[0]["votes"] == votes[1]["votes"]:
            ties += 1; fills.append(f'<path d="{pth["d"]}" style="fill: var(--band)"><title>{esc(pr["key"])} · tie</title></path>'); continue
        w = votes[0]["party"].split("-")[0].strip(); won[w] = won.get(w, 0) + 1
        margin = 100 * (votes[0]["votes"] - votes[1]["votes"]) / total
        fills.append(f'<path d="{pth["d"]}" style="{poll_fill_style(PARTY_TOK.get(w, "ind"), margin)}"><title>{esc(pr["key"])} {esc(pr.get("name") or "")} · {esc(w)} by {votes[0]["votes"]-votes[1]["votes"]} ({margin:.0f} pts)</title></path>')
    svg = (f'<svg viewBox="0 0 900 720" width="900" height="720" style="display: block; background: var(--water)">{HATCH}'
           f'<g style="fill: var(--land); stroke: none">{"".join(outlines)}</g><g style="stroke: none">{"".join(fills)}</g>'
           f'<g style="fill: none; stroke: var(--mapink); stroke-width: 0.7; stroke-linejoin: round; opacity: 0.75">{"".join(outlines)}</g>{"".join(squares)}</svg>')
    rt = F["riding_totals"]; bk = rt["by_kind"]
    cands = sorted(F["candidates"], key=lambda c: -c["votes"])
    valid = rt["valid"]
    cand_rows = "".join(
        f'<div style="display: grid; grid-template-columns: 150px minmax(0, 1fr) 96px; align-items: center; gap: 8px; min-height: 20px">'
        f'<span style="font-size: 12px; font-weight: 600">{esc(c["name"])} <span style="color: var(--muted); font-weight: 500">· {esc(c["party_en"].split("-")[0].strip())}</span></span>'
        f'<span style="display: block; height: 12px; background: var(--fog); border-radius: 0 4px 4px 0"><span style="display: block; width: {100*c["votes"]/valid:.1f}%; height: 12px; background: var(--{PARTY_TOK.get(c["party_en"].split("-")[0].strip(), "ind")}); border-radius: 0 4px 4px 0"></span></span>'
        f'<span style="font-family: {MONO}; font-size: 11.5px; text-align: right; white-space: nowrap">{c["votes"]:,} · {100*c["votes"]/valid:.1f}%</span></div>' for c in cands)
    kinds = [("Election-day polls (on the map)", bk["ordinary"]["valid"], "deep"), ("Advance polls (26, no division polygon)", bk["advance"]["valid"], "peach"), ("Special ballots", bk["svr"]["valid"], "ind")]
    kind_bar = "".join(f'<span title="{k}" style="width: {100*v/valid:.1f}%; background: var(--{tok})"></span>' for k, v, tok in kinds)
    kind_rows = "".join(f'<div style="display: flex; justify-content: space-between; gap: 10px; font-size: 11.5px"><span style="display: inline-flex; gap: 6px; align-items: center">{swatch(tok)}{esc(k)}</span><span style="font-family: {MONO}">{v:,} · {100*v/valid:.0f}%</span></div>' for k, v, tok in kinds)
    panel = (
        f'<aside style="display: grid; gap: 12px; align-content: start; padding: 22px 24px; background: var(--surface); border-left: 1px solid var(--line); overflow: hidden">'
        f'{eyebrow("Federal · Acadie—Annapolis (12001) · 45th general election, April 28, 2025")}'
        f'<h2 style="margin: -4px 0 0; font-family: {DISPLAY}; font-size: 26px; font-weight: 700; line-height: 1.1">Acadie—Annapolis, division by division</h2>'
        f'<p style="margin: 0; font-size: 12.5px; line-height: 1.45">Chris d\'Entremont (Conservative) won by <strong>{rt["majority_votes"]} votes</strong> ({rt["majority_pct"]}%) on {rt["turnout_pct"]}% turnout. Election-day divisions: Conservative {won.get("Conservative", 0)}, Liberal {won.get("Liberal", 0)}, ties {ties}. Every one of the 203 division polygons joined to a results row.</p>'
        f'<div style="display: grid; gap: 5px">{cand_rows}</div>'
        f'{legend_row([(swatch("pc", 0.75), "Conservative division"), (swatch("lib", 0.75), "Liberal division"), (swatch("band"), "tie"), ("<span style=\"display: inline-block; width: 12px; height: 10px; background: repeating-linear-gradient(45deg, #9aa4a6 0 1px, transparent 1px 4px); border: 1px solid rgba(0,0,0,0.3)\"></span>", "counted with a neighbour"), ("<span style=\"display: inline-block; width: 8px; height: 8px; background: var(--surface); border: 1.1px solid var(--ink)\"></span>", "mobile or single-building poll")])}'
        f'<section style="padding: 12px 14px; background: var(--paper); border: 1px solid var(--line); border-radius: 6px"><strong style="font-size: 12.5px">Where the {valid:,} valid votes were cast</strong>'
        f'<div style="display: flex; height: 14px; gap: 2px; margin: 8px 0 6px; background: var(--surface); border-radius: 4px; overflow: hidden">{kind_bar}</div><div style="display: grid; gap: 3px">{kind_rows}</div>'
        f'<p style="margin: 8px 0 0; font-size: 11.5px; line-height: 1.45">Advance ballots are reported by advance polling district (600–625), not by division. They can be drawn as a second layer by dissolving divisions on their advance-poll number; no provincial equivalent exists.</p></section>'
        f'<details><summary style="font-size: 11.5px; font-weight: 600; color: var(--muted); cursor: pointer">▸ Evidence and caveats</summary>'
        f'<p style="margin: 6px 0 0; color: var(--muted); font-size: 11px; line-height: 1.45">Division colours show election-day ballots only. Turnout per division is election-day ballots over listed electors and is not comparable with the riding figure. Hatched divisions had their ballots counted with a neighbouring division. Small squares mark an institution, not a neighbourhood. Boundaries: Elections Canada polling divisions at the issue of the writ, simplified (about 45 m at most). Results: Official Voting Results, Format 2, page dated November 5, 2025. Plurality winners at a division are for screening only.</p></details>'
        f'{source_line("Elections Canada · PollingDivisionBoundaries_2025 (KMZ) and pollresults_resultatsbureau12001.csv · riding totals cross-checked against EC Table 11 · fetched September 12, 2026.")}</aside>')
    body = (f'{helmet()}<div style="{root_style()}; display: grid; grid-template-columns: 900px minmax(0, 1fr); width: 1440px; height: 720px; overflow: hidden; color: var(--ink); background: var(--water); font-family: {UI}; font-size: 14px">'
            f'<div style="position: relative">{svg}<div style="position: absolute; top: 10px; left: 12px; padding: 6px 10px; background: rgba(255, 255, 255, 0.92); border: 1px solid var(--line); border-radius: 6px; font-family: {MONO}; font-size: 10.5px; color: var(--ink)">Election-day polls only · advance and special ballots (47% of valid votes) are not on this map</div></div>{panel}</div>')
    return dc(body)


# ================================================================ 4. Census
DA_GEO = load("census_da_annapolis.geojson")["features"]
DA_VAL = load("census_da_values.json")
CSD_GEO = load("census_csd_ns.geojson")["features"]
ED_CENSUS = {a["ED_NO"]: a for a in (f["attributes"] for f in load("ed_census_2021.json")["features"])}
AREA_BBOX = (-65.55, 44.55, -64.75, 45.05)
SEL_DA = "12050060"


def not_usual_share(total, usual):
    if not total:
        return None
    return 100 * (total - usual) / total


def seq_class(v, breaks):
    if v is None:
        return None
    for i, b in enumerate(breaks):
        if v < b:
            return f"seq{i+1}"
    return f"seq{len(breaks)+1}"


def ink_class(v, breaks):
    c = seq_class(v, breaks)
    return c.replace("seq", "ink") if c else None


def county_map(mode, w=1120, h=832, selected=None, labels=True):
    """mode: notusual | eras | age"""
    proj = LocalProj(AREA_BBOX[0], AREA_BBOX[1], AREA_BBOX[2], AREA_BBOX[3], w, h, pad=0.0)
    fills = []; outlines = []; sel = ""
    hatched = 0; drawn = 0
    for f in DA_GEO:
        pr = f["properties"]; v = DA_VAL.get(pr["DAUID"]) or {}
        pth = path_for(f["geometry"], proj, tol=0.6)
        if not pth:
            continue
        outlines.append(f'<path d="{pth["d"]}"></path>')
        if mode == "notusual":
            val = not_usual_share(v.get("dwellings_total"), v.get("dwellings_usual")); cls = seq_class(val, [5, 10, 20, 35]); label = f"{val:.0f}% not usual residents" if val is not None else "suppressed"
        elif mode == "eras":
            val = (v.get("prebuilt_1960_share") or 0) * 100 if v.get("period_of_construction_total") else None; cls = ink_class(val, [15, 30, 45, 60]); label = f"{val:.0f}% built 1960 or before" if val is not None else "suppressed"
        else:
            val = v.get("median_age"); cls = seq_class(val, [40, 45, 50, 55, 60]); label = f"median age {val}" if val is not None else "suppressed"
        if cls is None:
            hatched += 1; fills.append(f'<path d="{pth["d"]}" style="fill: url(#hatch)"><title>DA {pr["DAUID"]} · no values published</title></path>')
        else:
            drawn += 1; fills.append(f'<path d="{pth["d"]}" style="fill: var(--{cls})"><title>DA {pr["DAUID"]} · {label}</title></path>')
        if selected and pr["DAUID"] == selected:
            sel = f'<path d="{pth["d"]}" style="fill: none; stroke: var(--red); stroke-width: 2.2; stroke-linejoin: round"></path>'
    csd_lines = []; csd_labels = []
    for f in CSD_GEO:
        pr = f["properties"]
        if not pr["CSDUID"].startswith(("1205", "1203", "1207")):
            continue
        pth = path_for(f["geometry"], proj, tol=0.8)
        if not pth:
            continue
        csd_lines.append(f'<path d="{pth["d"]}"></path>')
        if labels and pr["CSDTYPE"] in ("T", "SC", "MD") and 0 < pth["cx"] < w and 0 < pth["cy"] < h:
            csd_labels.append(f'<text x="{pth["cx"]}" y="{pth["cy"]}">{esc(pr["name"])}</text>')
    svg = (f'<svg viewBox="0 0 {w} {h}" width="{w}" height="{h}" style="display: block; background: var(--water)">{HATCH}'
           f'<g style="fill: var(--land); stroke: none">{"".join(outlines)}</g><g opacity="0.78" style="stroke: none">{"".join(fills)}</g>'
           f'<g style="fill: none; stroke: var(--mapink); stroke-width: 0.5; stroke-linejoin: round; opacity: 0.55">{"".join(outlines)}</g>'
           f'<g style="fill: none; stroke: var(--boundary); stroke-width: 1.6; stroke-dasharray: 6 3; stroke-linejoin: round">{"".join(csd_lines)}</g>{sel}'
           f'<g style="font-family: {UI}; font-size: 12px; font-weight: 600; fill: var(--mapink); text-anchor: middle; paint-order: stroke; stroke: var(--land); stroke-width: 3px; opacity: 0.9">{"".join(csd_labels)}</g></svg>')
    return svg, drawn, hatched


def era_strip(periods, total, width=340):
    order = ["1960_or_before", "1961_1980", "1981_1990", "1991_2000", "2001_2005", "2006_2010", "2011_2015", "2016_2021"]
    labels = ["≤1960", "61–80", "81–90", "91–00", "01–05", "06–10", "11–15", "16–21"]
    tints = ["ink5", "ink4", "ink4", "ink3", "ink3", "ink2", "ink2", "ink1"]
    segs = []; ticks = []
    denom = sum((periods.get(k, 0) or 0) for k in order) or total
    for k, tok, lab in zip(order, tints, labels):
        v = periods.get(k, 0) or 0
        if v:
            pct = 100 * v / denom
            segs.append(f'<span title="{lab}: {v} homes" style="display: block; width: {pct:.1f}%; height: 16px; background: var(--{tok})"></span>')
            ticks.append(f'<span style="width: {pct:.1f}%; text-align: center; overflow: hidden; white-space: nowrap">{lab if pct >= 9 else ""}</span>')
    return (f'<div style="display: flex; gap: 2px; width: {width}px; background: var(--surface); border-radius: 4px; overflow: hidden">{"".join(segs)}</div>'
            f'<div style="display: flex; gap: 2px; width: {width}px; font-family: {MONO}; font-size: 9px; color: var(--muted); margin-top: 3px">{"".join(ticks)}</div>'
            f'<div style="width: {width}px; font-size: 9.5px; color: var(--muted); margin-top: 2px">Oldest to newest, left to right; segments sum to {denom} because each count is rounded to 5.</div>')


def ladder(label, da_v, csd_v, ed_v, unit="%"):
    """three-rung comparison bar: DA filled, CSD hollow, ED hairline; values printed."""
    mx = max(x for x in (da_v, csd_v, ed_v) if x is not None) * 1.15 or 1
    def pos(v): return f"{100*v/mx:.1f}%"
    return (f'<div style="display: grid; gap: 3px"><div style="display: flex; justify-content: space-between; font-size: 12px"><span>{esc(label)}</span><span style="font-family: {MONO}">{da_v:.0f}{unit}</span></div>'
            f'<div style="position: relative; height: 10px; background: var(--fog); border-radius: 3px">'
            f'<span style="position: absolute; left: 0; top: 0; width: {pos(da_v)}; height: 10px; background: var(--deep); border-radius: 3px 0 0 3px"></span>'
            + (f'<span title="census subdivision {csd_v:.0f}{unit}" style="position: absolute; left: calc({pos(csd_v)} - 1px); top: -2px; width: 2px; height: 14px; background: var(--ink)"></span>' if csd_v is not None else "")
            + (f'<span title="district {ed_v:.0f}{unit}" style="position: absolute; left: calc({pos(ed_v)} - 1px); top: -2px; width: 2px; height: 14px; background: var(--red)"></span>' if ed_v is not None else "")
            + '</div></div>')


def profile_card(standalone=False):
    v = DA_VAL[SEL_DA]
    csd = next(f["properties"] for f in CSD_GEO if f["properties"]["CSDUID"] == "1205009")
    ed = ED_CENSUS["01"]
    da_nu = not_usual_share(v["dwellings_total"], v["dwellings_usual"]); csd_nu = not_usual_share(csd["dwellings_total"], csd["dwellings_usual"]); ed_nu = not_usual_share(ed["Total_private_dwellings_2021"], ed["Private_dwellings_occupied_by_usual_residents_2021"])
    pos = "" if standalone else "position: absolute; right: 16px; bottom: 18px; max-height: calc(100% - 36px); overflow: hidden; "
    dots = "".join(f'<span style="width: 9px; height: 9px; border-radius: 50%; background: var(--{"ink5" if i < round(10*v["one_person_share"]) else "ink1"})"></span>' for i in range(10))
    return (
        f'<article style="{pos}width: 390px; padding: 22px 24px; color: var(--ink); background: var(--surface); border: 1px solid var(--line); border-radius: 7px; box-shadow: var(--shadow); font-family: {UI}; font-size: 14px">'
        f'<div style="display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; margin: 0 -24px 14px; padding: 0 14px 12px 24px; border-bottom: 1px solid var(--line)">'
        f'<div>{eyebrow("Neighbourhood profile · 2021 Census · dissemination area")}<h2 style="margin: 0; font-family: {DISPLAY}; font-size: 24px; font-weight: 700; line-height: 1.08">DA {SEL_DA}</h2>'
        f'<p style="margin: 4px 0 0; color: var(--muted); font-size: 12px">in Annapolis, Subd. B · district Annapolis · {v["land_area_km2"]} km²</p></div>'
        f'<button type="button" aria-label="Close" style="display: grid; flex: 0 0 44px; width: 44px; height: 44px; place-items: center; padding: 0; color: var(--ink); font-size: 32px; line-height: 1; background: none; border: 0">×</button></div>'
        f'<dl style="margin: 0; padding: 4px 0 10px; border-bottom: 1px solid var(--line)">'
        f'{dl_row("Population", f"{v["population_2021"]} · {v["pop_density_per_km2"]} per km²")}'
        f'{dl_row("Median age", f"{v["median_age"]}")}'
        f'{dl_row("Households", f"{v["households_total"]} · {v["avg_household_size"]} people each")}'
        f'{dl_row("Dwellings", f"{v["dwellings_total"]} · {v["dwellings_usual"]} lived in year-round")}'
        f'{dl_row("Owners", f"{v["owner_households"]} of {v["tenure_total"]} <span style=\"color: var(--muted)\">· 25% sample</span>")}'
        f'{dl_row("Median household income (2020)", f"${v["median_hh_income_2020"]:,}")}'
        f'{dl_row("French mother tongue", f"{v["french_mt"]} of {v["mother_tongue_total"]}")}'
        f'{dl_row("Commute by car", f"{v["commute_car"]} of {v["commute_total"]} <span style=\"color: var(--muted)\">· 25% sample</span>")}'
        f'</dl>'
        f'<div style="display: grid; gap: 10px; padding: 12px 0"><strong style="font-size: 12.5px">Against the census subdivision and the district</strong>'
        f'{ladder("Dwellings not lived in year-round", da_nu, csd_nu, ed_nu)}'
        f'<div style="display: flex; gap: 12px; font-size: 10.5px; color: var(--muted)"><span style="display: inline-flex; gap: 4px; align-items: center"><span style="width: 12px; height: 8px; background: var(--deep)"></span>this DA</span><span style="display: inline-flex; gap: 4px; align-items: center"><span style="width: 2px; height: 12px; background: var(--ink)"></span>census subdivision (Annapolis, Subd. B)</span><span style="display: inline-flex; gap: 4px; align-items: center"><span style="width: 2px; height: 12px; background: var(--red)"></span>Annapolis district (Elections NS table)</span><span style="font-style: italic">[province value pending]</span></div></div>'
        f'<div style="padding: 10px 0; border-top: 1px solid var(--line)"><div style="display: flex; justify-content: space-between; font-size: 12px"><span>Period of construction</span><span style="font-family: {MONO}">{v["period_of_construction_total"]} occupied homes</span></div><div style="margin-top: 6px">{era_strip(v["period_of_construction"], v["period_of_construction_total"])}</div></div>'
        f'<div style="padding: 10px 0; border-top: 1px solid var(--line)"><div style="display: flex; justify-content: space-between; align-items: center; font-size: 12px"><span>One-person households</span><span style="display: flex; gap: 3px" title="{v["one_person_households"]} of {v["households_total"]}">{dots}</span><span style="font-family: {MONO}">{v["one_person_households"]} of {v["households_total"]}</span></div></div>'
        f'<section style="margin-top: 6px; padding: 12px 14px; background: #f5f9f5; border: 1px solid rgba(46, 112, 76, 0.3); border-radius: 6px"><h3 style="margin: 0 0 6px; color: #245d3d; font-size: 14px">Evidence</h3>'
        f'<p style="margin: 0; color: rgba(18, 52, 59, 0.68); font-size: 11.2px; line-height: 1.45">Adapted from Statistics Canada, Census Profile, 2021 Census of Population (98-316-X2021001), DA dataflow, retrieved September 12, 2026. Counts are randomly rounded to a multiple of 5; rows marked 25% sample come from the long form. 2016 comparison not applicable for this DA (boundary change). A DA describes an area, never a parcel or its occupants.</p></section></article>')


def build_census_main():
    svg, drawn, hatched = county_map("notusual", selected=SEL_DA)
    rail = (
        f'<aside style="grid-row: 2; grid-column: 1; min-width: 0; min-height: 0; padding: 18px 24px; overflow: hidden; background: var(--surface); border-right: 1px solid var(--line); box-shadow: 6px 0 24px rgba(18, 52, 59, 0.08)">'
        f'<h2 style="margin: 0 0 16px; font-family: {DISPLAY}; font-size: 23.2px; font-weight: 700; line-height: 1.08">People &amp; Housing</h2>'
        f'<section style="display: grid; gap: 6px; margin: 0 0 12px; padding: 12px; background: var(--tint); border: 1px solid rgba(47, 128, 237, 0.28); border-radius: 8px"><h2 style="margin: 0; font-size: 15.36px; font-weight: 800">Map setup</h2>'
        f'<select value="People &amp; Housing" style="width: 100%; min-height: 44px; padding: 8px 10px; font: inherit; color: var(--ink); background: var(--surface); border: 1px solid var(--line); border-radius: 5px"><optgroup label="Built-in themes"><option value="Explore Nova Scotia">Explore Nova Scotia</option><option value="Electoral Districts">Electoral Districts</option><option value="People &amp; Housing" selected>People &amp; Housing</option></optgroup></select>'
        f'<p style="margin: 0; color: var(--muted); font-size: 11.52px; line-height: 1.4">2021 Census washes at municipality and neighbourhood scale, with a profile in the inspector.</p></section>'
        f'<section style="padding: 20px 0 0; border-top: 1px solid var(--line)"><h2 style="margin: 0 0 9px; font-size: 15.36px; font-weight: 800">Map layers</h2>'
        f'<section>{category_heading("People & Housing · Census 2021", "1 wash on · inspector profile on", True)}<div style="padding: 0 4px 12px">'
        f'<p style="margin: 0 0 7px; color: var(--muted); font-size: 11.52px; line-height: 1.45">One wash at a time. Chips say the geography (DA, CSD, ED) and whether the row is 100% or 25% sample data.</p>'
        f'{group_heading("Homes")}'
        f'{layer_row("Dwellings not lived in year-round", "DA · CSD · ED · 100% data · share of all private dwellings", True, ("Ready · 88 DAs in view", "ready"), legend([("seq1", "<5%"), ("seq2", "5–10"), ("seq3", "10–20"), ("seq4", "20–35"), ("seq5", "35%+")]))}'
        f'{layer_row("Period of construction", "DA · 25% sample · era selector, default 1960 or before", False)}'
        f'{layer_row("One-person households", "DA · 100% data · shown where 100+ households", False)}'
        f'{group_heading("People")}'
        f'{layer_row("Population change 2016 to 2021", "CSD only · not published at DA scale", False)}'
        f'{layer_row("Median age", "DA · 100% data", False)}'
        f'{layer_row("Mother tongue: French / Indigenous languages", "ED · CSD · DA · symbols, not fills", False)}'
        f'{group_heading("Reference")}'
        f'{layer_row("Census boundaries", "DA hairlines from zoom 11 · CSD dashed outlines", True, ("Ready", "ready"))}'
        f'</div></section>{collapsed_categories()}</section></aside>')
    header = (
        f'<header style="grid-row: 1; grid-column: 1 / span 2; display: flex; align-items: center; justify-content: space-between; gap: 24px; padding: 8px 28px; background: var(--surface); border-bottom: 1px solid var(--line)">'
        f'<a href="#" style="display: flex; align-items: center; gap: 12px; color: inherit; text-decoration: none"><span style="display: grid; width: 44px; height: 44px; place-items: center; color: #ffffff; font-family: {MONO}; font-size: 12px; font-weight: 700; background: var(--deep); border-radius: 8px">NS</span>'
        f'<strong style="font-family: {DISPLAY}; font-size: 28px; font-weight: 700; line-height: 1">NS Marks The Spot</strong><span style="color: var(--deep)">Online</span></a>'
        f'<div style="display: flex; align-items: center; gap: 28px; font-size: 15.36px"><button type="button" style="padding: 0; color: var(--blue); font: inherit; text-decoration: underline; background: none; border: 0">About this map</button><span>iPhone app in development</span>'
        f'<a href="#" style="display: inline-flex; min-height: 44px; align-items: center; justify-content: center; padding: 10px 18px; color: #ffffff; font-weight: 700; text-decoration: none; background: var(--blue); border: 1px solid var(--blue); border-radius: 6px">Get launch updates</a></div></header>')
    chrome = (
        f'<div style="position: absolute; top: 12px; left: 12px; display: grid; width: 34px; color: var(--blue); font-size: 22px; font-weight: 700; text-align: center; background: var(--surface); border: 2px solid rgba(0, 0, 0, 0.2); border-radius: 4px; line-height: 30px"><span style="border-bottom: 1px solid #ccc">+</span><span>−</span></div>'
        f'<div style="position: absolute; top: 12px; left: 60px; display: grid; gap: 6px; padding: 10px 12px; color: var(--ink); background: rgba(255, 255, 255, 0.94); border: 1px solid var(--line); border-radius: 6px; box-shadow: 0 4px 18px rgba(18, 52, 59, 0.12); font-size: 11.5px">'
        f'<strong style="font-family: {MONO}; font-size: 11.2px; letter-spacing: 0.04em; text-transform: uppercase; color: var(--deep)">Dwellings not lived in year-round · DA</strong>'
        f'<div style="display: flex; gap: 2px; border: 1px solid rgba(0,0,0,0.25); border-radius: 2px; width: fit-content">{"".join(f"<span style=\"width: 30px; height: 10px; background: var(--seq{i})\"></span>" for i in range(1, 6))}</div>'
        f'<div style="display: flex; justify-content: space-between; width: 158px; font-family: {MONO}; font-size: 9.5px; color: var(--muted)"><span>&lt;5%</span><span>10</span><span>20</span><span>35+</span></div>'
        f'<span style="display: inline-flex; gap: 6px; align-items: center"><span style="width: 14px; height: 10px; background: repeating-linear-gradient(45deg, #9aa4a6 0 1px, transparent 1px 4px); border: 1px solid rgba(0,0,0,0.3)"></span>no values published ({hatched} DAs under 40 people)</span>'
        f'<span style="display: inline-flex; gap: 6px; align-items: center"><span style="width: 18px; border-top: 1.6px dashed var(--boundary)"></span>municipality (CSD)</span></div>'
        f'<div style="position: absolute; left: 12px; bottom: 74px; display: grid; gap: 6px; font-family: {MONO}; font-size: 11px; font-weight: 600"><span style="width: fit-content; padding: 3px 7px; color: var(--ink); background: rgba(255, 255, 255, 0.82); border: 1px solid var(--line); border-radius: 4px">Z 10 · 44.80, −65.35</span></div>'
        f'<div style="position: absolute; right: 0; bottom: 0; left: 0; display: flex; flex-wrap: wrap; gap: 2px 10px; padding: 5px 10px; color: var(--ink); font-size: 10.5px; line-height: 1.4; background: rgba(251, 246, 234, 0.9)"><span>Adapted from Statistics Canada, Census Profile and 2021 Census boundary files, 2021. This does not constitute an endorsement by Statistics Canada of this product.</span><span>District rung © Elections Nova Scotia (GeoNOVA)</span><span>Basemap: NS Marks Atlas</span></div>')
    body = (f'{helmet()}<div style="{root_style()}; display: grid; grid-template-rows: 68px minmax(0, 1fr); grid-template-columns: 320px minmax(0, 1fr); width: 1440px; height: 900px; overflow: hidden; color: var(--ink); background: var(--fog); font-family: {UI}; font-size: 16px">'
            f'{header}{rail}<section style="grid-row: 2; grid-column: 2; position: relative; min-width: 0; min-height: 0; overflow: hidden; background: var(--water)">{svg}{chrome}{profile_card()}</section></div>')
    return dc(body)


def build_census_profile():
    return dc(f'{helmet()}<div style="{root_style()}; width: 390px; background: var(--fog)">{profile_card(standalone=True)}</div>')


def census_tile(svg, overlay, cap):
    return dc(f'{helmet()}<div style="{root_style()}; display: grid; grid-template-rows: 410px minmax(0, 1fr); width: 640px; height: 610px; overflow: hidden; background: var(--water); font-family: {UI}">'
              f'<div style="position: relative; overflow: hidden">{svg}{overlay}</div>{cap}</div>')


def ramp_box(title, tokens, ticks, extra=""):
    return (f'<div style="position: absolute; top: 10px; left: 12px; display: grid; gap: 6px; padding: 8px 10px; background: rgba(255, 255, 255, 0.92); border: 1px solid var(--line); border-radius: 6px; font-size: 11px; color: var(--ink)">'
            f'<strong style="font-family: {MONO}; font-size: 10.5px; letter-spacing: 0.04em; text-transform: uppercase; color: var(--deep)">{esc(title)}</strong>'
            f'<div style="display: flex; gap: 2px; border: 1px solid rgba(0,0,0,0.25); border-radius: 2px; width: fit-content">{"".join(f"<span style=\"width: 26px; height: 10px; background: var(--{t})\"></span>" for t in tokens)}</div>'
            f'<div style="display: flex; justify-content: space-between; width: {28*len(tokens)-2}px; font-family: {MONO}; font-size: 9.5px; color: var(--muted)">{"".join(f"<span>{esc(t)}</span>" for t in ticks)}</div>{extra}</div>')


def build_census_homes():
    fills = []; outline = []
    vals = []
    for e in g.GEO["ed2026"]:
        a = ED_CENSUS.get(e["id"]); outline.append(f'<path d="{e["d"]}"></path>')
        if not a:
            continue
        val = not_usual_share(a["Total_private_dwellings_2021"], a["Private_dwellings_occupied_by_usual_residents_2021"]); vals.append((val, e["name"]))
        fills.append(f'<path d="{e["d"]}" style="fill: var(--{seq_class(val, [5, 10, 15, 20])})"><title>{esc(e["name"])} · {val:.1f}% of {a["Total_private_dwellings_2021"]:,} dwellings</title></path>')
    lo = min(vals); hi = max(vals)
    svg = (f'<svg viewBox="0 0 1000 640" width="640" height="410" style="display: block; background: var(--water)"><g style="fill: var(--land); stroke: none">{"".join(outline)}</g>'
           f'<g opacity="0.85" style="stroke: none">{"".join(fills)}</g><g style="fill: none; stroke: var(--mapink); stroke-width: 1.05; stroke-linejoin: round; opacity: 0.7">{"".join(outline)}</g></svg>')
    overlay = ramp_box("Dwellings not lived in year-round · by provincial district", ["seq1", "seq2", "seq3", "seq4", "seq5"], ["<5%", "10", "15", "20+"])
    cap = caption("Homes not lived in year-round", f"The one census signal that maps straight onto tax-sale and absentee-owner research: cottage country versus thinning settlement. At province zoom it draws from the Elections NS district table ({lo[1]} {lo[0]:.1f}% to {hi[1]} {hi[0]:.1f}%); at county zoom from dissemination areas.",
                  "Never call it vacancy: the remainder bundles seasonal homes, homes vacant on census day, renovations and sales. Counts are rounded to 5, so small areas carry a few points of noise.", "Census · rank 1 wash")
    return census_tile(svg, overlay, cap)


def build_census_change():
    proj = g  # reuse the province projection from gen (bp) via GEO paths? CSDs need projecting: use build_paths module
    import build_paths_proxy as bp  # noqa
    fills = []; outline = []
    for f in CSD_GEO:
        pr = f["properties"]; pth = bp.geom_to_path(f["geometry"], tol=1.3)
        if not pth:
            continue
        outline.append(f'<path d="{pth["d"]}"></path>')
        flag = (pr.get("data_quality_flag") or "0")[0] != "0"
        v = pr.get("pop_change_pct"); p16 = pr.get("pop_2016") or 0
        if flag:
            fills.append(f'<path d="{pth["d"]}" style="fill: url(#hatch)"><title>{esc(pr["name"])} · not comparable (incomplete enumeration)</title></path>'); continue
        if v is None or p16 < 250:
            fills.append(f'<path d="{pth["d"]}" style="fill: var(--mute)"><title>{esc(pr["name"])} · under 250 people in 2016; rate not shown</title></path>'); continue
        tok = "grow3" if v > 10 else "grow2" if v > 5 else "grow1" if v > 2 else "band" if v >= -2 else "fall1" if v >= -5 else "fall2" if v >= -10 else "fall3"
        fills.append(f'<path d="{pth["d"]}" style="fill: var(--{tok})"><title>{esc(pr["name"])} ({pr["CSDTYPE"]}) · {pr["pop_2016"]:,} → {pr["pop_2021"]:,} ({v:+.1f}%)</title></path>')
    svg = (f'<svg viewBox="0 0 1000 640" width="640" height="410" style="display: block; background: var(--water)">{HATCH}<g style="fill: var(--land); stroke: none">{"".join(outline)}</g>'
           f'<g opacity="0.9" style="stroke: none">{"".join(fills)}</g><g style="fill: none; stroke: var(--mapink); stroke-width: 0.8; stroke-linejoin: round; opacity: 0.7">{"".join(outline)}</g></svg>')
    overlay = ramp_box("Population change 2016 → 2021 · by municipality (CSD)", ["fall3", "fall2", "fall1", "band", "grow1", "grow2", "grow3"], ["−10", "−5", "−2", "+2", "+5", "+10"],
                       '<span style="display: inline-flex; gap: 6px; align-items: center"><span style="width: 14px; height: 10px; background: var(--mute); border: 1px solid rgba(0,0,0,0.25)"></span>under 250 people in 2016</span><span style="display: inline-flex; gap: 6px; align-items: center"><span style="width: 14px; height: 10px; background: repeating-linear-gradient(45deg, #9aa4a6 0 1px, transparent 1px 4px); border: 1px solid rgba(0,0,0,0.3)"></span>not comparable</span>')
    cap = caption("Growing, holding, thinning", "A true diverging map: survey blue for growth, peach deepening to ochre for decline, and a grey band from −2 to +2 percent so rounding noise never reads as a trend. Fully drawable province-wide from one verified request.",
                  "Only published at municipality scale, never for dissemination areas. Tiny municipalities are muted because a rounded count of 16 to 15 prints as −6%. Reserves with incomplete enumeration are hatched, not ranked.", "Census · rank 3 wash")
    return census_tile(svg, overlay, cap)


def build_census_eras():
    svg, drawn, hatched = county_map("eras", w=640, h=410, labels=True)
    overlay = ramp_box("Homes built 1960 or before · share of occupied homes · DA", ["ink1", "ink2", "ink3", "ink4", "ink5"], ["<15%", "30", "45", "60+"],
                       f'<span style="display: inline-flex; gap: 6px; align-items: center"><span style="width: 14px; height: 10px; background: repeating-linear-gradient(45deg, #9aa4a6 0 1px, transparent 1px 4px); border: 1px solid rgba(0,0,0,0.3)"></span>no values ({hatched} DAs)</span>')
    cap = caption("The age of the housing stock", f"Ink tints on the paper basemap, like a survey stipple: darker where more homes predate 1961. The era selector in the layer row swaps the numerator to any of the eight census periods under one fixed set of breaks. Drawn for {drawn} of {drawn+hatched} DAs in the Annapolis area.",
                  "25% sample data, rounded to 5, so a 150-home area legitimately prints bins of 0, 5, 10. Seasonal cottages, often the oldest stock, sit outside the occupied-dwelling universe.", "Census · rank 4 wash")
    return census_tile(svg, overlay, cap)


def build_census_language():
    circles = []; outline = []
    counts = {}
    for e in g.GEO["ed2026"]:
        a = ED_CENSUS.get(e["id"]); outline.append(f'<path d="{e["d"]}"></path>')
        if not a:
            continue
        fr = sum(a.get(k) or 0 for k in ("MT_French_Knowledge_of_English_only", "MT_French_Knowledge_of_French_only", "MT_French_Knowledge_of_English_and_French", "MT_French_Knowledge_of_Neither_English_nor_French"))
        counts[e["id"]] = (fr, e)
    mx = max(c[0] for c in counts.values())
    for ed_no, (fr, e) in sorted(counts.items(), key=lambda kv: -kv[1][0]):
        if fr < 20:
            circles.append(f'<circle cx="{e["cx"]}" cy="{e["cy"]}" r="3.5" style="fill: none; stroke: var(--blue); stroke-width: 1.2"><title>{esc(e["name"])} · fewer than 20 reported</title></circle>'); continue
        r = 4 + 34 * math.sqrt(fr / mx)
        label = f'<text x="{e["cx"]}" y="{e["cy"]+4}" style="font-family: {MONO}; font-size: 11px; fill: #ffffff; text-anchor: middle; font-weight: 700">{fr:,}</text>' if r > 22 else ""
        circles.append(f'<circle cx="{e["cx"]}" cy="{e["cy"]}" r="{r:.1f}" style="fill: var(--blue); fill-opacity: 0.6; stroke: var(--mapink); stroke-width: 0.8"><title>{esc(e["name"])} · {fr:,} people with French as mother tongue</title></circle>{label}')
    svg = (f'<svg viewBox="0 0 1000 640" width="640" height="410" style="display: block; background: var(--water)"><g style="fill: var(--land); stroke: none">{"".join(outline)}</g>'
           f'<g style="fill: none; stroke: var(--mapink); stroke-width: 0.9; stroke-linejoin: round; opacity: 0.6">{"".join(outline)}</g>{"".join(circles)}</svg>')
    top = sorted(counts.values(), key=lambda c: -c[0])[:3]
    overlay = (f'<div style="position: absolute; top: 10px; left: 12px; display: grid; gap: 6px; padding: 8px 10px; background: rgba(255, 255, 255, 0.92); border: 1px solid var(--line); border-radius: 6px; font-size: 11px; color: var(--ink)">'
               f'<strong style="font-family: {MONO}; font-size: 10.5px; letter-spacing: 0.04em; text-transform: uppercase; color: var(--deep)">French mother tongue · people · by provincial district</strong>'
               f'<div style="display: flex; gap: 10px; align-items: end"><span style="display: inline-flex; gap: 6px; align-items: center"><span style="width: 8px; height: 8px; border-radius: 50%; background: var(--blue); opacity: 0.6"></span>{mx//10:,}</span><span style="display: inline-flex; gap: 6px; align-items: center"><span style="width: 18px; height: 18px; border-radius: 50%; background: var(--blue); opacity: 0.6"></span>{mx//2:,}</span><span style="display: inline-flex; gap: 6px; align-items: center"><span style="width: 30px; height: 30px; border-radius: 50%; background: var(--blue); opacity: 0.6"></span>{mx:,}</span><span style="display: inline-flex; gap: 6px; align-items: center"><span style="width: 7px; height: 7px; border-radius: 50%; border: 1.2px solid var(--blue)"></span>fewer than 20</span></div></div>')
    cap = caption("Language communities as symbols, not fills", f"Proportional circles, area to count, so a 60 km² district is not flooded with colour for a handful of people. Largest: {', '.join(f'{c[1]["name"]} {c[0]:,}' for c in top)}. An Indigenous-languages sub-layer uses the same rule in lichen.",
                  "Mother tongue is not identity, not language at home and not 'Acadian'; the census offers only an Indigenous-languages aggregate, not Mi'kmaw. Small counts of 5 to 15 are within rounding and get a hollow ring.", "Census · rank 7 symbols")
    return census_tile(svg, overlay, cap)


# ================================================================ 5. Representatives
REPS = load("reps_directory_sample.json")["entries"]


def rep_by(level, name_part):
    return next(e for e in REPS if e["level"] == level and name_part in e["name"])


def tidy_phone(t):
    return (t or "").replace(".", "-").replace("(902) ", "902-").replace("(", "").replace(")", "")


def tidy_postal(t):
    return (t or "").replace(", Nova Scotia ", ", NS ").replace(", Nova Scotia", ", NS").replace("Ontario, Canada", "ON")


def rep_card(e, eyebrow_text, party_line=None):
    email = e.get("official_email")
    if email and email.split("@")[-1] in ("gmail.com", "outlook.com", "hotmail.com"):
        email_html = '<span style="color: var(--muted)">personal-domain address; use the link below to the official profile</span>'
    elif email:
        email_html = f'<a href="mailto:{esc(email)}" style="color: var(--blue)">{esc(email)}</a>'
    else:
        email_html = '<span style="color: var(--muted)">none published</span>'
    rows = []
    for o in e.get("offices", []):
        if not o.get("postal") and not o.get("tel"):
            rows.append(f'<div style="font-size: 11.5px; color: var(--muted)">{esc(o.get("label") or o.get("type"))}: {esc(o.get("note") or "")}</div>'); continue
        rows.append(f'<div style="display: grid; grid-template-columns: 96px minmax(0, 1fr); gap: 8px; font-size: 11.5px; line-height: 1.4"><span style="color: var(--muted)">{esc((o.get("label") or o.get("type")).replace("Main office - ", "").replace("Progressive Conservative Caucus Office", "PC caucus").replace("NDP Caucus Office", "NDP caucus"))}</span><span>{esc(tidy_postal(o.get("postal")))}{" · " if o.get("postal") and o.get("tel") else ""}{f"<span style=\"font-family: {MONO}\">{esc(tidy_phone(o.get("tel")))}</span>" if o.get("tel") else ""}</span></div>')
    if e.get("office_phone"):
        rows.append(f'<div style="display: grid; grid-template-columns: 96px minmax(0, 1fr); gap: 8px; font-size: 11.5px; line-height: 1.4"><span style="color: var(--muted)">office</span><span>{esc(tidy_postal(e.get("office_postal")))}{" · " if e.get("office_postal") else ""}<span style="font-family: {MONO}">{esc(tidy_phone(e["office_phone"]))}</span></span></div>')
    if e.get("council"):
        rows.append(f'<div style="font-size: 11.5px; line-height: 1.4; color: var(--muted)">{esc(e["council"])}</div>')
    return (f'<section style="display: grid; gap: 6px; padding: 12px 0; border-top: 1px solid var(--line)">{eyebrow(eyebrow_text)}'
            f'<div style="display: flex; justify-content: space-between; align-items: baseline; gap: 10px"><strong style="font-family: {DISPLAY}; font-size: 19px; font-weight: 700">{esc(e["name"])}</strong><span style="font-size: 12px; color: var(--muted)">{esc(e["role"].split(" (")[0])}</span></div>'
            + (f'<p style="margin: 0; font-size: 11.5px; line-height: 1.4">{party_line}</p>' if party_line else "")
            + f'<div style="display: grid; grid-template-columns: 96px minmax(0, 1fr); gap: 8px; font-size: 11.5px; line-height: 1.4"><span style="color: var(--muted)">e-mail</span><span>{email_html}</span></div>'
            + "".join(rows)
            + f'<div style="display: flex; justify-content: space-between; gap: 10px; align-items: baseline"><a href="{esc(e.get("official_page_url") or "#")}" style="font-size: 11.5px; font-weight: 700; color: var(--blue)">Verify on the official page ↗</a><span style="font-family: {MONO}; font-size: 10px; color: var(--muted)">checked {esc(e.get("checked_date") or "2026-09-12")}</span></div></section>')


def reps_panel(title, where, cards, csap_note):
    return (f'<article style="width: 420px; padding: 20px 24px; color: var(--ink); background: var(--surface); border: 1px solid var(--line); border-radius: 7px; box-shadow: var(--shadow); font-family: {UI}; font-size: 14px">'
            f'{eyebrow("Your representatives · " + where)}<h2 style="margin: 0 0 4px; font-family: {DISPLAY}; font-size: 24px; font-weight: 700; line-height: 1.1">{esc(title)}</h2>'
            f'<p style="margin: 0 0 8px; font-size: 11.5px; line-height: 1.45; color: var(--muted)">Districts found on your device by point-in-polygon; your location never leaves the browser. Directory snapshot checked September 12, 2026.</p>'
            + "".join(cards) + csap_note
            + f'<div style="display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; margin-top: 12px"><a href="#" style="display: inline-flex; min-height: 44px; align-items: center; justify-content: center; padding: 7px; color: var(--ink); font-size: 11.52px; font-weight: 700; text-decoration: none; background: var(--surface); border: 1px solid var(--line); border-radius: 6px">Copy all contacts</a><a href="#" style="display: inline-flex; min-height: 44px; align-items: center; justify-content: center; padding: 7px; color: var(--ink); font-size: 11.52px; font-weight: 700; text-decoration: none; background: var(--surface); border: 1px solid var(--line); border-radius: 6px">Show districts on map</a></div></article>')


def build_representatives():
    mp = rep_by("federal", "Entremont"); mla = rep_by("provincial", "Bowlby"); mayor = rep_by("municipal", "Boyer"); csap = next(e for e in REPS if e["level"] == "school_board")
    a_cards = [
        rep_card(mp, "Federal · Acadie—Annapolis (12001) · MP", 'Elected April 28, 2025 as <strong>Conservative</strong>; sits in the <strong>Liberal</strong> caucus since November 4, 2025 (House of Commons record). Both dates are shown because the election-results layer and this card would otherwise disagree.'),
        rep_card(mla, "Provincial · Annapolis (ED 01) · MLA", 'Progressive Conservative · first elected November 26, 2024 by 8 votes.'),
        rep_card(mayor, "Municipal · Town of Annapolis Royal · Mayor", 'Town council of five, elected at large October 19, 2024. Outside the town limits this card would show the County of Annapolis warden and the district councillor.'),
    ]
    a_csap = (f'<section style="display: grid; gap: 4px; padding: 12px 0; border-top: 1px solid var(--line)">{eyebrow("School board · CSAP · Vallée d\'Annapolis")}'
              f'<div style="display: flex; justify-content: space-between; align-items: baseline; gap: 10px"><strong style="font-family: {DISPLAY}; font-size: 19px">{esc(csap["name"])}</strong><span style="font-size: 12px; color: var(--muted)">conseillère scolaire</span></div>'
              f'<p style="margin: 0; font-size: 11.5px; line-height: 1.4; color: #8c2f27; font-weight: 700">Boundary unverified: CSAP publishes no circonscription polygons, so this assignment is by community name only.</p>'
              f'<div style="display: grid; grid-template-columns: 96px minmax(0, 1fr); gap: 8px; font-size: 11.5px"><span style="color: var(--muted)">e-mail</span><a href="mailto:{esc(csap["official_email"])}" style="color: var(--blue)">{esc(csap["official_email"])}</a></div>'
              f'<a href="{esc(csap["official_page_url"])}" style="width: fit-content; font-size: 11.5px; font-weight: 700; color: var(--blue)">Verify on csap.ca ↗</a></section>')
    mp2 = rep_by("federal", "Miedema"); mla2 = rep_by("provincial", "Hansen"); coun = rep_by("municipal", "Hinch"); mayor2 = rep_by("municipal", "Fillmore")
    h_cards = [
        rep_card(mp2, "Federal · Halifax (12006) · MP", "Liberal · elected April 28, 2025 by 22,947 votes (Elections Canada official results)."),
        rep_card(mla2, "Provincial · Halifax Needham (ED 30) · MLA", "NDP · elected 2021, re-elected 2024."),
        rep_card(coun, "Municipal · HRM District 8 · Halifax Peninsula North · Councillor", "Halifax Regional Council, 2024–2028. District from HRM's open-data polling districts (16), Open Government Licence – Halifax."),
        rep_card(mayor2, "Municipal · Halifax Regional Municipality · Mayor", None),
    ]
    h_csap = (f'<section style="padding: 12px 0; border-top: 1px solid var(--line)">{eyebrow("School board · CSAP · Halifax")}<p style="margin: 0; font-size: 11.5px; color: var(--muted); line-height: 1.4">Two members (Jeff Arsenault, Katherine Howlett) are listed for Halifax; there is no boundary file, so the card links to the list rather than naming one.</p><a href="https://csap.ca/le-csap/gouvernance/conseil" style="width: fit-content; font-size: 11.5px; font-weight: 700; color: var(--blue)">CSAP council list ↗</a></section>')
    notes = (
        f'<div style="display: grid; gap: 10px; align-content: start; width: 420px; font-size: 12.5px; line-height: 1.5; color: var(--ink)">'
        f'<h3 style="margin: 0; font-family: {DISPLAY}; font-size: 20px">How the panel is built</h3>'
        f'<p style="margin: 0"><strong>Lookup happens in the browser.</strong> The map already holds the federal ridings (2023 Representation Order), the 56 provincial districts, HRM and CBRM council districts and the municipal boundaries, so a tapped location resolves to district ids without any request leaving the device. The Open North Represent API could do this in one call but ships the user\'s coordinates to a third party, carries no data licence, and is stale (it still lists the old Inverness map and the MP\'s pre-November party).</p>'
        f'<p style="margin: 0"><strong>The directory is a dated snapshot</strong> generated by a repository script from the official pages: ourcommons.ca member pages, nslegislature.ca profiles (crawl delay 10 s), halifax.ca and cbrm.ns.ca district pages, and each town or county council page for the other 47 municipal units. Every card carries its checked date and a link to verify.</p>'
        f'<p style="margin: 0"><strong>Office channels only.</strong> Several MLAs publish personal-domain addresses as their constituency e-mail; the card points to the profile instead of reproducing them. County councillor and CSAP numbers are published without saying office or home, so they are not shown; the municipal office number is.</p>'
        f'<p style="margin: 0"><strong>Two dates for party.</strong> Party at election lives with the results layer; current caucus lives with the card. Both print with their date, so the record and the present never contradict each other silently.</p>'
        f'<p style="margin: 0; color: var(--muted); font-size: 11.5px">Gaps: no province-wide machine-readable directory of mayors, wardens and councillors exists; municipal polling districts outside HRM and CBRM are 2017-vintage in the provincial file; CSAP circonscriptions have no public polygons.</p></div>')
    body = (f'{helmet()}<div style="{root_style()}; display: flex; gap: 32px; align-items: start; width: 1440px; padding: 32px; box-sizing: border-box; background: var(--fog); font-family: {UI}">'
            f'{reps_panel("Annapolis Royal", "location tapped on the map", a_cards, a_csap)}{reps_panel("North End Halifax", "location tapped on the map", h_cards, h_csap)}{notes}</div>')
    return dc(body)


# ================================================================ 6. Round-two data notes (flowing)
def build_notes():
    mono = f'font-family: {MONO}; font-size: 11.5px'
    def m(s): return f'<code style="{mono}">{esc(s)}</code>'
    census_rows = [
        ["2021 census boundaries (DA, CSD, CT, ADA, and more)", "Statistics Canada ArcGIS REST " + m("geo.statcan.gc.ca/geo_wa/rest/services/2021/Cartographic_boundary_files/MapServer") + " (GeoJSON, outSR=4326, paging, CORS) · national shapefiles 13–197 MB", "NS: 1,670 DAs, 95 CSDs, 108 CTs (Halifax CMA only), 152 ADAs · published 2022-09-21", m("DAUID, DGUID, LANDAREA, PRUID · CSDUID, CSDNAME, CSDTYPE"), "Open Government Licence – Canada (service) / Statistics Canada Open Licence (files)", "Federal ridings on this server are the 2013 order; use Elections Canada's 2023 file. Pre-cut NS extracts should ship with the app so no viewport query leaks location."],
        ["Census Profile 2021 (values)", "SDMX REST " + m("api.statcan.gc.ca/census-recensement/profile/sdmx/rest/data/STC_CP,DF_DA/A5.<DGUID>.1.<CHAR>.1?format=csv") + " · also the Atlantic CSV (190 MB zip)", "DA, CSD, FED dataflows; 88 DAs × 38 characteristics in 9 s", "ids 1–7 population/dwellings; 40 median age; 50/51/56 households; 229 income; 379/383/385 mother tongue; 1400–1402 tenure; 1426–1434 period of construction; 2603–2610 commuting", "Statistics Canada Open Licence: 'Adapted from Statistics Canada, Census Profile, 2021 Census of Population…'", "Suppressed when population < 40 (flag x); income needs 250 people or 40 households; every count randomly rounded to 5. Guide asks not to bulk-download dataflows: prefer an offline extract."],
        ["Census by provincial electoral district", "GeoNOVA " + m("BND_Electoral_District_Profiles_UT83") + " table 0 (56 rows)", "2021 Census aggregated to the 2026 districts by Elections NS", "population, dwellings, gender, mother tongue × official-language knowledge, 18+", "Copyright Elections Nova Scotia; no licence text", "Gives the province-zoom rung for homes and mother tongue today; not for any other measure."],
    ]
    poll_rows = [
        ["Provincial poll-by-poll 2024", "Elections NS " + m("42PGE_PollbyPoll_AllEDs_TurnOut_FINAL.xlsx") + " (55 sheets) joined to GeoNOVA polling divisions (layer 3)", "Annapolis: all 37 division polygons match a 2024 poll number; Inverness 0 of 33 (renumbered April 2026)", "poll, location, electors, votes per candidate, rejected, declined", "No licence text on workbook or service", "45% of Annapolis ballots have no map location (advance, returning office, write-in). The delisted but still-live January 2021 division file carries the numbering used in 2024 and would settle Inverness."],
        ["Federal poll-by-poll 2025", "Elections Canada " + m("PollingDivisionBoundaries_2025_KMZ.zip") + " (NS in " + m("PD_PE-NS-NB_2025_EN.kmz") + ") + " + m("pollresults_resultatsbureau12001.csv"), "203 of 203 Acadie—Annapolis divisions join; 179 of 179 Halifax", m("PD_NUM, PD_NBR_SFX, PD_TYPE N/S/M, FED_NUM, ADV_POLL_NUM"), "Elections Canada terms (OGL confirmed only for the district file)", "Advance and special ballots are 47% of valid votes and have no division; 'combined with' polls carry electors but no votes."],
        ["General election results 2003–2024", "GeoNOVA " + m("BND_GeneralElectionResults_UT83") + " layers 1–7 + turnout table", "52 / 52 / 52 / 51 / 51 / 55 / 55 districts, each year on its own boundaries", "MLA, party, votes by party, rejected, declined, total, turnout", "Copyright Elections Nova Scotia", "2003 minor-party columns unreliable; 2013 and 2017 are different digitisations of the same boundaries; 'Total' changes meaning by year, so use the sum of party votes."],
    ]
    rep_rows = [
        ["Members of Parliament", m("ourcommons.ca/members/en/search/xml") + " (338 sitting members on September 12, 2026; no contact fields) + per-member pages (offices)", "11 NS members; caucus changes carry dates", "PersonId, name, constituency, caucus, from/to dates", "House of Commons copyright; Speaker's Permission excludes commercial use", "Contact details only on HTML pages; treat as a periodic scrape with a checked date."],
        ["MLAs", m("nslegislature.ca/members/profiles") + " (56 rows) + profile pages", "All 56 incl. Chéticamp-Margarees-Pleasant Bay (by-election June 23, 2026)", "constituency office civic and mailing address, phone, e-mail, caucus office", "Website copyright; robots crawl-delay 10", "Several constituency e-mails are personal-domain addresses; link rather than reproduce."],
        ["Councillors and mayors", "halifax.ca district pages and HRM open-data polling districts; cbrm.ns.ca district pages; each of the other 47 units' council pages; NSFM regional lists (names only)", "HRM 16 districts + mayor; CBRM 12 + mayor; Annapolis County 11; Annapolis Royal at large", "name, district, office phone, e-mail where published", "OGL-Halifax for HRM polygons; website copyright elsewhere", "No province-wide machine-readable directory exists. Rural polling districts in the provincial file are 2017 vintage."],
        ["Open North Represent API", m("represent.opennorth.ca/representatives/?point=lat,lon"), "MP, MLA, HRM and CBRM council for a point", "name, party, district, email, url, offices", "None published; 60 requests/minute", "Not for runtime use: sends location to a third party, no licence, stale (old Inverness map, pre-November party). Useful only as a cross-check when building the snapshot."],
    ]
    def section(title, rows):
        return f'<h2 style="margin: 24px 0 4px; font-family: {DISPLAY}; font-size: 22px">{title}</h2>{g.table(["Dataset", "Publisher and delivery", "Coverage and vintage", "Key fields", "Licence", "Caveats"], rows)}'
    body = (
        f'{helmet()}<article style="{root_style()}; width: 880px; padding: 40px 48px 48px; color: var(--ink); background: var(--surface); font-family: {UI}; font-size: 14px; line-height: 1.5">'
        f'{eyebrow("Round two · census, poll level, representatives · checked September 12, 2026")}'
        f'<h1 style="margin: 0 0 10px; font-family: {DISPLAY}; font-size: 34px; font-weight: 700; line-height: 1.08">Data notes for the census theme, poll-level maps and representatives</h1>'
        f'<p style="margin: 0 0 20px; font-size: 15px; color: var(--muted)">Every dataset here was queried live by five research agents; gaps are marked as gaps. The census theme is a separate map setup from the electoral one, and the two share the provincial district polygons as their province-zoom rung.</p>'
        f'{section("Census", census_rows)}{section("Poll level and history", poll_rows)}{section("Representatives", rep_rows)}'
        f'<h2 style="margin: 24px 0 8px; font-family: {DISPLAY}; font-size: 22px">Rules the new boards follow</h2>'
        f'<ul style="margin: 0 0 20px; padding-left: 20px; display: grid; gap: 6px">'
        f'<li>A dissemination-area value describes an area on census day, never a parcel, a dwelling or its occupants; the inspector says so on every profile.</li>'
        f'<li>Suppressed, not-applicable and not-comparable are three distinct hatch states, never the lightest class; suppressed cells are never backed out by subtraction.</li>'
        f'<li>Income stays a row in the profile card, never a wash; mother tongue and Indigenous languages are symbols, never fills, and carry the census label verbatim.</li>'
        f'<li>Poll-level maps always show the unmapped-ballot ledger beside the map, because advance and special ballots ran from 33% to 53% of votes across the four districts examined and reversed the visible pattern in Annapolis.</li>'
        f'<li>Institutional polls (care homes, hospitals) draw as unlabelled squares; their counts are not printed on the map.</li>'
        f'<li>Representatives: office channels only, a checked date on every card, party at election and current caucus both dated, and no third-party lookup at runtime.</li>'
        f'</ul>'
        f'<h2 style="margin: 24px 0 8px; font-family: {DISPLAY}; font-size: 22px">Open questions</h2>'
        f'<ul style="margin: 0; padding-left: 20px; display: grid; gap: 6px">'
        f'<li>Ship province-wide DA values as a pre-cut file (about 1,670 DAs) built offline from the Atlantic CSV, or fetch per viewport? The privacy contract favours the pre-cut file.</li>'
        f'<li>Confirm redistribution terms with Elections Nova Scotia for the polling-division polygons and the poll-by-poll workbooks, and with GeoNOVA for the district and results services.</li>'
        f'<li>Which municipalities beyond HRM and CBRM get councillor-by-district cards, given 2017-vintage district polygons? Head-of-council only may be the honest first release.</li>'
        f'<li>Federal advance-poll layer (dissolve on advance-poll number) in the first cut or later?</li>'
        f'</ul></article>')
    return dc(body)


# ================================================================ canvas.json with pages
def build_canvas():
    base = g.build_canvas()
    for a in base["artboards"]:
        a["page"] = "page-elections"
    for n in base["annotations"]:
        n["page"] = "page-elections"
    base["artboards"] += [
        {"file": "ResultsOverTime.dc.html", "x": 0, "y": 3800, "w": 1440, "h": 560, "page": "page-elections", "title": "Results over time · 2003–2024"},
        {"file": "Swing.dc.html", "x": 1520, "y": 3800, "w": 640, "h": 610, "page": "page-elections", "title": "Swing 2021 → 2024"},
        {"file": "PollsProvincial.dc.html", "x": 0, "y": 0, "w": 1440, "h": 720, "page": "page-polls", "title": "Provincial poll by poll · Annapolis 2024"},
        {"file": "PollsFederal.dc.html", "x": 0, "y": 880, "w": 1440, "h": 720, "page": "page-polls", "title": "Federal poll by poll · Acadie—Annapolis 2025"},
        {"file": "CensusMain.dc.html", "x": 0, "y": 0, "w": 1440, "h": 900, "page": "page-census", "title": "People & Housing · desktop"},
        {"file": "CensusHomes.dc.html", "x": 0, "y": 1080, "w": 640, "h": 610, "page": "page-census", "title": "Census 1 · Homes not lived in year-round"},
        {"file": "CensusChange.dc.html", "x": 720, "y": 1080, "w": 640, "h": 610, "page": "page-census", "title": "Census 3 · Population change"},
        {"file": "CensusEras.dc.html", "x": 1440, "y": 1080, "w": 640, "h": 610, "page": "page-census", "title": "Census 4 · Period of construction"},
        {"file": "CensusLanguage.dc.html", "x": 2160, "y": 1080, "w": 640, "h": 610, "page": "page-census", "title": "Census 7 · Mother tongue"},
        {"file": "CensusProfile.dc.html", "x": 0, "y": 1830, "w": 390, "h": 900, "page": "page-census", "title": "Neighbourhood profile card"},
        {"file": "Representatives.dc.html", "x": 0, "y": 0, "w": 1440, "h": 1180, "page": "page-reps", "title": "Your representatives"},
        {"file": "RoundTwoNotes.dc.html", "x": 0, "y": 1320, "w": 880, "h": 1750, "page": "page-reps", "print": "flow", "title": "Round-two data notes"},
    ]
    base["annotations"] += [
        {"id": "note-history", "x": 2240, "y": 3800, "w": 320, "page": "page-elections", "text": "Round two, on this page: results over time and the 2021→2024 swing. Direction A now draws each level in its own ink and Direction B's wash renders (it had been bound to its tweak in a way the runtime ignored)."},
        {"id": "note-polls", "x": 1520, "y": 0, "w": 320, "page": "page-polls", "text": "Poll by poll, both levels.\n\nProvincial 2024 joins cleanly to the 2020-release divisions (in force for that election) for 54 of 56 districts; Inverness was renumbered in 2026 and cannot be shaded from 2024 numbers.\n\nFederal 2025 joins 203 of 203 divisions exactly.\n\nThe ledger beside each map is not optional: in Annapolis the unmapped ballots reversed what the polls show."},
        {"id": "note-census", "x": 1540, "y": 0, "w": 320, "page": "page-census", "text": "People & Housing is its own map setup, not a sub-theme of Elections; the two share the provincial-district polygons as their province-zoom rung.\n\nThe main board shows the top-ranked wash (homes not lived in year-round) at county zoom with the inspector profile for one dissemination area. The four tiles below: the same measure at province scale, a diverging map, an ink-tint map, and proportional symbols.\n\nAll DA values here are real 2021 Census Profile values for the Annapolis area; the province-wide file is the first implementation step."},
        {"id": "note-reps", "x": 1520, "y": 0, "w": 320, "page": "page-reps", "text": "Representatives at every level for a tapped location, resolved on the device. Two sample locations: a town (Annapolis Royal) and an HRM district (North End Halifax).\n\nEvery contact on these cards was read from the official page on September 12, 2026. Personal-domain e-mails are linked, not printed."},
    ]
    base["pages"] = [
        {"id": "page-elections", "name": "Elections"},
        {"id": "page-polls", "name": "Poll level"},
        {"id": "page-census", "name": "People & Housing"},
        {"id": "page-reps", "name": "Representatives"},
    ]
    base["launch"] = {"view": "canvas", "page": "page-census"}
    return base


if __name__ == "__main__":
    files = {
        "ResultsOverTime.dc.html": build_results_over_time(),
        "Swing.dc.html": build_swing(),
        "PollsProvincial.dc.html": build_polls_provincial(),
        "PollsFederal.dc.html": build_polls_federal(),
        "CensusMain.dc.html": build_census_main(),
        "CensusHomes.dc.html": build_census_homes(),
        "CensusChange.dc.html": build_census_change(),
        "CensusEras.dc.html": build_census_eras(),
        "CensusLanguage.dc.html": build_census_language(),
        "CensusProfile.dc.html": build_census_profile(),
        "Representatives.dc.html": build_representatives(),
        "RoundTwoNotes.dc.html": build_notes(),
    }
    for name, content in files.items():
        with open(os.path.join(HERE, name), "w") as f:
            f.write(content)
        print(f"{name}: {len(content.encode('utf-8'))/1024:.0f} KB")
    with open(os.path.join(HERE, "canvas.json"), "w") as f:
        json.dump(build_canvas(), f, indent=2)
    print("canvas.json (pages) written")
