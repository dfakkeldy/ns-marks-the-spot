# Inverness south: Trout Brook interior validation

**Eight fresh checks now give 184.00 m horizontal ground RMS on the unchanged TPS13 fit.** New IS41, the Trout Brook lake-entry mouth midpoint, gives **199.66 m**, compared with 281.63 m on the preserved accepted baseline. No fit, control or source coordinate was changed after this first score. Eight points do not establish whole-panel acceptance.

The cumulative median is **170.94 m**, empirical P95 **279.61 m**, maximum **322.66 m**, bias **+61.91 m east / -19.43 m north**, and scatter **172.17 m RMS** about that mean. The accepted baseline gives **311.27 m RMS** on the same eight. Distances retain the 6,371,008.8 m sphere and mean-latitude cosine convention, warped minus reference. P95 is a linear sample percentile, not a confidence guarantee. Judged observation uncertainty is not subtracted.

## New physical observation

The source labels Trout Brook approaching the lake from the east/southeast. It crosses the shore road before entering a small inlet north of McLean Point. The native crop shows the lakeward bank turns on both sides of the mouth; their midpoint is measured before the crossing. The bridge is context, not the chosen coordinate.

The source-bank display positions are **[800,239] and [773,279]**, in an unrotated 1400×1300 crop at native origin [25200,12700]. Their midpoint is **[25986.5,12959] in the original 34427×34543 scan**. The modern midpoint uses the two original lake-shore/river-bank transitions:

- North: WARV20 **175605 v0** and WALK20 **130542 v135**.
- South: WARV20 **175608 v41** and WALK20 **131350 v0**.

The arithmetic midpoint is **[-61.1369892078378,46.09919332626758] longitude/latitude**. The original bank coordinates and exact midpoint construction are preserved in `observations/IS41.json`; the green endpoints and red midpoint are drawn in the native and reference evidence. Historical narrowing/generalization and shoreline changes limit precision; the judged uncertainty is **180 m**. IS41 lies inside the control hull and is displaced about 167 m west / 110 m north under this fit.

This is the distinct Trout Brook entry, about 9.5 km south of the existing northern outlet control. It is not a new whole-lake centroid or an invented independent Loch Ban basin check. It adds one local feature, not independent evidence for the entire lake shoreline.

## Withheld searches and reference identification

Frasers Brook/Broad Cove River was considered as a separate physical alternative to the previously withheld Strathlorne road junction. The expected stream neighbourhood is recognizable, but the exact source junction is covered by STRATH LORNE lettering. No point or score was adopted.

The historical Glenmore/Gillanders road loops could not be assigned confidently to one exact current track/Glenmore/Gillanders highway junction. Neither names nor an inverse guide resolve the route correspondence. These candidates remain unscored, with native context and original reference-node proposals in `search-evidence/`.

A lake-name-field search initially returned no Lake Ainslie shore vertices because the relevant lake-bank name fields are blank. That was not evidence of missing lake geometry. Original shoreline/river-bank connections and geographic context identify the two mouth sides; the lake shoreline records retain their ZVALUE of 57.4. That value corroborates context and is not the sole identity criterion.

## Frozen history, actual raster and browser

`freeze.json` pins the original controls, seven-check inventory and summary, selection freeze and accepted baseline inputs to nightly ancestry commit `c220326f4369758e0885ef9b83e2ffa43f83239e`. The [previous seven-check report](../south-tps13-validation-20260915/README.md) and all earlier first results remain untouched, including the 251.43 m northern-pair RMS and 322.66 m Marsh Point discrepancy. IS41 is appended in the new cumulative inventory; no diagnostic points or controls are counted as fresh.

The same 4,751×6,488 EPSG:3857 review raster remains byte-identical, SHA-256 `b849ad07dd0d61dcb8484e257090bc19721cb995fa608c41874f4c13ee237040`. The actual raster/reference window shows the northwest discrepancy and nonzero alpha at the measured source position. Earlier full-content alpha and sampled-distortion receipts apply to these exact bytes. No new full raster was rendered.

The persisted TPS13 was inspected alone at 70% opacity in ordinary 2D and 10× terrain at 50° and 0° tilt/north up. Exaggerated foreground hills obscure the mouth at 50°, so a straight-down terrain view was also inspected. Terrain supplies basin context; no source or reference coordinate is measured from a perspective screenshot. `browser-review.json` indexes local captures and DOM receipts. `coverage-overview.jpg` shows thirteen controls and eight fresh reference positions, with substantial coverage gaps still visible. No new raster import or raw-scan mesh acceptance is claimed.

```sh
PYTHONPATH=. /opt/local/bin/python3.12 reports/church/south-interior-validation-20260916/verify_reports.py
python3 -m unittest discover -s tools/church/tests -t .
```

The verifier replays the new first scores, the eight-check aggregate and the preserved seven-check aggregate; it verifies both source/reference midpoint constructions, original bank vertices, frozen hashes and rendered receipts. Three editable inventories round-trip through the production parser and compare TPS with GDAL at checks and content vertices. These computational checks do not establish geographic acceptance.

All six metric replays, three parser/solver comparisons and 428 Church tests passed. The browser returned no console errors. These local results remain separate from hosted CI and geographic acceptance.

Continue distributed independent checks without tuning to each new result. No whole-panel acceptance, catalog activation, tiles or deployment follows. Source imagery retains David Rumsey Map Collection / Stanford Libraries attribution and recorded CC BY-NC-SA 3.0 terms; original provincial geometry and Mapzen terrain retain their provenance.
