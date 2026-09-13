"""Generate the Electoral Map Theme design canvas artboards from the official geometries.

Outputs (in this directory): Main.dc.html, DirectionA.dc.html, DirectionB.dc.html,
DirectionC.dc.html, Inspector.dc.html, Mobile.dc.html, DataInventory.dc.html, canvas.json.
Every value below is lifted from web/src/styles.css and web/src/atlas/palette.ts.
"""
import json, os, html

HERE = os.path.dirname(os.path.abspath(__file__))
GEO = json.load(open(os.path.join(HERE, "..", "geo", "paths.json")))
VW, VH = GEO["view"]

# ---------------------------------------------------------------- tokens (exact app values)
DAY = {
    "ink": "#12343b", "bg": "#eef7f5", "surface": "#ffffff", "paper": "#fbf6ea", "fog": "#eef7f5",
    "line": "rgba(18, 52, 59, 0.18)", "muted": "rgba(18, 52, 59, 0.68)", "tint": "#f3f8ff",
    "blue": "#1e66cc", "deep": "#0a4f5c", "red": "#be4d3c", "lichen": "#5a7343", "peach": "#e7a86b",
    "shadow": "0 18px 50px rgba(18, 52, 59, 0.2)", "rowline": "rgba(18, 52, 59, 0.12)",
    "switch": "#718087", "metabg": "rgba(238, 247, 245, 0.75)", "metaline": "rgba(18, 52, 59, 0.22)",
    "pillbg": "rgba(18, 52, 59, 0.1)", "readybg": "#e1f2dc", "readyfg": "#24551d", "zoombg": "#e1edff", "zoomfg": "#234e87",
    "land": "#f3efe3", "water": "#b5ced1", "waterline": "#7babb5", "wood": "#d5dfca", "mapink": "#304746", "boundary": "#9f9b8b",
    "pc": "#1e66cc", "lib": "#be4d3c", "ndp": "#d98f1a", "grn": "#3f8a3a", "ind": "#718087",
    "seq1": "#e6eff1", "seq2": "#c3d8dd", "seq3": "#93b9c3", "seq4": "#5f92a0", "seq5": "#316d7c",
    "labelhalo": "#f3efe3",
}
NIGHT = {
    "ink": "#e8f1f0", "bg": "#0d1f24", "surface": "#1b3940", "paper": "#152b31", "fog": "#0d1f24",
    "line": "rgba(232, 241, 240, 0.22)", "muted": "rgba(232, 241, 240, 0.72)", "tint": "#16303c",
    "blue": "#8cc0ff", "deep": "#9fd6e2", "red": "#f08b78", "lichen": "#a9c98a", "peach": "#efbb87",
    "shadow": "0 18px 50px rgba(0, 0, 0, 0.55)", "rowline": "rgba(232, 241, 240, 0.12)",
    "switch": "#718087", "metabg": "rgba(13, 31, 36, 0.75)", "metaline": "rgba(232, 241, 240, 0.22)",
    "pillbg": "rgba(232, 241, 240, 0.1)", "readybg": "#e1f2dc", "readyfg": "#24551d", "zoombg": "#e1edff", "zoomfg": "#234e87",
    "land": "#223338", "water": "#101f2b", "waterline": "#395864", "wood": "#293f3c", "mapink": "#e5e5d6", "boundary": "#75807b",
    "pc": "#3f86e0", "lib": "#d24b3a", "ndp": "#bb8a26", "grn": "#5aa040", "ind": "#8a979c",
    "seq1": "#1d3a42", "seq2": "#2a5a66", "seq3": "#3f7f8e", "seq4": "#6fb0c0", "seq5": "#9fd6e2",
    "labelhalo": "#223338",
}
TOKEN_KEYS = list(DAY.keys())

FONT_LINK = ('<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,600;9..144,700'
             '&amp;family=IBM+Plex+Mono:wght@500;600&amp;family=Inter:wght@400;500;600;700;800&amp;display=swap">')
UI = "'Inter', ui-sans-serif, system-ui, sans-serif"
DISPLAY = "'Fraunces', Georgia, serif"
MONO = "'IBM Plex Mono', Menlo, ui-monospace, monospace"

PARTY_TOKEN = {"PC": "pc", "Liberal": "lib", "NDP": "ndp", "Green": "grn", "Independent": "ind"}
PARTY_LABEL = {"PC": "Progressive Conservative", "Liberal": "Liberal", "NDP": "NDP", "Green": "Green", "Independent": "Independent"}


def esc(s):
    return html.escape(str(s), quote=True)


def token_style(t):
    """One inline style declaring every token as a CSS custom property."""
    return "; ".join(f"--{k}: {v}" for k, v in t.items())


def token_style_holes():
    return "; ".join(f"--{k}: {{{{t.{k}}}}}" for k in TOKEN_KEYS)


# ---------------------------------------------------------------- map drawing
def seq_token(margin):
    if margin is None:
        return "ind"
    if margin < 5:
        return "seq1"
    if margin < 15:
        return "seq2"
    if margin < 30:
        return "seq3"
    if margin < 50:
        return "seq4"
    return "seq5"


def turnout_token(turnout):
    if turnout < 40:
        return "seq1"
    if turnout < 45:
        return "seq2"
    if turnout < 50:
        return "seq3"
    if turnout < 55:
        return "seq4"
    return "seq5"


LABEL_PICK = {"01": "Annapolis", "34": "Inverness", "46": "Richmond", "09": "Clare", "03": "Argyle", "42": "Pictou East",
              "16": "Cumberland South", "25": "Guysborough-Tracadie", "53": "Victoria-The Lakes", "22": "Eastern Shore",
              "38": "Lunenburg", "45": "Queens", "49": "Shelburne", "20": "Digby-Annapolis", "37": "Kings West",
              "12": "Colchester North", "32": "Hants East", "07": "Cape Breton East"}


def svg_map(mode, labels=True, width=None, height=None, fed=True, mun=False, wash=0.0, selected=None,
            label_scale=1.0, extra="", level_colours=False):
    """mode: lines | winner | margin | turnout. level_colours: provincial lines in survey blue, municipal in lichen."""
    prov_stroke = "var(--blue)" if level_colours else "var(--mapink)"
    mun_stroke = "var(--lichen)" if level_colours else "var(--mapink)"
    w = width or VW
    h = height or VH
    parts = [f'<svg viewBox="0 0 {VW} {VH}" width="{w}" height="{h}" role="img" aria-label="Nova Scotia electoral districts" '
             f'style="display: block; width: {w}px; height: {h}px; background: var(--water); overflow: hidden">']
    # land mass (union of 2026 districts)
    parts.append('<g style="fill: var(--land); stroke: var(--waterline); stroke-width: 0.9; stroke-linejoin: round">')
    for e in GEO["ed2026"]:
        parts.append(f'<path d="{e["d"]}"></path>')
    parts.append("</g>")
    # results washes (2024 boundaries)
    if mode in ("winner", "margin", "turnout"):
        op = wash if mode == "winner" else 0.85
        parts.append(f'<g opacity="{op}" style="stroke: none">')
        for r in GEO["results2024"]:
            if mode == "winner":
                tok = PARTY_TOKEN[r["winner"]]
            elif mode == "margin":
                tok = seq_token(r["margin_pct"])
            else:
                tok = turnout_token(r["turnout"])
            parts.append(f'<path d="{r["d"]}" style="fill: var(--{tok})"><title>{esc(r["name"])} · {esc(r["mla"])} ({esc(r["winner"])})</title></path>')
        parts.append("</g>")
    # municipal polling districts (fine dashed)
    if mun:
        parts.append(f'<g style="fill: none; stroke: {mun_stroke}; stroke-width: {0.8 if level_colours else 0.55}; stroke-dasharray: 2.4 1.6; opacity: {0.9 if level_colours else 0.75}; stroke-linejoin: round">')
        for m in GEO["munpd"]:
            parts.append(f'<path d="{m["d"]}"></path>')
        parts.append("</g>")
    # provincial districts
    src = GEO["ed2026"] if mode == "lines" else GEO["results2024"]
    parts.append(f'<g style="fill: none; stroke: {prov_stroke}; stroke-width: {1.4 if level_colours else 1.15}; stroke-linejoin: round; stroke-linecap: round">')
    for e in src:
        parts.append(f'<path d="{e["d"]}"></path>')
    parts.append("</g>")
    # federal ridings (heavy, cased)
    if fed and GEO.get("fed2025"):
        parts.append('<g style="fill: none; stroke: var(--land); stroke-width: 4.2; stroke-linejoin: round; opacity: 0.9">')
        for f in GEO["fed2025"]:
            parts.append(f'<path d="{f["d"]}"></path>')
        parts.append("</g>")
        parts.append('<g style="fill: none; stroke: var(--deep); stroke-width: 2.1; stroke-linejoin: round; stroke-dasharray: 9 3.5">')
        for f in GEO["fed2025"]:
            parts.append(f'<path d="{f["d"]}"></path>')
        parts.append("</g>")
    if selected:
        sel = next((e for e in src if e["id"] == selected), None)
        if sel:
            parts.append(f'<path d="{sel["d"]}" style="fill: var(--blue); fill-opacity: 0.14; stroke: var(--blue); stroke-width: 2.6; stroke-linejoin: round"></path>')
    if labels:
        fs = round(11.5 * label_scale, 1)
        parts.append(f'<g style="font-family: {UI}; font-size: {fs}px; font-weight: 600; fill: var(--mapink); letter-spacing: 0.01em; text-anchor: middle; paint-order: stroke; stroke: var(--labelhalo); stroke-width: 3px; stroke-linejoin: round">')
        for e in src:
            if e["id"] in LABEL_PICK and e["area"] > 400:
                parts.append(f'<text x="{e["cx"]}" y="{e["cy"] + 4}">{esc(e["name"])}</text>')
        parts.append("</g>")
    parts.append(extra)
    parts.append("</svg>")
    return "".join(parts)


