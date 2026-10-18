# Corrected Hawkesbury–Mabou corridor tiles

The accepted combined raster is packaged as a separate XYZ PNG preview,
`fletcher-corridor-20260908.1`. It contains **1,443 tiles / 8,504,118 tile bytes**
at zooms 8–15. Zoom 15 is 4.777 projected metres per pixel, close to the source's
5 m cells. Closer browser zooms enlarge those tiles. This avoids the 4096-pixel
whole-image preview limit; it does not create additional source detail.

Only the accepted narrow corridor is visible. The original colours, cropping
and 27.79 m southern road step remain. The [browsing acceptance](../southern-seam/browsing-acceptance.json)
and original failed 25 m comparison remain unchanged. No new controls or
geographic fitting were performed. Wider sheet coverage is not accepted.

## Package and verification

Local package: `~/Downloads/fletcher-corridor-tiles/fletcher-corridor-20260908.1/`.
The sibling ZIP contains that directory, including `source.json` and the complete
per-tile SHA-256 inventory. Large imagery stays outside Git. The committed
[source receipt](source.json) binds tiles to the accepted raster hash and
records original source attribution, licensing, modifications and limitations.

The direct GDAL raster tile command preserves all tile objects within the
raster's rectangular bounds; 1,180 are completely transparent. This prevents
missing-object errors outside the narrow visible strip. Newer `gdal2tiles`
wrappers force blank-tile omission, so they are not used. The direct command
also avoids the legacy wrapper's intermediate resampling.

[Verification](verification.json) assembles every zoom-15 tile on its exact XYZ
grid and compares it with a continuous GDAL render of the accepted raster:

- All expected XYZ objects exist at every zoom.
- Opaque RGB pixels match exactly, including tile boundaries.
- No transparent cuts through opaque imagery at tile boundaries.
- Zero transparent cells among 22,574 cells touched by the checked Route 19 line.

Coverage is not a new geographic-accuracy result. The scan-colour change and
accepted geographic offset remain visible at the southern sheet join.

## NSMtS preview

Set `VITE_FLETCHER_CORRIDOR_TILE_BASE_URL` to the parent URL containing the revision
folder. It is unset by default. The existing Fletcher layer and its published
24-sheet configuration are unchanged. An enabled build adds a separate map
control with a visibility checkbox, opacity slider, accuracy note, source receipt
and Rumsey/Stanford/CC BY-NC-SA 3.0 credits. This review layer is explicitly
excluded from map exports; final catalogue/export integration is separate work.

Local preview (two terminals):

```sh
python3 -m tools.fletcher.serve_corridor_tiles \
  --directory ~/Downloads/fletcher-corridor-tiles
cd web
VITE_FLETCHER_CORRIDOR_TILE_BASE_URL=http://127.0.0.1:4198 \
  npm run dev -- --host 127.0.0.1 --port 4197 --strictPort
```

Open `http://127.0.0.1:4197/?basemap=osm&taxSale=off&layers=modern&position=45.74742,-61.4635,17`.
The tile base may be HTTPS, or HTTP on localhost/127.0.0.1 for local review.
The local server uses persistent HTTP connections and a larger request queue
for tile bursts; the stock Python server intermittently dropped a connection
in the browser stress run. No public tile hosting, production layer replacement,
merge or deployment was performed.

The actual PNGs were served to NSMtS and checked with Playwright because the
Browser plugin was unavailable. Desktop 1440×1000 and phone 390×844 checks covered
visibility, opacity, reload, southern seam, Long Point, northern seam, both ends
and an overview. Two final browser runs each completed 95 successful tile responses with no
browser errors. The final [browser receipt](browser-verification.json) records
those requests. All 2,195 web tests and 28 script checks passed (one web test
skipped); lint, production build, Python lint and diff checks passed.
Screenshots and the browser receipt remain beside the package in `browser/`.

## Rebuild

Requires the `gdal raster tile` CLI (tested GDAL 3.13.3), Pillow, and a Python
with GDAL/NumPy for verification. Use a new output directory; the builder refuses
to mix files with an existing package. From the repository root:

```sh
python -m tools.fletcher.tile_corridor --source ACCEPTED_CORRIDOR_TIFF \
  --out NEW_REVISION_DIRECTORY
python tools/fletcher/verify_corridor_tiles.py --tiles NEW_REVISION_DIRECTORY \
  --source ACCEPTED_CORRIDOR_TIFF --coverage-line CHECKED_ROUTE19_LINE_GEOJSON \
  --out VERIFICATION_DIRECTORY
```

The checked line is the unchanged
`~/Downloads/fletcher-southern-seam/revised/route19-coverage-line.geojson`;
its hash is included in verification. The pipeline does not infer acceptance
for other input rasters. Changed pixels require a new revision and verification.
