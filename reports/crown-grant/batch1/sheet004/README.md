# Sheet 004 — full-content provisional assessment

Official Yarmouth County sheet, 5564 × 3989 pixels, embedded JPEG, 150 dpi,
March 2009 update stamp. All source imagery, georeferenced rasters and paired
crosshair figures stay private in `.crown-grant-local/`.

Eight distributed mainland/island controls define the frozen affine-01 model.
Twenty-one excluded physical checks measure **92.79 ground-metre RMS**, median
66.05, empirical P95 167.70 and maximum 229.13. Signed bias is +11.67 m east,
+33.32 m north. The first score was 93.66 m RMS. A later reference-placement
audit corrected Q14 from a point on Western Bar Island's western shore to its
actual southern tip; source pixel and fit stayed unchanged. Both check records
and scores are retained. The corrected result is reference-audited validation,
not an untouched fresh set. No check was promoted into fitting.

Native crosshair inspection corrected rough proposals before fitting/scoring.
The initial “Arnold Lake” proposal was a misreading of “Arnold Pt”; it never
entered a fit. The corrected control is the headland's northern tip. Earlier
proposals and every correction are preserved in the versioned JSON packets.
Do not treat an initial proposal as an accepted correspondence.

Checks span Perry, Jacco, Crawleys, both Pearls islands, Reef, Ram, Long, Channel,
Tucker, Bar, Western Bar, Lobster, Holmes, southern Spectacle, Ellenwood, Allen,
Haymaker, Tusket and Mike islands, plus Pinney Point. This is distributed island
coverage, not proof for every small island, intertidal rock or marsh arm. Shore
and tidal-limit definitions differ locally from the generalized historical ink.

The current user-requested RMS ceiling is **100 m**, which this fit passes.
Original criteria and the user revision are in `../acceptance-criteria.json`.
Companion error statistics and geographic coverage remain separate; passing RMS
does not validate the unsupported offshore content.

## Unsupported Gannet Rock

Q11 is rejected and unscored. The nearest wet-line candidate was a different
rock south of Green Island, not Gannet Rock. CGNDB's Gannet Rock locality
(−66.148767, 43.63854) corroborates the vicinity, but a place-name coordinate is
not a precise northern-shore checkpoint. Focused official hydrography point
(layer 1) and dry-line (layer 3) queries also returned zero features in the
recorded vicinity. This means a reference gap, not absence of the rock.
Its imagery remains in the full raster, explicitly unsupported.

Untested small islands/rocks are not certified. In particular this assessment
does not supply checks for every northern/eastern marsh component, the smaller
Jones islands, Garden/Robins heads, all inner/small Fish islands, Wilson/Money,
Snipe, Mark or Peas. Peas Island crosses the printed southern boundary; native
bottom-strip inspection confirms the scan stops its mapped line at that frame,
rather than showing an extension outside it. The complete mapped source content
is retained; the natural island is not claimed complete on sheet 004 alone.

## Sources, coverage and reproducibility

The modern NSTDB wet-line extract has 4,566 features in three ordered pages,
with no final transfer-limit flag. Coordinates are lon/lat EPSG:4326 in the
reference JSON; fitting uses EPSG:32620 easting/northing and errors use WGS84
geodesic metres. Source and reference hashes, query bounds, page offsets and
Gannet Rock lookup receipts are recorded separately.

The entire neatline is rendered, including Gannet Rock, Green Island and the
southern/eastern island groups. An independent densified-polygon alpha check
reports zero missing interior cells and zero excess cells beyond the fixed
one-output-cell edge tolerance. The affine determinant has the expected negative
sign for x-right/y-down pixels, with no affine folds. Output cells are 8 projected
metres in EPSG:3857; this is not an accuracy claim.

Reproduce using `render_sheet.py` on the original JPEG, frozen fit and
`components.json`, then `verify_coverage.py` on the same inputs/output. Score the
original and audited check files separately with `score.py`. Preserve both
versions; neither authorizes parcel, title, access or present-ownership claims.

The actual 5982 × 5266 raster loaded in the private Codex browser. Overview and
1 km scale views, sheet selection, a 50% opacity setting and modern references
were checked, with no console errors/warnings. No public deployment is involved.