# ---------------------------------------------------------------- shared UI fragments
SEARCH_ICON = ('<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">'
               '<circle cx="11" cy="11" r="6.5"></circle><path d="M16 16l4.5 4.5"></path></svg>')
LOCATE_ICON = ('<svg viewBox="0 0 24 24" width="25" height="25" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
               '<circle cx="12" cy="12" r="6"></circle><circle cx="12" cy="12" r="1.6"></circle><path d="M12 2v4M12 18v4M2 12h4M18 12h4"></path></svg>')
RULER_ICON = ('<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" aria-hidden="true">'
              '<path d="M3 17L17 3l4 4L7 21z"></path><path d="M7 13l2 2M10 10l2 2M13 7l2 2"></path></svg>')
AREA_ICON = ('<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" stroke-dasharray="3 2" aria-hidden="true">'
             '<path d="M6 4l12 2 2 10-8 5-8-6z"></path></svg>')


def switch(on):
    knob_tx = "17px" if on else "0"
    bg = "var(--blue)" if on else "var(--switch)"
    return (f'<span style="position: relative; display: inline-block; width: 40px; height: 23px; background: {bg}; border-radius: 999px; flex: 0 0 40px">'
            f'<span style="position: absolute; top: 3px; left: 3px; width: 17px; height: 17px; background: var(--surface); border-radius: 50%; '
            f'box-shadow: 0 1px 4px rgba(18, 52, 59, 0.35); transform: translateX({knob_tx})"></span></span>')


def pill(text, kind="ready"):
    bg = "var(--readybg)" if kind == "ready" else "var(--zoombg)"
    fg = "var(--readyfg)" if kind == "ready" else "var(--zoomfg)"
    return (f'<span style="display: inline-block; width: fit-content; padding: 2px 5px; color: {fg}; font-size: 11.2px; font-weight: 800; '
            f'background: {bg}; border-radius: 999px">{esc(text)}</span>')


def layer_row(name, caveat, on, meta=None, extra=""):
    pill_html = pill(meta[0], meta[1]) if meta else ""
    metadata = ""
    if meta:
        metadata = (f'<span style="display: grid; gap: 2px; margin: 4px 0 7px; padding: 6px 7px; color: var(--muted); background: var(--metabg); '
                    f'border-left: 2px solid var(--metaline); border-radius: 0 4px 4px 0">{pill_html}'
                    f'<span style="display: inline-flex; min-height: 24px; align-items: center; font-size: 11.2px">Source &amp; scale</span></span>')
    return (f'<label style="position: relative; display: grid; grid-template-columns: 42px minmax(0, 1fr); align-items: center; gap: 12px; min-height: 59px; '
            f'cursor: pointer; border-top: 1px solid var(--rowline)">{switch(on)}'
            f'<span style="display: grid; gap: 3px; padding: 8px 0"><strong style="font-size: 14.08px; font-weight: 700">{esc(name)}</strong>'
            f'<small style="color: var(--lichen); font-size: 11.68px; line-height: 1.35">{esc(caveat)}</small>{metadata}{extra}</span></label>')


def group_heading(text):
    return (f'<p style="margin: 14px 0 2px; padding: 0 0 0 54px; color: var(--muted); font-family: {MONO}; font-size: 11.5px; font-weight: 600; '
            f'letter-spacing: 0.08em; text-transform: uppercase">{esc(text)}</p>')


def legend(items):
    lis = "".join(
        f'<li style="display: inline-flex; gap: 5px; align-items: center"><span style="display: inline-block; width: 12px; height: 10px; '
        f'background: var(--{tok}); border: 1px solid rgba(0, 0, 0, 0.35); border-radius: 2px"></span>{esc(label)}</li>'
        for tok, label in items)
    return (f'<ul style="display: flex; flex-wrap: wrap; gap: 4px 10px; margin: 5px 0 0; padding: 0 0 0 54px; list-style: none; font-size: 10.88px; color: var(--muted)">{lis}</ul>')


def results_mode_control(selected="Winning party"):
    opts = "".join(f'<option{" selected" if o == selected else ""}>{o}</option>' for o in ("Winning party", "Margin of victory", "Turnout"))
    return (f'<label style="display: grid; gap: 6px; padding: 0 12px 4px 54px; color: var(--muted); font-size: 11px">Show results as'
            f'<select style="min-height: 40px; padding: 7px; color: var(--ink); font: inherit; font-size: 12px; background: var(--surface); border: 1px solid var(--line); border-radius: 5px">{opts}</select></label>')


def category_heading(name, summary, expanded):
    glyph = "−" if expanded else "+"
    return (f'<h3 style="margin: 0"><button type="button" style="display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 8px 12px; width: 100%; '
            f'min-height: 56px; padding: 8px 4px; color: var(--ink); font: inherit; font-size: 14.08px; font-weight: 800; text-align: left; background: transparent; border: 0; cursor: pointer">'
            f'<span>{esc(name)}</span><span style="grid-column: 2; grid-row: 1 / span 2; color: var(--lichen); font-size: 20px; font-weight: 400">{glyph}</span>'
            f'<span style="grid-column: 1; color: var(--muted); font-size: 11.2px; font-weight: 600">{esc(summary)}</span></button></h3>')


def elections_category_rows(compact=False):
    rows = [
        group_heading("Provincial · Elections Nova Scotia"),
        layer_row("Electoral districts (2026)", "56 districts · House of Assembly Act as amended 2026 · not a survey", True, ("Ready · 56 districts", "ready")),
        layer_row("Polling divisions (March 2026)", "1,817 divisions · zoom 12+", False, ("Zoom in to 12", "zoom")),
        layer_row("2024 general election results", "55 districts on their 2024 boundaries · official counts", True, ("Ready · 55 districts", "ready"),
                  results_mode_control() + legend([("pc", "PC"), ("lib", "Liberal"), ("ndp", "NDP"), ("ind", "Independent")])),
        layer_row("Current seats (to June 23, 2026)", "Party of each MLA incl. by-elections and floor crossings", False),
    ]
    if not compact:
        rows += [
            group_heading("Federal · Elections Canada"),
            layer_row("Federal ridings (2023 Representation Order)", "11 ridings · as used April 28, 2025 · Open Government Licence – Canada", True, ("Ready · 11 ridings", "ready")),
            layer_row("Federal polling divisions (2025)", "zoom 12+ · join key for poll-by-poll results", False, ("Zoom in to 12", "zoom")),
            group_heading("Municipal · Province & municipalities"),
            layer_row("Municipal polling districts", "49 municipalities · 238 districts · from NSUARB descriptions · vet with the municipality", False),
            layer_row("HRM council districts (2024)", "16 districts · Open Government Licence – Halifax", False),
        ]
    return "".join(rows)


