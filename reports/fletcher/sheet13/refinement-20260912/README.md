# Sheet 13 — physical refinement, 12 September 2026

**Draft; whole-sheet geography remains unaccepted.** The final 14-control TPS improves McKenzie Brook and North Brook locally. Three fresh checks score 99.75 m, 41.99 m and **215.38 m**, failing the 200 m worst-point limit. Interior, lake shore and neighboring-sheet discontinuities remain. This packet does not authorize merging or deployment.

## Editable result

- [Controls CSV](sheet-13-controls.csv), [diagnostic CSV](sheet-13-diagnostic-review.csv), [fresh validation CSV](sheet-13-validation-review.csv): 14, 14+8 and 14+3 rows. Pixels refer to the original unrotated 10872 × 7682 scan. Full identity records: [fit](final-fit.json), [diagnostics](final-diagnostic.json), [validation](final-validation.json).
- GeoTIFF: `/Users/dfakkeldy/Downloads/fletcher-sheet13/refinement-20260912/14-control/sheet-13-full-sheet.tif`, 8678 × 5773, EPSG:3857, RGBA, 5 projected metre cells; SHA-256 `cd28de67764371a68388446a23a9b8442de1af253d2e95fbeeeacd00b91dc2e2`.
- Native PNG: `/Users/dfakkeldy/Downloads/fletcher-sheet13/native/sheet13.png`; SHA-256 `48474fe1e8762d5c07c79cf05b59918e429bd41a6cc2a6fe1a568dd89b84c72f`.
- Final fit SHA-256 `2ae5ef8d16c4ab1209367778466dc4720f04727e093768ffa1f716f4465277a1`. Complete original boundary unchanged: `f7cd2eca10af9fb59a12d66abc02926d57f739f0da11b01f6eddc2822023f746`. All mapped content, islands and labels within the original frame remain; no corridor or control-hull clipping.

## Preserved repair sequence

All eleven prior controls and earlier proposals, failures and rasters remain unchanged. Personal native close/wide reinspection supports promoting old V02 North Brook and V03 McDonald Brook unchanged to C13/C14. Each promotion preserves its old record and error. Q04 Coopers Brook still has uncertain branch hierarchy; Q07 has an unexplained modern parallel channel. Both remain unchanged reused diagnostics, never controls. Earlier rejected C06 stays rejected.

After the 13-control freeze, fresh F01/F02/F03 were collected and personally reviewed against modern topology. Before first scoring, F01 moved from [4900,5716] to [4907,5714] and F02 from a land pick [6390,4950] to the actual fork [6420,4957]. F03 stayed [2652,1378]. All original and corrected views remain.

| Check | Original 11 | Repair 13 | Final 14 |
| --- | ---: | ---: | ---: |
| F01 upper North Brook | 220.17 m | 135.22 m | 154.07 m, reused |
| F02 McKenzie southwestern tributary | 291.42 m | **332.58 m** | promoted unchanged to C15 |
| F03 Allan Brook western tributary | 29.74 m | 29.82 m | 29.90 m, reused |
| F04 McKenzie western mill fork | 313.80 m | 297.14 m | **99.75 m, fresh** |
| F05 North Brook eastern tributary | 226.15 m | 44.68 m | **41.99 m, fresh** |
| F06 Mount Pleasant northern tributary | 214.48 m | 215.09 m | **215.38 m, fresh** |

The failed F02 has supported physical identity from the ordered western mill fork, southwestern tributary and downstream minor branch. It was promoted unchanged to C15, preserving both prior failures. The 14-control freeze preceded F04–F06 collection. Original and corrected F04 crosshairs remain: [6185,4675] was west of the junction, corrected to [6207,4678] before scoring. F05 [4858,6038] and F06 [5068,2990] were retained. No further fitting or coordinate tuning followed final fresh scores. These checks are sparse and often close to controls; F03 is especially close to C03. Values near 100 m should not imply precision beyond the recorded native-pick uncertainty.

## Verification and limits

[Visual review](visual-review.json) records personal inspection of all 64 hashed figures: original/corrected point frames, both real warped experiments in ten regional windows each, six neighboring-sheet pairs per stage, and browser screenshots. Modern vectors are projected directly onto actual raster windows. Search-guide coordinates are never geographic acceptance evidence. [Search provenance](search-provenance.json) pins nodes derived from the unchanged, hash-verified [NSTDB reference receipts](../reference-receipts.json); their September 11 snapshot is reference geometry, not survey ground truth.

McKenzie Brook improves materially after C15. Lower North Brook reaches, Coopers and Mount Pleasant streams, northwestern valleys, northeastern Middle River bends, Lake Ainslie peninsulas/east shore and eastern stream networks retain errors. All reviewed joins with Sheets 11, 12 and 14 remain unaccepted; the new Sheet 12 17-control raster is included in both east-seam reviews. Sampled local improvement does not establish a seamless mosaic.

Exact GDAL TPS (`-et 0`) retains the original whole mapped boundary. [Final coverage](final-coverage.json) verifies 47,694,755 interior cells with zero transparent holes. All 71,721 sampled Jacobians have the expected negative sign for y-down native coordinates; this is not a continuous no-fold proof. The 13-control raster and its failed scores remain in the external experiment directory and corresponding receipts.

[Import verification](import-verification.json) passes the real application CSV parser, semantic round-trip and TPS consistency, with 14/8/3 role counts and maximum web/GDAL disagreement 7.46e-9 projected m. Both actual TIFFs pass My Maps import and desktop/mobile reload. [Final browser proof](final-browser-verification.json) pins the exact persisted raster, georeference, alpha and zero console/page errors. Final desktop 1440×1000 shows the whole frame; mobile 390×844 shows a narrower viewport. This verifies TIFF import/persistence, not PNG+CSV browser mesh or geographic accuracy.

[Packet verification](packet-verification.json) verifies provenance, unchanged controls, promotion coordinates, frozen roles, CSV rows, reference hashes, frame coordinates, raster hashes, coverage and browser persistence. [Acceptance](acceptance.json) is false. No application or Apple code changed. Hosted CI status belongs to the draft PR.

## Reproduction and rights

See [HANDOFF.md](HANDOFF.md). Freeze constructors refuse to overwrite the recorded fits. Use a separately dated experiment for further work. Existing source, reference and prior experiment files must remain intact.

Historical imagery: **David Rumsey Map Collection, David Rumsey Map Center, Stanford University Libraries**, [Sheet 13 manifest](https://www.davidrumsey.com/luna/servlet/iiif/m/RUMSEY~8~1~2638~290006/manifest). Scoped permission is preserved in [INVENTORY.md](../../INVENTORY.md). Cropped, annotated and georeferenced derivatives retain applicable CC BY-NC-SA 3.0 attribution, noncommercial and ShareAlike conditions. The manifest's null license field does not replace that permission. No imagery is relicensed under the software license; this local research packet supplies no deployment clearance.
