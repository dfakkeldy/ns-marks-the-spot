# Crown Grant batch 2 — Cape Breton, 22 September 2026

Twenty additional full sheets, starting with Port Hawkesbury on 110, proceeding
north within the official index column and south within the next eastern column.
The first two columns supply only eight sheets; the stated working assumption
continues the same eastward serpentine pattern until twenty. `queue.json` pins
the order and the source index. No twenty-first additional sheet is authorized.

110 → 109 → 108 → 114 → 115 → 116 → 117 → 118 → 126 → 125 → 124 → 123 →
122 → 121 → 120 → 119 → 127 → 128 → 129 → 130.

The user accepted batch 1 on 22 September. Its coordinates, scores, unsupported
regions and technical gate results are preserved; acceptance is recorded in
`../batch1/user-acceptance.json`. PR #524 subsequently passed CI and merged.

Use the existing 100 m independent ground RMS ceiling and report check count,
median/P95/maximum, bias, coverage and separate inset results. Full-content
rendering and user review remain distinct from numerical assessment. Complete
scans, vector extracts, warps and audit images stay in `.crown-grant-local/`.
No public layer or production deployment is part of this batch.

## Progress

| Order | Sheet | Status | Independent ground RMS | Evidence |
|---|---|---|---|---|
| 1 | 110 | Assessed, provisional | main: 53.84 m (8 checks) | [record](sheet110/README.md) |
| 2 | 109 | Assessed, provisional | main: 141.19 m (8 checks) | [record](sheet109/README.md) |
| 3 | 108 | Assessed, provisional | main: 52.24 m (13 checks) | [record](sheet108/README.md) |
| 4 | 114 | Assessed, provisional | main: 168.85 m (6 checks); cape-mabou-inset: 93.43 m (4 checks) | [record](sheet114/README.md) |
| 5 | 115 | Assessed, provisional | main: 61.66 m (8 checks) | [record](sheet115/README.md) |
| 6 | 116 | Assessed, provisional | main: 54.37 m (8 checks) | [record](sheet116/README.md) |
| 7 | 117 | Assessed, provisional | main: 106.79 m (8 checks) | [record](sheet117/README.md) |
| 8 | 118 | Assessed, provisional | main: 104.54 m (8 checks) | [record](sheet118/README.md) |
| 9 | 126 | Assessed, provisional | main: 99.94 m (6 checks); sheet134-inset: 62.13 m (3 checks) | [record](sheet126/README.md) |
| 10 | 125 | Assessed, provisional | main: 53.33 m (3 checks) | [record](sheet125/README.md) |
| 11 | 124 | Assessed, provisional | main: 62.44 m (7 checks) | [record](sheet124/README.md) |
| 12 | 123 | Assessed, provisional | main: 56.62 m (8 checks) | [record](sheet123/README.md) |
| 13 | 122 | Assessed, provisional | main: 52.02 m (8 checks) | [record](sheet122/README.md) |
| 14 | 121 | Assessed, provisional | main: 97.04 m (7 checks) | [record](sheet121/README.md) |
| 15 | 120 | Assessed, provisional | main: 248.95 m (6 checks); gray-point-inset: 74.66 m (3 checks) | [record](sheet120/README.md) |
| 16 | 119 | Assessed, provisional | main: 128.15 m (5 checks) | [record](sheet119/README.md) |
| 17 | 127 | Assessed, provisional | main: 48.50 m (9 checks) | [record](sheet127/README.md) |
| 18 | 128 | Assessed, provisional | main: 81.92 m (8 checks) | [record](sheet128/README.md) |
| 19 | 129 | Assessed, provisional | main: 63.33 m (8 checks); smokey-inset: 90.80 m (3 checks) | [record](sheet129/README.md) |
| 20 | 130 | Assessed, provisional | main: 110.16 m (8 checks) | [record](sheet130/README.md) |

Assessed: **20/20**. **Paused after the requested twenty additional sheets.** No sheet beyond this queue is authorized.

## Completed assessment

All twenty sheets and four displaced insets have full-content private renders and browser verification. Thirteen main maps meet the 100 m RMS ceiling; seven exceed it (109, 114, 117, 118, 120, 119 and 130). All four separately measured insets meet the RMS ceiling, with sparse checks and companion-bound limitations retained. Every new sheet remains provisional.

Sheet 125 preserves its original score, a post-audit diagnostic reuse score, and three fresh checks separately. Sheet 120 retains its failed affine and a failed simpler-model diagnostic; neither was replaced to manufacture a pass.

`verification.json` records 27 exact score replays, source/fit/component/raster hash checks, full-content coverage results and byte preservation of accepted batch 1 fits, scores, masks and render receipts against its target-history revision. Four existing scorer and native-pixel-mask regressions passed. Browser receipts cover the private Leaflet rasters; native import and production publication are outside this batch.