def collapsed_categories(skip=None):
    cats = [("Background Maps", "1 on"), ("Land & Property", "Off"), ("Roads & Places", "Off"), ("Water & Terrain", "Off"),
            ("Environment & Hazards", "Off"), ("Forestry & Ecology", "Off"), ("Geology & Resources", "Off"), ("Historical Maps", "Off"),
            ("Tax Sale", "Off"), ("My Maps", "Off")]
    out = []
    for name, summary in cats:
        out.append(f'<section style="border-top: 1px solid var(--line)">{category_heading(name, summary, False)}</section>')
    return "".join(out)


def vote_bars(r, surface_var="--surface"):
    valid = sum(r["votes"].values())
    order = ["PC", "Liberal", "NDP", "Green", "Independent"]
    rows = []
    for p in order:
        v = r["votes"][p]
        if v == 0:
            continue
        pct = 100 * v / valid
        rows.append(
            f'<div style="display: grid; grid-template-columns: 70px minmax(0, 1fr) 100px; align-items: center; gap: 8px; min-height: 22px">'
            f'<span style="font-size: 12.5px; font-weight: 600">{esc(PARTY_LABEL[p] if p != "PC" else "PC")}</span>'
            f'<span style="display: block; height: 14px; background: var(--fog); border-radius: 0 4px 4px 0"><span style="display: block; width: {pct:.1f}%; height: 14px; background: var(--{PARTY_TOKEN[p]}); border-radius: 0 4px 4px 0"></span></span>'
            f'<span style="font-family: {MONO}; font-size: 12px; text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums">{v:,} · {pct:.0f}%</span></div>')
    return '<div style="display: grid; gap: 6px; margin: 12px 0 4px">' + "".join(rows) + "</div>"


def inspector_card(r, standalone=False, width=390, compact=False):
    margin_votes = r["votes"][r["winner"]] - r["votes"][r["second"]]
    pos = "" if standalone else "position: absolute; right: 16px; bottom: 18px; max-height: calc(100% - 36px); overflow: hidden; "
    details = "" if compact else (
        f'<p style="margin: 6px 0 0; color: rgba(18, 52, 59, 0.68); font-size: 11.52px; line-height: 1.45">2026 map: only Inverness was divided; Annapolis keeps its number and name. Results stay attached to the boundaries they were counted on.</p>'
        f'<details style="margin: 4px 0 0"><summary style="display: inline-flex; min-height: 24px; align-items: center; gap: 4px; color: rgba(18, 52, 59, 0.68); font-size: 11.52px; font-weight: 600; cursor: pointer">▸ What this is not</summary>'
        f'<p style="margin: 4px 0 0; color: rgba(18, 52, 59, 0.68); font-size: 11.52px; line-height: 1.45">Not poll-level: poll-by-poll counts are a separate Elections NS spreadsheet. Not the current member if a by-election or resignation followed.</p></details>')
    note = "" if compact else f'<p style="margin: 0 0 12px; color: var(--muted); font-size: 11.52px; line-height: 1.45">{sum(r["votes"].values()):,} valid votes · rejected {r["rejected"]} · declined {r["declined"]} · {r["total"]:,} ballots cast. Party colours are conventional; the name beside each bar carries identity.</p>'
    return (
        f'<article style="{pos}width: {width}px; padding: 24px; color: var(--ink); background: var(--surface); border: 1px solid var(--line); border-radius: 7px; box-shadow: var(--shadow); font-family: {UI}; font-size: 14px">'
        f'<div style="display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; margin: 0 -24px 16px; padding: 0 14px 12px 24px; border-bottom: 1px solid var(--line)">'
        f'<div><p style="margin: 0 0 4px; color: var(--deep); font-family: {MONO}; font-size: 11.2px; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase">Provincial electoral district · ED {esc(r["id"])}</p>'
        f'<h2 style="margin: 0; font-family: {DISPLAY}; font-size: 28px; font-weight: 700; line-height: 1.08">{esc(r["name"])}</h2></div>'
        f'<button type="button" aria-label="Close" style="display: grid; flex: 0 0 44px; width: 44px; height: 44px; place-items: center; padding: 0; color: var(--ink); font-size: 32px; line-height: 1; background: none; border: 0; cursor: pointer">×</button></div>'
        f'<p style="width: fit-content; margin: -8px 0 14px; padding: 4px 8px; color: #49336f; font-family: {MONO}; font-size: 10.56px; font-weight: 800; background: #eee7f9; border: 1px solid rgba(90, 67, 133, 0.35); border-radius: 999px">2024 general election · 2024 boundaries</p>'
        f'<dl style="margin: 0; padding: 14px 0; border-top: 1px solid var(--line); border-bottom: 1px solid var(--line)">'
        f'<div style="display: flex; justify-content: space-between; gap: 24px; padding: 5px 0; font-family: {MONO}; font-size: 13.76px"><dt>MLA elected</dt><dd style="max-width: 60%; margin: 0; font-family: {UI}; text-align: left">{esc(r["mla"])} · {esc(r["winner"])}</dd></div>'
        f'<div style="display: flex; justify-content: space-between; gap: 24px; padding: 5px 0; font-family: {MONO}; font-size: 13.76px"><dt>Margin</dt><dd style="margin: 0; text-align: right">{margin_votes:,} votes · {r["margin_pct"]:.1f} pts</dd></div>'
        f'<div style="display: flex; justify-content: space-between; gap: 24px; padding: 5px 0; font-family: {MONO}; font-size: 13.76px"><dt>Turnout</dt><dd style="margin: 0; text-align: right">{r["turnout"]:.1f}% of 16,038 electors</dd></div>'
        f'<div style="display: flex; justify-content: space-between; gap: 24px; padding: 5px 0; font-family: {MONO}; font-size: 13.76px"><dt>Voting locations</dt><dd style="margin: 0; text-align: right">28</dd></div>'
        f'</dl>'
        f'<h3 style="margin: 14px 0 0; font-size: 14.4px">Votes by party <span style="color: var(--muted); font-size: 11.52px; font-weight: 600">· share of valid votes</span></h3>{vote_bars(r)}{note}'
        f'<section style="margin: {"10px 0 0" if compact else "16px 0"}; padding: 14px; background: #f5f9f5; border: 1px solid rgba(46, 112, 76, 0.3); border-radius: 6px; color: #12343b">'
        f'<h3 style="margin: 0 0 8px; color: #245d3d; font-size: 14.4px">Evidence</h3>'
        f'<p style="margin: 0; color: rgba(18, 52, 59, 0.68); font-size: 11.52px; line-height: 1.45">Official counts: Elections Nova Scotia, served by GeoNOVA (BND_GeneralElectionResults_UT83, 2024 layer) · checked September 12, 2026.</p>'
        f'{details}'
        f'</section>'
        f'<div style="display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; margin-top: 9px">'
        f'<a href="#" style="display: inline-flex; min-height: 44px; align-items: center; justify-content: center; padding: 7px; color: var(--ink); font-size: 11.52px; font-weight: 700; text-decoration: none; background: var(--surface); border: 1px solid var(--line); border-radius: 6px">Official results (Elections NS)</a>'
        f'<a href="#" style="display: inline-flex; min-height: 44px; align-items: center; justify-content: center; padding: 7px; color: var(--ink); font-size: 11.52px; font-weight: 700; text-decoration: none; background: var(--surface); border: 1px solid var(--line); border-radius: 6px">Poll-by-poll spreadsheet</a>'
        f'</div></article>')


def helmet(extra_css=""):
    return (f'<helmet>{FONT_LINK}<style>body {{ margin: 0; font-family: {UI}; -webkit-font-smoothing: antialiased; }} '
            f'a {{ color: #1e66cc; }} a:hover {{ color: #0a4f5c; }} ::selection {{ background: rgba(30, 102, 204, 0.18); }} {extra_css}</style></helmet>')


def dc(body, script=None):
    head = '<!doctype html>\n<html>\n<head>\n  <meta charset="utf-8">\n  <script src="./support.js"></script>\n</head>\n<body>\n<x-dc>\n'
    tail = '\n</x-dc>\n'
    if script:
        tail += script + "\n"
    tail += '</body>\n</html>\n'
    return head + body + tail


