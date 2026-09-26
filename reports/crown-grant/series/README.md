# Crown Grant complete-series assessment

All **138 available official sheets** have been georeferenced and assessed, including `004a`. The final queue is empty. Assessment completion means the available evidence has been evaluated; it does not mean every sheet or region is geographically validated.

The full-series replay verified **166 saved score records**, original PDF/JPEG hashes for all 138 sheets, and **157 active raster components**. Every saved component-coverage check passed, every sheet has a browser review receipt, and all principal reference extracts are available. The 34 frozen batch1 measurement/render artifacts remain byte-identical to target-history commit `57765b8d5edc54798491ef524463b98330601633`. See [verification.json](verification.json) for the per-sheet results.

| Active main-map result | Sheets |
|---|---:|
| Within 100 m independent ground RMS | 102 |
| Above 100 m independent ground RMS | 36 |
| Within all four numerical limits | 82 |

The four numerical limits are RMS ≤100 m, median ≤75 m, empirical P95 ≤150 m and maximum ≤200 m, using WGS84 geodesic distances. Main maps and separate insets are not pooled. Numeric passes do not establish geographic or user acceptance, and unmeasured regions remain provisional. Per-sheet records preserve fit history, failures, bias, check counts and limitations.

Sheet 002 retains its qualified user acceptance, incomplete whole-sheet accuracy validation and unsupported inset. Its fresh main-map checks are used in the summary; it is not promoted to geographic acceptance. The separately fitted replacement for sheet 134 remains on sheet 126. Numbers 001 and 012 are absent from the official index; direct addresses for 001, 012 and 134 returned HTTP 404, as recorded in [unlinked-source-check.json](unlinked-source-check.json).

The [official index](https://novascotia.ca/natr/land/grantmap.asp) supplied the 138 linked PDFs. [inventory.json](inventory.json) preserves source URLs, index polygons, availability evidence and assessment paths. [progress.json](progress.json) records repository checkpoints. All 113 sheets in the continuation queue have been assessed alongside the earlier 25.

Controls and withheld checks were selected using physical features and inspected in native source pixels before fitting. Full mapped frames retain water and islands, with displaced insets handled separately. Coverage checks verify the saved masks and raster extent; they do not establish geographic accuracy. Browser receipts concern the private review, not production deployment.

The deleted first 25 sheets' PDFs/JPEGs and all 33 active raster components were rebuilt byte for byte. Recorded water queries restored expected counts and all available page hashes. See [RECOVERY.md](RECOVERY.md) and [recovery-20260926.json](recovery-20260926.json) for the exact recovery scope, fresh browser smoke checks and irrecoverable original discovery artifacts.

The private collection now resides outside disposable worktrees, with a separate copy of assessment records and rendering/review tools. All 138 sources and 157 active components were hash-verified there. The reviewer resolves its active files within durable storage. Original scans, reference extracts and rasters remain private; no scan redistribution, production activation or deployment is claimed.

The [second assessment round](../round2-20260926/README.md) reviewed all 36 main-map RMS failures. All original failures were retained; no replacement fit was supported for adoption. Sheet 005's promising known-check improvement failed fresh validation. Versioned diagnostics and the rejected candidate are preserved without changing these first-round results.
