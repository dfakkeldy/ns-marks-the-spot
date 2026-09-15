# Cape Breton main continuation — 15 September 2026

The three-control baseline is now available as a complete review GeoTIFF and has
been loaded through the actual web importer, reloaded, and viewed over 10× terrain.
It remains geographically unsupported: two selection diagnostics have 570.00 m
RMS against the 250 m working objective. No replacement fit, catalog activation,
tiles or deployment is accepted in this checkpoint.

The original Scatarie and Hay island exteriors were checked against marine-island
geometry and official physical-feature identities. Gillis and Scotch lake control
vertices were checked against their original lake/river geometry. The original
coordinates remain unchanged. `initial-*-audit.json` records these bounded audits.

CB09, Low Point's northern mainland apex, first failed the frozen affine by
613.73 m outside the control hull. Its observation, native/reference crosshairs
and first result remain preserved. It subsequently became a selection diagnostic.
CB10, Rouses Point's eastern mainland apex, was a prospective southern control
before scoring; its 1,557.01 m unfitted discrepancy is not fresh validation.

| Fit | Same two diagnostic RMS | Median | Empirical P95 | Maximum | Mean east / north |
| --- | ---: | ---: | ---: | ---: | ---: |
| Baseline affine, 3 controls | 570.00 m | 568.18 m | 609.18 m | 613.73 m | −152.23 / +82.77 m |
| Southern affine, 4 controls | 558.70 m | 558.01 m | 583.06 m | 585.85 m | +42.81 / +522.20 m |
| Southern TPS, 4 controls | 552.36 m | 534.21 m | 660.60 m | 674.65 m | −51.80 / +309.06 m |

Hay Island and Low Point are the same diagnostics in every row. The TPS helps
Low Point but worsens Hay Island. These small changes with only two coastal
checks do not justify selecting a whole-panel replacement. There are no fresh
checks after these comparisons; interior, southern and intervening coast checks
remain insufficient. Exact metrics, distance convention and role histories are
in `accuracy-summary.json` and `southern-support-trial/`.

The unchanged repaired content cutline retains Scatarie, Hay and the southern
extension while excluding independent inset plans. The explicit affine render
has zero transparent holes in 23,046,137 tested interior cells, with a one-cell
boundary tolerance. Its constant orientation determinant is −14.8837; affine
orientation has no local reversals, but that does not establish geographic
accuracy or acceptable extrapolation. `baseline-artifact-receipt.json` and
`baseline-coverage.json` identify the exact 6,627×5,226, EPSG:3857, 20 projected-metre
raster. Large imagery remains outside Git.

The actual browser imported the raster at reduced display resolution and restored
it after navigation. Mira River was compared in top-down 2D and at 50° tilt,
10× exaggeration, including the modern terrain alone. The ridges clarify valley
context, while detailed water placement still needs physical correspondence
checks. No controls were measured from the terrain view. `browser-review.json`
records settings, screenshot hashes and the empty inspected browser error log.
These views do not replace full raster/reference windows or seam validation.

Point Aconi and Cape Gabarus remain withheld because the same exact shoreline
feature is unresolved. The new Salmon/Mira native crop was inspected, and original
WARV20 banks confirm the named river connection; the precise historical bank
corner remains withheld. `salmon-mouth-followup.json` preserves this clarification
without inventing a GCP. The original search notes remain unchanged. Catalone's
broader native context is ready for the next correspondence review.

Run `PYTHONPATH=. /opt/local/bin/python3.12 reports/church/cape-breton-continuation-20260915/verify_checkpoint.py`
to replay scores, frozen-input hashes, and new observation frame/reference checks.
This is a continuation checkpoint, not completion of Cape Breton georeferencing.