def appearance_script(extra_props="", extra_vals=""):
    props = ('{"appearance":{"editor":"enum","options":["day","night"],"default":"day","section":"Map"}' + extra_props + '}')
    return (f"<script data-dc-script data-props='{props}'>\n"
            "const DAY = " + json.dumps(DAY) + ";\nconst NIGHT = " + json.dumps(NIGHT) + ";\n"
            "class Component extends DCLogic {\n  renderVals() {\n    const night = (this.props.appearance ?? 'day') === 'night';\n"
            "    return { t: night ? NIGHT : DAY" + extra_vals + " };\n  }\n}\n</script>")


ANNAPOLIS = next(r for r in GEO["results2024"] if r["id"] == "01")

# ---------------------------------------------------------------- Main (desktop 1440×900)
def build_main():
    map_w, map_h = 1120, 832  # 1440 - 320 rail; 900 - 68 header
    # scale the 1000×640 view to fill the map region (cover), anchored to show the whole province
    svg = svg_map("winner", labels=True, width=map_w, height=int(map_w * VH / VW), fed=True, mun=False, wash=0.2, selected="01", label_scale=1.0)
    rail = (
        f'<aside style="grid-row: 2; grid-column: 1; min-width: 0; min-height: 0; padding: 18px 24px; overflow: hidden; background: var(--surface); border-right: 1px solid var(--line); box-shadow: 6px 0 24px rgba(18, 52, 59, 0.08)">'
        f'<h2 style="margin: 0 0 16px; font-family: {DISPLAY}; font-size: 23.2px; font-weight: 700; line-height: 1.08">Electoral Districts</h2>'
        f'<form style="margin: 0 0 12px"><label style="display: block; margin: 0 0 9px; font-size: 15.36px; font-weight: 800">Search by PID or civic address</label>'
        f'<div style="display: grid; grid-template-columns: minmax(0, 1fr) 44px; gap: 8px"><input type="text" placeholder="PID or address" style="height: 44px; padding: 0 12px; font: inherit; color: var(--ink); background: var(--surface); border: 1px solid var(--line); border-radius: 5px">'
        f'<button type="button" aria-label="Search" style="display: inline-flex; width: 44px; min-height: 44px; align-items: center; justify-content: center; padding: 10px; color: #ffffff; background: var(--blue); border: 1px solid var(--blue); border-radius: 6px">{SEARCH_ICON}</button></div>'
        f'<p style="min-height: 18px; margin: 7px 0 0; color: var(--muted); font-size: 12.48px; line-height: 1.35">Enter an 8-digit PID or a Nova Scotia civic address.</p></form>'
        f'<button type="button" style="display: inline-flex; width: 100%; min-height: 44px; align-items: center; justify-content: center; margin: 4px 0 0; padding: 10px 18px; color: var(--ink); font: inherit; font-weight: 700; background: var(--surface); border: 1px solid var(--line); border-radius: 6px">Export map (PDF)</button>'
        # theme picker
        f'<section style="display: grid; gap: 6px; margin: 12px 0 0; padding: 12px; background: var(--tint); border: 1px solid rgba(47, 128, 237, 0.28); border-radius: 8px">'
        f'<h2 style="margin: 0; font-size: 15.36px; font-weight: 800">Map setup</h2>'
        f'<select value="Electoral Districts" style="width: 100%; min-height: 44px; padding: 8px 10px; font: inherit; color: var(--ink); background: var(--surface); border: 1px solid var(--line); border-radius: 5px"><optgroup label="Built-in themes"><option value="Explore Nova Scotia">Explore Nova Scotia</option><option value="Tax Sale Research">Tax Sale Research</option><option value="Electoral Districts" selected>Electoral Districts</option><option value="Forestry &amp; Field Access">Forestry &amp; Field Access</option><option value="Historical Maps">Historical Maps</option></optgroup></select>'
        f'<p style="margin: 0; color: var(--muted); font-size: 11.52px; line-height: 1.4">Federal, provincial and municipal districts with the latest official results.</p>'
        f'<div style="display: flex; flex-wrap: wrap; gap: 6px 12px; align-items: center"><button type="button" style="min-height: 44px; padding: 6px 0; color: var(--blue); font: inherit; font-size: 12px; font-weight: 700; text-decoration: underline; background: none; border: 0">Save setup…</button><button type="button" style="min-height: 44px; padding: 6px 0; color: var(--blue); font: inherit; font-size: 12px; font-weight: 700; text-decoration: underline; background: none; border: 0">Manage themes</button></div>'
        f'</section>'
        # layers
        f'<section style="padding: 20px 0 0; margin-top: 12px; border-top: 1px solid var(--line)"><h2 style="margin: 0 0 9px; font-size: 15.36px; font-weight: 800">Map layers</h2>'
        f'<section style="border-top: 0">{category_heading("Elections & Districts", "3 on · new category", True)}'
        f'<div style="padding: 0 4px 12px"><p style="margin: 0 0 7px; color: var(--muted); font-size: 11.52px; line-height: 1.45">Federal ridings, provincial districts, municipal districts, and official results by level of government.</p>'
        f'{elections_category_rows()}</div></section>'
        f'{collapsed_categories()}'
        f'</section></aside>')
    header = (
        f'<header style="grid-row: 1; grid-column: 1 / span 2; display: flex; align-items: center; justify-content: space-between; gap: 24px; padding: 8px 28px; background: var(--surface); border-bottom: 1px solid var(--line)">'
        f'<a href="#" style="display: flex; align-items: center; gap: 12px; color: inherit; text-decoration: none"><span style="display: grid; width: 44px; height: 44px; place-items: center; color: #ffffff; font-family: {MONO}; font-size: 12px; font-weight: 700; background: var(--deep); border-radius: 8px">NS</span>'
        f'<strong style="font-family: {DISPLAY}; font-size: 28px; font-weight: 700; line-height: 1">NS Marks The Spot</strong><span style="color: var(--deep)">Online</span></a>'
        f'<div style="display: flex; align-items: center; gap: 28px; font-size: 15.36px"><button type="button" style="padding: 0; color: var(--blue); font: inherit; text-decoration: underline; background: none; border: 0">About this map</button><span>iPhone app in development</span>'
        f'<a href="#" style="display: inline-flex; min-height: 44px; align-items: center; justify-content: center; padding: 10px 18px; color: #ffffff; font-weight: 700; text-decoration: none; background: var(--blue); border: 1px solid var(--blue); border-radius: 6px">Get launch updates</a>'
        f'<button type="button" aria-label="Collapse header" style="display: grid; width: 44px; height: 44px; place-items: center; padding: 0; color: var(--ink); font-size: 21.6px; line-height: 1; background: var(--fog); border: 1px solid var(--line); border-radius: 8px">⌃</button></div></header>')
    controls = (
        f'<div style="position: absolute; top: 12px; left: 12px; display: grid; width: 34px; color: var(--blue); font-size: 22px; font-weight: 700; text-align: center; background: var(--surface); border: 2px solid rgba(0, 0, 0, 0.2); border-radius: 4px; line-height: 30px"><span style="border-bottom: 1px solid #ccc">+</span><span>−</span></div>'
        f'<button type="button" aria-label="Show my location" style="position: absolute; top: 86px; left: 12px; display: grid; width: 46px; height: 46px; place-items: center; color: var(--blue); background: var(--surface); border: 2px solid var(--surface); border-radius: 50%; box-shadow: 0 1px 8px rgba(18, 52, 59, 0.35)">{LOCATE_ICON}</button>'
        f'<button type="button" aria-label="Measure distance" style="position: absolute; top: 138px; left: 12px; display: grid; width: 46px; height: 46px; place-items: center; color: var(--blue); background: var(--surface); border: 2px solid var(--surface); border-radius: 50%; box-shadow: 0 1px 8px rgba(18, 52, 59, 0.35)">{RULER_ICON}</button>'
        f'<button type="button" aria-label="Measure area" style="position: absolute; top: 190px; left: 12px; display: grid; width: 46px; height: 46px; place-items: center; color: var(--blue); background: var(--surface); border: 2px solid var(--surface); border-radius: 50%; box-shadow: 0 1px 8px rgba(18, 52, 59, 0.35)">{AREA_ICON}</button>'
        f'<div style="position: absolute; left: 12px; bottom: 74px; display: grid; gap: 6px; font-family: {MONO}; font-size: 11px; font-weight: 600"><span style="width: fit-content; padding: 3px 7px; color: var(--ink); background: rgba(255, 255, 255, 0.82); border: 1px solid var(--line); border-radius: 4px">Z 7 · 45.20, −63.00</span><span style="width: fit-content; padding: 3px 7px; color: var(--ink); background: rgba(255, 255, 255, 0.82); border-radius: 4px">Approx. screen scale 1:2,900,000</span></div>'
        # legend chip (map-side) for the active results mode
        f'<div style="position: absolute; top: 12px; right: 16px; display: grid; gap: 6px; padding: 10px 12px; color: var(--ink); background: rgba(255, 255, 255, 0.94); border: 1px solid var(--line); border-radius: 6px; box-shadow: 0 4px 18px rgba(18, 52, 59, 0.12); font-size: 11.52px">'
        f'<strong style="font-family: {MONO}; font-size: 11.2px; letter-spacing: 0.04em; text-transform: uppercase; color: var(--deep)">2024 results · winning party</strong>'
        f'<div style="display: flex; gap: 12px"><span style="display: inline-flex; gap: 5px; align-items: center"><span style="width: 12px; height: 10px; background: var(--pc); opacity: 0.6; border: 1px solid rgba(0,0,0,0.35); border-radius: 2px"></span>PC · 43</span><span style="display: inline-flex; gap: 5px; align-items: center"><span style="width: 12px; height: 10px; background: var(--ndp); opacity: 0.6; border: 1px solid rgba(0,0,0,0.35); border-radius: 2px"></span>NDP · 9</span><span style="display: inline-flex; gap: 5px; align-items: center"><span style="width: 12px; height: 10px; background: var(--lib); opacity: 0.6; border: 1px solid rgba(0,0,0,0.35); border-radius: 2px"></span>Liberal · 2</span><span style="display: inline-flex; gap: 5px; align-items: center"><span style="width: 12px; height: 10px; background: var(--ind); opacity: 0.6; border: 1px solid rgba(0,0,0,0.35); border-radius: 2px"></span>Ind. · 1</span></div>'
        f'<div style="display: flex; gap: 12px; padding-top: 4px; border-top: 1px solid var(--line)"><span style="display: inline-flex; gap: 6px; align-items: center"><span style="width: 18px; border-top: 2px dashed var(--deep)"></span>Federal riding</span><span style="display: inline-flex; gap: 6px; align-items: center"><span style="width: 18px; border-top: 1.2px solid var(--mapink)"></span>Provincial district</span></div></div>'
        f'<div style="position: absolute; right: 0; bottom: 0; left: 0; display: flex; flex-wrap: wrap; gap: 2px 10px; padding: 5px 10px; color: var(--ink); font-size: 10.5px; line-height: 1.4; background: rgba(251, 246, 234, 0.9)">'
        f'<span>Provincial districts and results © Elections Nova Scotia (GeoNOVA)</span><span>Federal ridings: Elections Canada, Open Government Licence – Canada</span><span>Municipal districts: Province of Nova Scotia, OGL-NS · HRM: OGL-Halifax</span><span>Basemap: NS Marks Atlas</span></div>')
    body = (
        f'{helmet()}'
        f'<div style="{token_style_holes()}; display: grid; grid-template-rows: 68px minmax(0, 1fr); grid-template-columns: 320px minmax(0, 1fr); width: 1440px; height: 900px; overflow: hidden; color: var(--ink); background: var(--fog); font-family: {UI}; font-size: 16px">'
        f'{header}{rail}'
        f'<section style="grid-row: 2; grid-column: 2; position: relative; min-width: 0; min-height: 0; overflow: hidden; background: var(--water)">'
        f'<div style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%)">{svg}</div>'
        f'{controls}{inspector_card(ANNAPOLIS, compact=True)}'
        f'</section></div>')
    return dc(body, appearance_script())


