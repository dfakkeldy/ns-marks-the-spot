# Crown Grant second round — all 36 retained failures

All **36 requested main maps** received a second assessment. **No replacement fit was supported for adoption; all 36 original failures are retained.** This is a completed focused assessment round, not a claim that each sheet was rebuilt or that every possible correction has been exhausted. There are no newly accepted geographic results or active-raster changes.

The review used complete native scan/reference context, original point identities and uncertainty, all control/check locations, native paired details for the four largest check errors and two largest control residuals per sheet, and focused follow-up where ambiguity mattered. Every original main score was replayed; same-model control omission and all-original-control similarity trials were retained as diagnostics. No original point was moved or deleted, no bias shift was applied, and no higher-order warp was introduced. Only sheet 005 proceeded to a frozen candidate and new validation.

The most promising old-score improvement failed fresh validation. Sheet 005's similarity reduced seven known-check RMS from **123.46 m to 61.31 m**, but three untouched peninsula checks gave **121.06 m**, compared with **115.37 m** for the original affine on those same points. The candidate was rejected. Its native proposals, rejected correspondence, fresh checks, scores, complete-frame render, coverage and browser receipts are preserved in [sheet005](sheet005/candidate-comparison.md).

The other sheets retain failures because this audit did not establish an evidenced correspondence correction or independently supported model replacement. Examples include sheet 049's schematic dashed NB coast, sheet 076's displaced Jeddore Rock, sheet 111's Janvrin regional displacement, and uncertain lake/shore definitions. These are observations and possible explanations; they do not prove landscape change or an irreducible accuracy floor. Near misses such as sheet 067 (100.17 m) were not rounded into passes. The [per-sheet assessments](summary.json) preserve regional gaps and the limits of the review.

| Sheet | Retained original RMS (m) | Outcome |
|---|---:|---|
| [004a](sheet004a/README.md) | 101.96 | Retained failure |
| [005](sheet005/README.md) | 123.46 | Retained failure |
| [008](sheet008/README.md) | 136.55 | Retained failure |
| [010](sheet010/README.md) | 101.26 | Retained failure |
| [011](sheet011/README.md) | 142.86 | Retained failure |
| [015](sheet015/README.md) | 139.25 | Retained failure |
| [019](sheet019/README.md) | 103.44 | Retained failure |
| [022](sheet022/README.md) | 101.96 | Retained failure |
| [024](sheet024/README.md) | 155.19 | Retained failure |
| [026](sheet026/README.md) | 103.53 | Retained failure |
| [031](sheet031/README.md) | 130.89 | Retained failure |
| [043](sheet043/README.md) | 129.32 | Retained failure |
| [044](sheet044/README.md) | 103.26 | Retained failure |
| [049](sheet049/README.md) | 424.26 | Retained failure |
| [052](sheet052/README.md) | 141.32 | Retained failure |
| [056](sheet056/README.md) | 103.06 | Retained failure |
| [058](sheet058/README.md) | 106.18 | Retained failure |
| [060](sheet060/README.md) | 235.59 | Retained failure |
| [067](sheet067/README.md) | 100.17 | Retained failure |
| [076](sheet076/README.md) | 131.83 | Retained failure |
| [077](sheet077/README.md) | 164.71 | Retained failure |
| [087](sheet087/README.md) | 117.05 | Retained failure |
| [090](sheet090/README.md) | 105.24 | Retained failure |
| [092](sheet092/README.md) | 107.26 | Retained failure |
| [097](sheet097/README.md) | 107.92 | Retained failure |
| [103](sheet103/README.md) | 174.43 | Retained failure |
| [109](sheet109/README.md) | 141.19 | Retained failure |
| [111](sheet111/README.md) | 175.21 | Retained failure |
| [112](sheet112/README.md) | 105.24 | Retained failure |
| [114](sheet114/README.md) | 168.85 | Retained failure |
| [117](sheet117/README.md) | 106.79 | Retained failure |
| [118](sheet118/README.md) | 104.54 | Retained failure |
| [119](sheet119/README.md) | 128.15 | Retained failure |
| [120](sheet120/README.md) | 248.95 | Retained failure |
| [130](sheet130/README.md) | 110.16 | Retained failure |
| [131](sheet131/README.md) | 158.17 | Retained failure |

The RMS/median/P95/maximum limits remain 100/75/150/200 m, measured with WGS84 geodesic ground distance. Reused checks are explicitly known diagnostics. No fresh validation is claimed for the 35 unchanged sheets without a new candidate. Three new checks on sheet 005 are spatially limited and correlated coastal samples, not whole-sheet acceptance.

The first-round reports, active assets, inset fits, masks and qualified user acceptance of 004a/005 remain unchanged. Sheet 002 is outside this round. Frozen batch1 basis `57765b8d5edc54798491ef524463b98330601633` is preserved. The full-series first-round summary therefore remains 102 main RMS passes and 36 failures; the independent first-round claim is historical provenance, not a new second-round validation claim.

Private artifacts: `/Users/dfakkeldy/Documents/NS Marks The Spot/Crown Grant/round2-20260926/`, with a verified independent local copy in `round2-20260926-copy/`. This is a second local copy, not an off-device backup. All sources, reference extracts and rasters remain private. The original reviewer at port 8842 is untouched; port 8843 serves the rejected 005 comparison from durable storage. No public scan upload, production activation or deployment occurred.

Verification and frozen-asset receipts: [verification.json](verification.json). Reproduce numeric checks with `python3 reports/crown-grant/round2-20260926/verify.py`; add `--private-root` pointing to the durable Crown Grant directory for private hash verification. Requires NumPy and pyproj; no Apple build is involved.
