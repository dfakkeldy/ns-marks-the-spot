# Sheet 21: Cook Lakes and McIntosh Cove refinement

**Draft — retain the earlier fifteen-control fit as the provisional baseline.** The seventeen-control experiment improves the Cook inlet check, but worsens a nearby mainland mouth and fails both fresh-check limits. Neither fit has whole-sheet geographic acceptance.

## Frozen repair and fresh checks

All fifteen existing controls remain identical, including the earlier C07/J0499 identity failure and its corrected C16/J0495 record in the parent history. After personally inspecting exact unrotated native close/wide crosshairs and modern context, V01 Cook Lakes southern basin outlet became C17 unchanged at [8798,2950] (prior 120.299825 m), and V05 McIntosh Cove small island north tip became C18 unchanged at [5436,1689] (prior 108.753139 m). The historical island outline differs from modern geometry; that uncertainty is retained. V03 Bumbo Island and V04 Brick Point were not moved or promoted.

The seventeen-control fit was frozen before fresh selection. F01 was corrected from [8758,2582] to [8774,2591] to locate the actual northeast tributary inlet of Cook Lakes' northern basin. F02 was corrected from [5567,1764] to [5560,1765] to locate the mainland stream mouth east of McIntosh Cove's small island. Both changes were made and personally reviewed in exact close/wide views before the first score; all initial proposals and figures survive. World coordinates are direct NSTDB endpoint junctions, never inverse-fit estimates.

| Fresh check | Fifteen-control baseline | Seventeen-control experiment |
| --- | ---: | ---: |
| F01 Cook Lakes inlet, J0267 | 55.799691 m | 23.987659 m |
| F02 McIntosh mainland mouth, J0127 | 173.903259 m | 209.688980 m |

Fresh median 116.838319 m / worst 209.688980 m fail the declared 100 / 200 m limits. These two checks are spatially correlated with the new controls and do not establish whole-interior accuracy. Eight reused diagnostics (93.761775 m median / 164.249854 m worst) remain separate from fresh validation. No point was promoted or adjusted after these scores.

## Full sheet and visual evidence

The original 10811 × 7646 source has SHA-256 `1f135b06b54b9fb4a3083d39b326b7d45ad76a096336c4806c7696a10a3b74be`. The unchanged complete boundary retains mapped islands, labels, West Bay, Lennox Passage and northern Isle Madame. Its SHA-256 is `7946eeedda680117a2d5ab349de2a763d59bea863bd15dc8fa94b301a30faa6c`. No detached feature is independently repositioned.

All 35 packet figures were personally viewed: twelve native close/wide frames, two boundary views, ten actual old/new warp comparisons, eight adjacent-sheet comparisons and three browser screenshots. West Bay brooks, Sporting Mountain and interior lakes remain displaced or schematically different. Black River tributaries diverge; River Bourgeois and Lennox Passage shores disagree despite local anchors. Adjacent Sheets 18, 20, 22 and 23 show gaps and displaced stream/coast continuations. These neighboring rasters are also provisional; their exact hashes are recorded in `render-provenance.json`.

External experiment: `/Users/dfakkeldy/Downloads/fletcher-sheet21/refinement-20260912/sheet-21-full-sheet.tif`, 8495 × 5566, EPSG:3857, 5 projected metre cells, exact GDAL TPS and cubic RGBA. Raster SHA-256 `120bd6b95fa483549241b439e2a26d78bed506c677fa8cc35e11d2e60a60fa4e`; fit SHA-256 `f991e956ec4077779168293e494df3bdbf8da342b67208715f96e082ccafee1f`. Coverage checks 46,288,214 interior cells with zero transparent holes; all 71,786 sampled Jacobians are negative. Coverage and sampled orientation do not establish geographic accuracy.

Preferred earlier provisional raster: `/Users/dfakkeldy/Downloads/fletcher-sheet21/repaired-fifteen/sheet-21-full-sheet.tif`, SHA-256 `75e5ce00163ef7e7c698bcd305a506770d67a719d581f0e8deeaa6d7a05e04be`.

## Verification and provenance

Editable CSVs contain 17 controls, eight reused diagnostics and two fresh checks. The actual web parser roundtrips them and its TPS agrees with GDAL. Actual browser import, desktop reload and mobile reload preserve the raster hash, dimensions and enabled state; the final browser error log is empty. These results are local technical evidence only.

`verify_packet.py` checks parent nightly provenance, reference hashes, unchanged old controls, promotions, freeze chronology, fresh-point independence from prior recorded points, exact native frame centers and radii, direct modern vertices/endpoints, score hashes, coverage, CSV behavior, raster persistence and all figure hashes. Frozen parent inputs belong to nightly commit `c32c85e917aa8746fa0b98f928f76a366127b7ee`. Parent proposals, corrections, rejections and failures remain unchanged.

Replay uses `reports/fletcher/full-sheets/render.py` and `score.py`, this packet's preserved point/warp/join scripts, the Sheet 14 coverage verifier, bundled `verify_import.ts` and `verify-browser.mjs` against the local port 4199 map. Source and reference paths are pinned in receipts. Rumsey/Stanford credit, CC BY-NC-SA 3.0 collection terms and null manifest licence remain unchanged. No merge, active layer, deployment pin or production publication change.