# ---------------------------------------------------------------- Direction tiles (640×560)
def caption(title, motivation, tradeoff, badge):
    return (f'<div style="display: grid; gap: 6px; padding: 14px 18px 16px; color: var(--ink); background: var(--surface); border-top: 1px solid var(--line)">'
            f'<p style="margin: 0; color: var(--deep); font-family: {MONO}; font-size: 11.2px; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase">{esc(badge)}</p>'
            f'<h2 style="margin: 0; font-family: {DISPLAY}; font-size: 22px; font-weight: 700; line-height: 1.1">{esc(title)}</h2>'
            f'<p style="margin: 0; font-size: 12.5px; line-height: 1.45"><strong>Why:</strong> {esc(motivation)}</p>'
            f'<p style="margin: 0; color: var(--muted); font-size: 12.5px; line-height: 1.45"><strong>Trade-off:</strong> {esc(tradeoff)}</p></div>')


def direction_tile(svg, cap, overlay=""):
    body = (f'{helmet()}<div style="{token_style(DAY)}; display: grid; grid-template-rows: 410px minmax(0, 1fr); width: 640px; height: 610px; overflow: hidden; background: var(--water); font-family: {UI}">'
            f'<div style="position: relative; overflow: hidden">{svg}{overlay}</div>{cap}</div>')
    return dc(body)


def build_direction_a():
    svg = svg_map("lines", labels=True, width=640, height=410, fed=True, mun=True, label_scale=1.3, level_colours=True)
    overlay = (f'<div style="position: absolute; top: 10px; left: 12px; display: grid; gap: 5px; padding: 8px 10px; background: rgba(255, 255, 255, 0.92); border: 1px solid var(--line); border-radius: 6px; font-size: 11px; color: var(--ink)">'
               f'<span style="display: inline-flex; gap: 6px; align-items: center"><span style="width: 20px; border-top: 2px dashed var(--deep)"></span>Federal riding</span>'
               f'<span style="display: inline-flex; gap: 6px; align-items: center"><span style="width: 20px; border-top: 1.5px solid var(--blue)"></span>Provincial district</span>'
               f'<span style="display: inline-flex; gap: 6px; align-items: center"><span style="width: 20px; border-top: 1px dotted var(--lichen)"></span>Municipal district</span></div>')
    cap = caption("Atlas lines", "Each level of government draws in its own ink: deep-water dashed for federal ridings, survey blue for provincial districts, lichen dots for municipal districts. Reads over parcels, flood zones and aerial imagery without fighting them.",
                  "No result is visible at a glance; a reader learns who holds a seat only by selecting it.", "Direction A · boundaries as reference")
    return direction_tile(svg, cap, overlay)


def build_direction_b():
    svg = svg_map("winner", labels=True, width=640, height=410, fed=False, mun=False, wash=0.0, label_scale=1.3)
    # the wash opacity is a tweak: bind it as the SVG opacity attribute of the results group (raw-value hole)
    svg = svg.replace('<g opacity="0.0" style="stroke: none">', '<g opacity="{{washOpacity}}" style="stroke: none">')
    assert "{{washOpacity}}" in svg, "wash hole not bound"
    overlay = (f'<div style="position: absolute; top: 10px; left: 12px; display: flex; gap: 10px; padding: 8px 10px; background: rgba(255, 255, 255, 0.92); border: 1px solid var(--line); border-radius: 6px; font-size: 11px; color: var(--ink)">'
               f'<span style="display: inline-flex; gap: 5px; align-items: center"><span style="width: 12px; height: 10px; background: var(--pc); opacity: 0.6; border: 1px solid rgba(0,0,0,0.35); border-radius: 2px"></span>PC</span>'
               f'<span style="display: inline-flex; gap: 5px; align-items: center"><span style="width: 12px; height: 10px; background: var(--ndp); opacity: 0.6; border: 1px solid rgba(0,0,0,0.35); border-radius: 2px"></span>NDP</span>'
               f'<span style="display: inline-flex; gap: 5px; align-items: center"><span style="width: 12px; height: 10px; background: var(--lib); opacity: 0.6; border: 1px solid rgba(0,0,0,0.35); border-radius: 2px"></span>Liberal</span>'
               f'<span style="display: inline-flex; gap: 5px; align-items: center"><span style="width: 12px; height: 10px; background: var(--ind); opacity: 0.6; border: 1px solid rgba(0,0,0,0.35); border-radius: 2px"></span>Independent</span></div>')
    cap = caption("Winner wash", "Each 2024 district tinted by the party that won it, at a wash opacity that keeps the basemap legible. The survey palette already maps to party convention: survey blue, survey red, a validated amber for the NDP.",
                  "Encodes only the winner; an 8-vote margin in Annapolis looks as blue as a 40-point one in Pictou East. Hues collide with other coloured overlays.", "Direction B · results as identity")
    body = (f'{helmet()}<div style="{token_style(DAY)}; display: grid; grid-template-rows: 410px minmax(0, 1fr); width: 640px; height: 610px; overflow: hidden; background: var(--water); font-family: {UI}">'
            f'<div style="position: relative; overflow: hidden">{svg}{overlay}</div>{cap}</div>')
    script = ("<script data-dc-script data-props='{\"washOpacity\":{\"editor\":\"range\",\"min\":0.1,\"max\":0.7,\"step\":0.05,\"default\":0.3,\"section\":\"Map\"}}'>\n"
              "class Component extends DCLogic {\n  renderVals() {\n    return { washOpacity: this.props.washOpacity ?? 0.3 };\n  }\n}\n</script>")
    return dc(body, script)


