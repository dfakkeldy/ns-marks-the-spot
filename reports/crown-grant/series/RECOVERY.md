# Private asset recovery

On 26 September 2026, the earlier shared worktree was found deleted. Its ignored private data had been linked into the continuation checkout. The committed assessment records survived.

All 25 affected official PDFs and extracted JPEGs were downloaded again and matched their committed SHA-256 hashes. Rendering the saved transforms and component masks reproduced all 33 active PNG/TIFF components byte for byte. Independent coverage checks passed. Replaying the recorded water queries restored the expected feature counts for all 25 sheets and matched all 115 individual page hashes available for comparison. Sheet 002 has a recorded combined-extract hash and count, but no individual page hash; the recovered raw response also matches its original combined-extract hash. The detailed receipt is [recovery-20260926.json](recovery-20260926.json).

A fresh browser smoke check loaded sheets 002, 003 and 120, including both separate insets, with decoded source/raster images and an empty warning/error console. Existing browser receipts remain historical evidence; recovery does not create new geographic acceptance. Controls, checks, scores and acceptance decisions were not changed.

The original uncommitted discovery guides and historical screenshot files cannot be recovered byte for byte. They are not claimed as restored. The source PDFs/JPEGs, active rasters, principal water extracts and committed observation records are available again.

## Reproduction

Use a durable private directory outside disposable worktrees. Keep an independent verified copy of working data there; a link alone is not a backup. Store the assessment records with that copy, while retaining their canonical versions in Git.

For each sheet, use its `status.json`, `source-receipt.json`, active fit, `components.json` and `render-receipt.json`:

1. Download the recorded official PDF URL and require the original PDF hash before extracting the embedded JPEG with `pdfimages -j`. Require the recorded JPEG hash and dimensions.
2. Run `tools/crown-grant/render_sheet.py` with that JPEG, the unchanged active fit and component definition. Use `--legacy-inclusive-mask` only when the saved receipt uses the original inclusive mask convention (sheet 002). Compare every output PNG/TIFF hash with the saved receipt.
3. Run `tools/crown-grant/verify_coverage.py` against the unchanged fit/components and rebuilt output directory.
4. Replay each recorded reference page URL, or the complete original query where page URLs were not recorded. Preserve feature filters, bounds, ordering, page size, offsets and coordinate system. Compare page hashes and total feature counts. Sheet 005 requires its original coastal `FEAT_CODE` filter; an initial unfiltered recovery attempt was rejected and retained privately before the exact query was restored.
5. Rebuild the private reviewer links, check decoded images and rendered output, and record recovery evidence separately from the original assessment.

No scan redistribution or production activation is part of this recovery.
