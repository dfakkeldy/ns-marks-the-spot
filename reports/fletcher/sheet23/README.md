# Fletcher Sheet 23 — full-sheet provisional georeferencing

**Draft; geography not accepted.** The twelve-control TPS retains the entire mapped frame, including Janvrin Island, Isle Madame, Petit-de-Grat, Green Island, offshore rocks and the large southern sea area. Fresh validation fails both limits: **229.369327026 m median / 506.971356019 m worst**, against 100 m / 200 m. Reused diagnostic scores do not override that failure.

## Source and reference evidence

The native 10741 × 7635 scan comes from [David Rumsey Historical Map Collection](https://www.davidrumsey.com/luna/servlet/iiif/m/RUMSEY~8~1~2648~290016/manifest). `source-receipt.json` records the manifest, every downloaded native region, assembly pixel parity and full source hashes. The source PNG SHA-256 is `2ed268fb21d3ff991d2d79a4b0c7792ae4284a68b525993798534c321db865ba`. The original July engraved-grid observation and generated CSV remain unchanged; their source encoding hash differs from this native-region assembly. `guide-audit.json` records that distinction. Eight individually measured intersections preserve the scan's slant and serve only as a search guide. Both latitude labels and the outer longitude labels were personally read from the native scan.

Modern NSTDB references were retrieved for `-61.24,45.39,-60.81,45.59`: 1,581 roads, 2,086 water lines, 1,410 water polygons and a returned-empty rail response. `reference-receipts.json` retains URLs, counts, CRS, query bounds and hashes. These are source geometries, not survey ground truth. No absence conclusion follows from the empty rail query. The established direct-source permission records credit “David Rumsey Map Collection, David Rumsey Map Center, Stanford University Libraries” under CC BY-NC-SA 3.0, including non-commercial use, change identification and ShareAlike. The manifest itself returns no licence field; that null value is preserved. This packet identifies the project-derived georeferencing changes and does not broaden that permission. Reference-source licensing and deployment permission remain separate; this packet does not publish a production layer.

## Preserved fitting history

- Original proposals and every correction are retained. Native pixel corrections preceded fitting. The first Lac Le Blanc and Shaw candidates selected other shoreline junctions; their corrected controls are C04/J0439 and C05/J0368. Green Island's northern proposal was changed to its western coast before fitting. C11's broad Cape Hogan lobe could not be matched uniquely and was rejected unscored; C12 is the reviewed Marache Point instead.
- Eleven controls were frozen in `reviewed-fit.json` (`e3e67e57c90da467be5dbc5d5671fcbdaa5dbc5e74da4651b627e6b303b4fefa`) before independent diagnostic selection. Four checks gave affine **97.289847 / 738.415705 m**, TPS **45.447846 / 646.403129 m**. The large TPS failure was Q02, the Grand Lake western stream/shoreline junction.
- Q02 was explicitly promoted to C13 with identical coordinates. All eleven earlier controls remain byte-for-byte equivalent as point records. The twelve-control `repaired-fit.json` was frozen at `d90713b109ed4e9032f1837357f9f2bf983f3db000e8dbb5cff1159ec7f1405e` before fresh validation selection.
- Three reused diagnostics give **43.451938 / 43.921519 m**. On those same three locations the initial TPS gave **40.858874 / 50.036818 m**; this is mixed change, not a general accuracy claim.
- Five fresh checks were personally reviewed and scored only after the repair freeze. None entered the fit. V01 Grand Lake northern lobe = **506.971356 m**; V02 Shaw Lake southern junction = **334.610911 m**; V03 Thorn Island west = **229.369327 m**; V04 Jerseyman Island north = **16.864043 m**; V05 Green Island south = **33.975097 m**. Their median and worst remain failed.

Q03 was rejected unscored because the proposed northern Lac Le Blanc extremum belonged to a separate modern pond. Other original check proposals and their corrections remain in their own JSON/image stages: Campbell's first modern selection hit another shoreline; Grand Lake's first selection hit a stream vertex; Jerseyman's first northern selection hit a separate islet; Green's first southern selection was a tiny northern coast segment. The corrected island checks use actual connected coastal geometry and retain source object IDs. Rocky Islets' proportions differ, explicitly recorded in Q04. Coordinates were corrected from native/source identity before scoring, never from error minimization.

## Whole-sheet raster and visual review

Local GeoTIFF: `/Users/dfakkeldy/Downloads/fletcher-sheet23/regional-twelve/sheet-23-full-sheet.tif`

SHA-256: `6355a23f84dd1a7017a6065f7b48e9552ce4cbd3dd1074cd441a936906293581`

The raster is 8305 × 5738, RGBA, EPSG:3857, 5 projected metre cells, one exact GDAL TPS (`-et 0`) with cubic resampling. `boundary.json` is the complete engraved map frame, not a land or control hull. `boundary-overview.jpg`, `boundary-corners.jpg` and `graticule-labels.jpg` document native review. No external mapped extension was found. All islands, rock symbols and mapped sea remain in the same warp.

Coverage found **46,214,073 interior cells, zero transparent interior cells** with one output-cell edge tolerance. All **71,701** sampled native Jacobians were negative, the expected image-y orientation. These checks establish raster coverage and sampled orientation, not geographic accuracy. Only the final twelve-control raster was rendered; no initial eleven-control raster comparison is claimed.

All ten actual-raster comparison frames in `warped-review/` were personally inspected:

- Janvrin: main outline recognizable, local coves/islands and northern coast disagree; Haddock Harbour and Glasgow/Thorn have clear offsets.
- Grand Lake and Shaw Lake: large northern/interior shape and junction differences remain. Lac Sec and neighboring drainage also disagree.
- Petit Nez: outer coast is locally close; Major Creek's historical inlet and modern drainage configuration differ.
- Arichat/Jerseyman: recognizable islands and coastline, with local shoreline and small-island differences. Jerseyman's fresh northern check is close.
- Cape Hogan: broad coast is reasonably aligned at this review scale, but bays, ponds and internal drainage differ; no acceptance inferred from appearance.
- Petit-de-Grat: major outline retained; interior waters, spits and small coves differ. Green and Rocky Islets are retained with shape discrepancies; unsupported offshore rock symbols are not treated as absent from reality.
- Southern full frame: the full mapped sea and bottom edge survive; there are no physical controls over the empty sea, so this area remains extrapolation.

Three actual northern joins against Sheet 21's corrected fifteen-control raster were personally inspected. Frame extents partly overlap while coastline and stream continuity disagree; no seam is accepted. `join-provenance.json` pins both actual rasters. The western Sheet 24 join is outstanding until that sheet's artifact is available.

## Editable import files and browser proof

- `sheet-23-controls.csv`: twelve controls only.
- `sheet-23-diagnostic-review.csv`: same controls plus three reused diagnostic checks.
- `sheet-23-validation-review.csv`: same controls plus five fresh checks.

All use `pixel_x,pixel_y,lon,lat,role,label`; labels are stable IDs and descriptive evidence stays in JSON. Use the exact native PNG with these CSVs. The actual web parser round-trips all files, and its TPS agrees with GDAL to **5.89020114423e-09 projected metres** at the delivered checks. This proves parser/solver consistency, not geographic acceptance.

The actual GeoTIFF was imported through My Maps in isolated Chromium and enabled. Desktop import, desktop reload and mobile reload screenshots were personally inspected. Stored raster bytes/SHA, georeference, pixel dimensions, alpha preview and enabled state survived reload; console/page errors were empty. `browser-verification.json` records hashes and the local full receipts/screenshots. Browser import is not mesh validation for a PNG+CSV workflow.

Large native/reference/raster/browser files remain under `/Users/dfakkeldy/Downloads/fletcher-sheet23` outside Git. Compact review images, editable records, provenance and scripts are in this packet. No app code, built-in map registration, hosting, licence gate or deployment was changed.

## Reproduction

Use the existing benchmark Python environment and put `/opt/local/bin` on PATH. Run `reports/fletcher/full-sheets/score.py` with the frozen fit and corresponding check JSON, and `reports/fletcher/full-sheets/render.py` with the native PNG, `repaired-fit.json`, `boundary.json` and `repair-diagnostic.json`. The current source hash is enforced. `review_warp.py` and `review_join.py` inspect real GDAL raster crops. `verify_import.ts` bundles against the actual web parser; `verify-browser.mjs` imports the actual GeoTIFF using the local Vite server on port 4198.

Local verification passed for source/reference hashes, preserved controls and frozen checks, exact figure metadata, full raster coverage/orientation, CSV parsing/solver parity and actual browser persistence. Geographic acceptance failed. Hosted CI is tracked on the draft PR separately from these local checks.