def build_direction_c():
    svg = svg_map("margin", labels=True, width=640, height=410, fed=False, mun=False, label_scale=1.3)
    ramp = "".join(f'<span style="width: 26px; height: 10px; background: var(--seq{i})"></span>' for i in range(1, 6))
    overlay = (f'<div style="position: absolute; top: 10px; left: 12px; display: grid; gap: 6px; padding: 8px 10px; background: rgba(255, 255, 255, 0.92); border: 1px solid var(--line); border-radius: 6px; font-size: 11px; color: var(--ink)">'
               f'<div style="display: flex; gap: 6px"><span style="padding: 3px 8px; color: var(--blue); font-weight: 800; background: #edf5ff; border-radius: 4px; box-shadow: inset 0 -2px 0 var(--blue)">Margin</span><span style="padding: 3px 8px; color: var(--muted); font-weight: 600">Turnout</span></div>'
               f'<div style="display: flex; gap: 2px; border: 1px solid rgba(0,0,0,0.25); border-radius: 2px; width: fit-content">{ramp}</div>'
               f'<div style="display: flex; justify-content: space-between; width: 138px; font-family: {MONO}; font-size: 9.5px; color: var(--muted)"><span>&lt;5 pts</span><span>15</span><span>30</span><span>50+</span></div></div>')
    cap = caption("Margin & turnout", "One sequential teal stepped from the app's deep-water hue: pale where the race was close, dark where it was safe. A second chip swaps the measure to turnout. Analytical, party-neutral, and honest about uncertainty.",
                  "Needs a legend to mean anything and reads as a heat map; the winner is not shown unless a label or the inspector adds it.", "Direction C · results as magnitude")
    return direction_tile(svg, cap, overlay)


# ---------------------------------------------------------------- Inspector (390 standalone)
def build_inspector():
    body = (f'{helmet()}<div style="{token_style(DAY)}; width: 390px; padding: 0; background: var(--fog)">'
            f'{inspector_card(ANNAPOLIS, standalone=True)}</div>')
    return dc(body)


# ---------------------------------------------------------------- Mobile (390×844)
def build_mobile():
    svg = svg_map("winner", labels=False, width=760, height=486, fed=True, mun=False, wash=0.2, selected="34")
    sheet_rows = elections_category_rows(compact=True)
    body = (
        f'{helmet()}'
        f'<div style="{token_style_holes()}; position: relative; width: 390px; height: 844px; overflow: hidden; color: var(--ink); background: var(--water); font-family: {UI}; font-size: 16px">'
        f'<div style="position: absolute; top: 120px; left: -260px">{svg}</div>'
        # phone chrome
        f'<div style="position: absolute; top: 12px; right: 12px; left: 72px; display: flex; justify-content: space-between; gap: 10px">'
        f'<span style="display: inline-flex; min-height: 44px; align-items: center; gap: 8px; padding: 5px 12px 5px 6px; background: rgba(255, 255, 255, 0.92); border: 1px solid rgba(255, 255, 255, 0.76); border-radius: 999px; box-shadow: 0 4px 18px rgba(18, 52, 59, 0.24)"><span style="display: grid; width: 30px; height: 30px; place-items: center; color: #ffffff; font-family: {MONO}; font-size: 10.88px; font-weight: 700; background: var(--deep); border-radius: 50%">NS</span><strong style="font-family: {DISPLAY}; font-size: 15.2px">Marks The Spot</strong></span>'
        f'<button type="button" style="display: inline-flex; min-height: 44px; align-items: center; gap: 8px; padding: 8px 14px; color: var(--ink); font: inherit; font-size: 12.48px; font-weight: 800; background: rgba(255, 255, 255, 0.92); border: 1px solid rgba(255, 255, 255, 0.76); border-radius: 999px; box-shadow: 0 4px 18px rgba(18, 52, 59, 0.24)"><span style="color: var(--blue)">{SEARCH_ICON}</span>Search &amp; layers</button></div>'
        f'<div style="position: absolute; top: 12px; left: 12px; display: grid; width: 44px; color: var(--blue); font-size: 22px; font-weight: 700; text-align: center; background: var(--surface); border: 2px solid rgba(0, 0, 0, 0.2); border-radius: 4px; line-height: 44px"><span style="border-bottom: 1px solid #ccc">+</span><span>−</span></div>'
        # bottom sheet
        f'<aside style="position: absolute; right: 8px; bottom: 44px; left: 8px; height: 560px; padding: 0 16px 20px; overflow: hidden; color: var(--ink); background: rgba(255, 255, 255, 0.98); border: 1px solid rgba(255, 255, 255, 0.7); border-radius: 20px; box-shadow: 0 20px 60px rgba(18, 52, 59, 0.36)">'
        f'<div style="display: flex; align-items: center; justify-content: space-between; margin: 0 -16px 12px; padding: 14px 16px 12px 16px; background: rgba(255, 255, 255, 0.96); border-bottom: 1px solid var(--line)"><strong style="font-family: {MONO}; font-size: 12.16px; letter-spacing: 0.08em; text-transform: uppercase">Map controls</strong><button type="button" aria-label="Close" style="display: grid; width: 44px; height: 44px; place-items: center; padding: 0; color: var(--ink); font-size: 27px; line-height: 1; background: var(--fog); border: 0; border-radius: 50%">×</button></div>'
        f'<button type="button" style="display: inline-flex; min-height: 44px; align-items: center; padding: 8px 14px; margin: 0 0 8px; color: var(--ink); font: inherit; font-size: 13.12px; font-weight: 800; background: var(--fog); border: 1px solid var(--line); border-radius: 6px">‹ All layer categories</button>'
        f'<section>{category_heading("Elections & Districts", "3 on", True)}<div style="padding: 0 4px 12px"><p style="margin: 0 0 7px; color: var(--muted); font-size: 11.52px; line-height: 1.45">Federal, provincial and municipal districts with official results.</p>{sheet_rows}</div></section>'
        f'</aside>'
        f'<div style="position: absolute; right: 8px; bottom: 6px; left: 8px; display: flex; gap: 8px; padding: 6px 12px; color: var(--ink); font-size: 10px; line-height: 1.3; background: rgba(251, 246, 234, 0.9); border-radius: 22px"><span>© Elections Nova Scotia · Elections Canada OGL · Province OGL-NS</span></div>'
        f'</div>')
    return dc(body, appearance_script())


# ---------------------------------------------------------------- Data inventory (flowing document, 880 wide)
def table(headers, rows, widths=(16, 22, 15, 14, 11, 22)):
    th = "".join(f'<th style="width: {w}%; padding: 8px 8px; text-align: left; font-size: 11.5px; font-weight: 800; color: var(--muted); border-bottom: 1px solid var(--line); vertical-align: bottom">{h}</th>' for h, w in zip(headers, widths))
    trs = []
    for r in rows:
        tds = "".join(f'<td style="padding: 9px 8px; font-size: 12px; line-height: 1.45; border-bottom: 1px solid var(--rowline); vertical-align: top; overflow-wrap: anywhere">{c}</td>' for c in r)
        trs.append(f"<tr>{tds}</tr>")
    return f'<table style="width: 100%; table-layout: fixed; border-collapse: collapse; margin: 8px 0 22px"><thead><tr>{th}</tr></thead><tbody>{"".join(trs)}</tbody></table>'


