"""Project every general-election results layer (2003-2024) into coarse SVG paths for small multiples.

Writes paths_history.json: {"view": [w, h], "years": {year: [{id, name, winner, mla, pc_share, d}]}, "seats": {year: {party: n}}}
Reuses the projection from build_paths.py so the multiples line up with the main map.
"""
import json, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import build_paths as bp  # noqa: E402  (importing runs the main build once; acceptable)

PARTY_KEYS = {"PC_Votes": "PC", "Liberal_Votes": "Liberal", "NDP_Votes": "NDP", "Green_Votes": "Green",
              "Independent_Votes": "Independent", "NS_Party_Votes": "Other", "MP_Votes": "Other", "Atlantica_Votes": "Other"}


def winner_of(p):
    votes = {}
    for k, party in PARTY_KEYS.items():
        v = p.get(k)
        if isinstance(v, (int, float)) and v > 0:
            votes[party] = votes.get(party, 0) + v
    if not votes:
        return None, None, None
    ranked = sorted(votes.items(), key=lambda kv: -kv[1])
    total = sum(votes.values())
    return ranked[0][0], round(100 * votes.get("PC", 0) / total, 1), round(100 * (ranked[0][1] - (ranked[1][1] if len(ranked) > 1 else 0)) / total, 1)


out = {"view": [bp.W, bp.H], "years": {}, "seats": {}}
for year in (2003, 2006, 2009, 2013, 2017, 2021, 2024):
    name = "results2024.geojson" if year == 2024 else f"results_{year}.geojson"
    path = os.path.join(HERE, name)
    if not os.path.exists(path):
        print("missing", name)
        continue
    fc = json.load(open(path))
    feats = []
    seats = {}
    for f in fc["features"]:
        p = f["properties"]
        g = bp.geom_to_path(f["geometry"], tol=2.6) or bp.geom_to_path(f["geometry"], tol=0.3)
        if not g:
            continue
        winner, pc_share, margin = winner_of(p)
        seats[winner] = seats.get(winner, 0) + 1
        feats.append({"id": p.get("ED_NO"), "name": (p.get("ED_NAME") or "").strip(), "winner": winner, "mla": (p.get("MLA") or "").strip(),
                      "party_text": p.get("PARTY"), "pc_share": pc_share, "margin": margin, "turnout": p.get("PctVoterTurnout"),
                      "d": g["d"], "cx": g["cx"], "cy": g["cy"]})
    out["years"][str(year)] = feats
    out["seats"][str(year)] = seats
    print(year, len(feats), "districts", seats, f"{sum(len(e['d']) for e in feats)/1024:.0f} KB")

json.dump(out, open(os.path.join(HERE, "paths_history.json"), "w"))