def build_inventory():
    mono = f'font-family: {MONO}; font-size: 11.5px'
    def m(s):
        return f'<code style="{mono}">{esc(s)}</code>'
    fed_rows = [
        ["Federal electoral districts, 2023 Representation Order", "Elections Canada Maps Corner · SHP / KMZ / GDB (national) · ESRI REST " + m("maps-cartes.services.geo.ca …/ELECTIONS/FED_Elect2025_en/MapServer/3"),
         "11 Nova Scotia ridings · as used at the 45th general election, April 28, 2025", m("FED_NUM, ED_NAMEE, ED_NAMEF, REPORDER"), "Open Government Licence – Canada", "The REST service returned attributes but no geometry for GeoJSON and Esri JSON requests in this pass; the download files are the reliable path."],
        ["Polling division boundaries (2025) and advance polling districts", "Same package · SHP 92.8 MB national · REST sublayers 1 and 2", "Polling divisions used on April 28, 2025", "ED number, PD number, PD name", "Open Government Licence – Canada", "Large national file; clip to Nova Scotia before serving. Divisions change every election."],
        ["Official voting results, 45th general election (raw data)", "Elections Canada · CSV zips per province (Nova Scotia = 12) · two formats: poll-by-poll (wide) and poll results (long)", "11 district files; Acadie—Annapolis alone has about 1,160 candidate-by-poll rows", "ED number/name, PD number/name, void and no-poll indicators, merged-with, candidate, party, votes, electors", "Open Government Licence – Canada", "Joins to the 2025 PD boundaries on ED + PD number. Earlier elections (42nd–44th) are on open.canada.ca with their own boundaries."],
    ]
    prov_rows = [
        ["Provincial electoral districts (2026)", "GeoNOVA " + m("nsgiwa.novascotia.ca …/BND/BND_ElectoralBoundaries_UT83/MapServer/4") + " (ED2026_Analysis) · Elections NS downloads " + m("NS_2026ED_Bnds.zip") + " / " + m(".kmz") + " · per-district PDF maps",
         "56 districts · House of Assembly Act as amended (Royal Assent April 9, 2026): Chéticamp-Margarees-Pleasant Bay (ED 56) carved out of Inverness, which keeps ED 34 and its name in the layer (the commission had proposed Inverness-We'koqma'q)", m("ED_NO, ED_NAME, electorcount, Release_Date"), "No open licence stated; ArcGIS item disclaimer: informational, not for legal purposes, Crown copyright © Government of Nova Scotia", "Treat like other GeoNOVA services: Province licence gate until permission is confirmed. Ask Elections NS before redistributing extracts."],
        ["Provincial polling divisions (March 2026)", "Same service, layer 3 (PD_ED2026_Carto, 1,817 polygons; minScale 1:400,000) and layer 2 (lines) · Elections NS " + m("ProvincialPollingDivisionPolygons_March_2026.zip") + " · ENS ArcGIS Online " + m("ENS_PD_ED") + " (1,817, edited 2026-04-14)",
         "Current divisions only; past elections' divisions are not published as GIS", m("ED_NO, PD_NO, electorcount, IND_POLL, RES_CARE, SERVICE_AREA, RELEASE_DATE"), "As above; the ENS AGOL item carries no licence text at all", "Zoom-gate at 12+. The 2024 poll-by-poll spreadsheet was counted on 2024 divisions, so a join to March 2026 polygons is approximate and must say so."],
        ["Institutional and residential-care polls", "Same service, layer 0 (IP_ED2026, 65 points; minScale 1:200,000)", "Point locations of special polls", m("ED_NO, PD_NO, Res_Care, Release_Date"), "As above", "Facility-level points; show only at neighbourhood zoom and never as a residence attribute."],
        ["General election results 2003–2024", "GeoNOVA " + m("BND_GeneralElectionResults_UT83") + " · layers 1–7 (2003, 2006, 2009, 2013, 2017, 2021, 2024) · table 0 Historical_Voter_Turnout",
         "Polygons carry the boundaries of their own election: 52 districts in 2003, 55 in 2021 and 2024", m("ED_NO, ED_NAME, MLA, PARTY, PC_Votes, Liberal_Votes, NDP_Votes, Green_Votes, Independent_Votes, Rejected, Declined, Total, PctVoterTurnout") + " (older years add NS_Party, MP, Atlantica)", "Copyright text: Elections Nova Scotia", "Never re-project results onto another year's boundaries. Party field is a free-text name (truncated in places)."],
        ["Electoral district profiles", "GeoNOVA " + m("BND_Electoral_District_Profiles_UT83") + " · two tables keyed on ED_NO (56 rows)",
         "2021 Census demographics per district; latest election information per district", "Population, dwellings, gender, mother tongue and official-language knowledge, 18+; last event and date, voting locations by type (WIB, ROCP, community, advance, mobile, election day), final list of electors, votes cast, early voting, rejected/declined, MLA, returning officer", "Copyright text: Elections Nova Scotia", "56 rows: ED 56 carries the June 23, 2026 by-election (Claude Bourgeois, PC); the other 55 carry the 2024 general election. Census figures are Elections NS's aggregation of Statistics Canada data; cite both."],
        ["Distribution of seats by party", "GeoNOVA " + m("BND_DistributionOfSeats_UT83") + " · 56 polygons",
         "As of June 23, 2026: 2024 general election, by-elections since (including the new ED 56), and party changes", m("ED_NO, ED_NAME, Party, MLA"), "Copyright text: Elections Nova Scotia", "Distinct from results: this is who sits now, on the 2026 boundaries. Show the as-of date on the row."],
        ["Poll-by-poll results (spreadsheets)", "Elections NS " + m("42PGE_PollbyPoll_AllEDs_TurnOut_FINAL.xlsx") + " (2024), " + m("41PGE_…") + " (2021), " + m("2017_PollbyPollResultsFinal.xlsx"),
         "Tabular, one workbook per general election", "District, poll, candidate votes, turnout", "Elections NS website terms; no explicit licence", "Needs a hand-built join to that election's polling divisions; only the current divisions are published as GIS."],
    ]
    mun_rows = [
        ["Municipal polling districts (province-wide)", "Nova Scotia Open Data " + m("gcep-xeci") + " (Socrata; GeoJSON/CSV) · GDB / KML / SHP via the nsgi DDS links in the metadata",
         "238 districts across 49 municipalities (HRM 16, CBRM 12, counties and districts 5–12 each, towns 1–3) · rows updated November 2025", m("co_code, mu_code, poll_dist, mun, reg_num"), "Nova Scotia Open Government Licence", "Built by the Geomatics Centre from municipal submissions and NSUARB descriptions; the publisher says to vet with the municipality. The newer view id " + m("4qyk-69iq") + " returns geometry with no attributes through the row API; query " + m("gcep-xeci") + "."],
        ["HRM council districts and polling divisions", "Halifax open data (ArcGIS) · " + m("PollingDistrict") + " (16), " + m("PollingDivisions") + " (116), " + m("ADM_polling_district_Project") + " layer id 238 (2024 election districts) · historical 2012, 2016, 2020 sets",
         "2024 election districts (boundary review effective 2024)", m("DIST_ID, DISTNAME, COUNCILLOR, SCH_BOARD, SDATE"), "Open Government Licence – Halifax", "COUNCILLOR is null in the 2024 layer; the 'Who Is My Councillor' service carries names. Includes a 2019 District 15 special-election results-by-poll table: a precedent for municipal poll results."],
        ["CBRM districts", "Covered by the provincial dataset (12 districts) · CBRM publishes PDF district maps; its ArcGIS server has no election service", "2024 election districts", "—", "OGL-NS via the provincial dataset", "No CBRM-native GIS layer to cite; use the provincial one and link CBRM's page."],
        ["Municipal election results (October 19, 2024)", "Per municipality on its own website (HRM results page, MODL, Clare, and others)", "Certified results per district, sometimes per poll", "Varies", "Municipal website terms", "No consolidated dataset and nothing GIS-joined. A results layer would need per-municipality ingestion like the tax-sale archives."],
        ["CSAP (Conseil scolaire acadien provincial) districts", "NSUARB boundary decision July 6, 2023; no open boundary file found", "—", "—", "—", "Out of reach for now; HRM's district layer carries only a SCH_BOARD attribute."],
    ]
    body = (
        f'{helmet()}'
        f'<article style="{token_style(DAY)}; width: 880px; padding: 40px 48px 48px; color: var(--ink); background: var(--surface); font-family: {UI}; font-size: 14px; line-height: 1.5">'
        f'<p style="margin: 0 0 6px; color: var(--deep); font-family: {MONO}; font-size: 11.2px; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase">Electoral theme · data inventory · checked September 12, 2026</p>'
        f'<h1 style="margin: 0 0 10px; font-family: {DISPLAY}; font-size: 34px; font-weight: 700; line-height: 1.08">What electoral data exists for Nova Scotia</h1>'
        f'<p style="margin: 0 0 24px; font-size: 15px; color: var(--muted)">Every dataset below was queried live; the gaps at the end come from searches. Levels of government are the natural sub-themes: federal, provincial, municipal. Boundaries are published at all three levels (the provincial services without licence text); official results exist as GIS only at the provincial level, as CSV by poll at the federal level, and as web pages at the municipal level, one HRM special-election table aside.</p>'
        f'<h2 style="margin: 24px 0 4px; font-family: {DISPLAY}; font-size: 22px">Federal · Elections Canada</h2>{table(["Dataset", "Publisher and delivery", "Geometry and vintage", "Key fields", "Licence", "Caveats"], fed_rows)}'
        f'<h2 style="margin: 24px 0 4px; font-family: {DISPLAY}; font-size: 22px">Provincial · Elections Nova Scotia via GeoNOVA</h2>{table(["Dataset", "Publisher and delivery", "Geometry and vintage", "Key fields", "Licence", "Caveats"], prov_rows)}'
        f'<h2 style="margin: 24px 0 4px; font-family: {DISPLAY}; font-size: 22px">Municipal · Province and municipalities</h2>{table(["Dataset", "Publisher and delivery", "Geometry and vintage", "Key fields", "Licence", "Caveats"], mun_rows)}'
        f'<h2 style="margin: 24px 0 8px; font-family: {DISPLAY}; font-size: 22px">Evidence rules the theme must keep</h2>'
        f'<ul style="margin: 0 0 20px; padding-left: 20px; display: grid; gap: 6px">'
        f'<li>Results stay on the boundaries they were counted on. 2024 results draw on the 2024 polygons; the 2026 district layer is a separate row.</li>'
        f'<li>District, polling division and voting location are three different things; never let a division count stand in for a district.</li>'
        f'<li>Every results row shows its as-of date; "current seats" is a different claim from "who won".</li>'
        f'<li>Party colour is conventional identity and never the only channel: legend, direct labels and the inspector always name the party. The light-mode trio (survey blue #1e66cc, survey red #be4d3c, amber #d98f1a) and the dark-mode trio (#3f86e0, #d24b3a, #bb8a26) both pass the categorical validator, with the red–amber pair in the colour-blind floor band that is legal only with direct labels; Green appears in bars only, never as a fill, because red–green cannot be separated for deutan readers.</li>'
        f'<li>Provincial services stay behind the existing Province licence gate with Elections Nova Scotia attribution until redistribution permission is confirmed; federal layers carry the OGL-Canada attribution; municipal layers carry OGL-NS and OGL-Halifax.</li>'
        f'<li>Empty responses, zoom gates and licence blocks stay distinct states; a district with no results row is "no result published here", not zero votes.</li>'
        f'</ul>'
        f'<h2 style="margin: 24px 0 8px; font-family: {DISPLAY}; font-size: 22px">Open questions</h2>'
        f'<ul style="margin: 0; padding-left: 20px; display: grid; gap: 6px">'
        f'<li>Redistribution terms for the GeoNOVA BND services and the Elections NS ArcGIS Online item (no licence text on either).</li>'
        f'<li>Whether to ingest the 2024 poll-by-poll spreadsheet against March 2026 divisions (approximate) or wait for an Elections NS 2024 division file.</li>'
        f'<li>Whether federal poll-by-poll results (CSV joined to 2025 divisions) belong in the first release or a later one; the provincial layers already give the theme its shape.</li>'
        f'<li>Municipal results: worth a per-municipality archive like the tax-sale results, or link out only.</li>'
        f'</ul></article>')
    return dc(body)


# ---------------------------------------------------------------- canvas.json
def build_canvas():
    return {
        "artboards": [
            {"file": "Main.dc.html", "x": 0, "y": 0, "w": 1440, "h": 900, "title": "Electoral Districts · desktop"},
            {"file": "DirectionA.dc.html", "x": 0, "y": 1080, "w": 640, "h": 610, "title": "Direction A · Atlas lines"},
            {"file": "DirectionB.dc.html", "x": 720, "y": 1080, "w": 640, "h": 610, "title": "Direction B · Winner wash"},
            {"file": "DirectionC.dc.html", "x": 1440, "y": 1080, "w": 640, "h": 610, "title": "Direction C · Margin & turnout"},
            {"file": "Inspector.dc.html", "x": 0, "y": 1960, "w": 390, "h": 820, "title": "District inspector"},
            {"file": "Mobile.dc.html", "x": 480, "y": 1960, "w": 390, "h": 844, "title": "Phone sheet"},
            {"file": "DataInventory.dc.html", "x": 960, "y": 1960, "w": 880, "h": 1700, "print": "flow", "title": "Data inventory"},
        ],
        "annotations": [
            {"id": "note-read-me", "x": 1540, "y": 0, "w": 300, "text": "Electoral theme, first pass.\n\nMain shows the leading candidate: a new 'Elections & Districts' category with the level of government as sub-groups, an 'Electoral Districts' map setup, and Direction A's line hierarchy with Direction B's wash switched on. Annapolis is selected because its 2024 result was decided by 8 votes.\n\nThe three tiles below are the open decision: how results should look on the map. Everything drawn uses the official geometries and the 2024 official counts."},
            {"id": "note-open", "x": 1540, "y": 420, "w": 300, "text": "Open decisions\n\n1. Default look: lines only (A), wash (B), or magnitude (C)? My lean: A by default, B and C as modes of the results row.\n2. Level switcher vs. stacking: sub-groups let all three levels stack; a segmented control would force one at a time.\n3. Licence: provincial services have no licence text. Gate them like other GeoNOVA layers until Elections NS confirms.\n4. Federal poll results in the first cut or later?"},
            {"id": "note-a", "x": 0, "y": 1740, "w": 640, "text": "Direction A · Atlas lines. Reference cartography: the theme is a boundary layer first, so it composes with parcels, flood zones and aerial imagery. Results live in the inspector and the optional wash."},
            {"id": "note-b", "x": 720, "y": 1740, "w": 640, "text": "Direction B · Winner wash. Drag the wash tweak above the tile: at 0.3 the basemap still reads; past 0.5 it becomes a poster. Party hues are conventional, so the legend and labels are mandatory rather than decorative."},
            {"id": "note-c", "x": 1440, "y": 1740, "w": 640, "text": "Direction C · Margin & turnout. One teal hue, light to dark, stepped from the deep-water hue. Closest races are palest, which is the honest reading of an 8-vote seat. Turnout uses the same ramp with a different legend."},
        ],
        "launch": {"view": "canvas"},
    }


if __name__ == "__main__":
    files = {
        "Main.dc.html": build_main(),
        "DirectionA.dc.html": build_direction_a(),
        "DirectionB.dc.html": build_direction_b(),
        "DirectionC.dc.html": build_direction_c(),
        "Inspector.dc.html": build_inspector(),
        "Mobile.dc.html": build_mobile(),
        "DataInventory.dc.html": build_inventory(),
    }
    for name, content in files.items():
        with open(os.path.join(HERE, name), "w") as f:
            f.write(content)
        print(f"{name}: {len(content.encode('utf-8'))/1024:.0f} KB")
    with open(os.path.join(HERE, "canvas.json"), "w") as f:
        json.dump(build_canvas(), f, indent=2)
    print("canvas.json written")
