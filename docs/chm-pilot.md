# Judique LiDAR canopy-height pilot

The default-off **LiDAR canopy height · Judique pilot** control is under
**Forestry & Ecology**. It is a project-coloured 1 m raster, separate from
the Province's inventory-polygon **Forest stand height** layer. The normal
build keeps its switch unavailable because the pilot tiles are not published.
An explicitly configured local host enables preview after the existing Province
acknowledgement gate. CHM licence coverage remains provisional. Print and PDF
reproduction stay locked independently of viewing acceptance.

## Source and pilot choice

The [Elevation Explorer](https://nsgi.novascotia.ca/datalocator/elevation/)
distributes CHM as downloadable 10K GeoTIFFs. Its
[derived-product index](https://nsgiwa.novascotia.ca/arcgis/rest/services/ELEV/ELEV_LIDAR_ELEVATION_UT83/MapServer/3)
is an index, not a canopy-image map service. The pinned index response is in
[`source-index.json`](../web/scripts/chm/source-index.json).

The pilot uses one complete sheet, **1045850061400**, project **201701**,
file `1045850061400_201701_CHM.tif`, acquired in **2017** by Leading Edge
Geomatics. It covers approximately 43 km² around Judique in Inverness County,
within the Cape Breton pilot region. One sheet keeps the first version small
and avoids combining acquisitions from different projects. The raster is
NAD83(CSRS)v6 / UTM Zone 20N with 1 m Float32 pixels. The source index gives
CGVD2013 as the vertical reference; CHM values are height **above ground** in
metres, not terrain elevation above sea level.

The Province's broader CHM collection dates to 2016–2020; this pilot is
specifically 2017. A source year is not a current forest observation. The layer
is not a timber cruise or a current inspection and establishes neither
ownership nor access permission.

## Download and storage

A direct per-sheet download works without manual map clicks. The public
Explorer JavaScript resolves a DDS request to
`https://nsgi.novascotia.ca/WSF_DDS/DDS.svc/DownloadFileByReference`, with
`DATASET_ID=98` and `REF_ID=1045850061400_201701`. The builder resolves the
Explorer's current public request key at runtime and never stores it in a
receipt or prints the keyed URL. If the Explorer configuration changes, it
fails closed. The official Explorer remains the manual fallback for that exact
sheet and project; place its extracted TIFF in the supplied input directory.

The estimate before the full download allowed 1.5 GB of working space. The
TIFF entry was about 183 MB compressed and 193 MB extracted. The complete ZIP
also includes an approximately 51 MB overview, making the archive **234 MB**;
the downloader caps it at 260 MB and extracts only the reviewed TIFF.

The local build produced **1,558 PNG tiles, 38,619,862 bytes**, at zooms 10–17.
The optional COG is **193,910,374 bytes**. Keeping the original ZIP, TIFF,
tiles and COG requires about 660 MB, plus temporary build files. No imagery
or COG is committed to the repository.

## Build and preview locally

Use Python 3.11+ with GDAL's Python bindings and NumPy available in the same
interpreter, plus the GDAL 3.11+ `gdal raster tile` CLI used by Fletcher.
The local build used GDAL 3.9.0 Python bindings and the GDAL 3.13.3 CLI.
The pipeline follows the Fletcher raster-to-XYZ approach and the Atlas/Fletcher
immutable revision and `source.json` conventions.

From the repository root, with output directories outside the repository:

```sh
python3 web/scripts/chm/build_pilot.py \
  --input-dir /path/to/chm-input \
  --out /path/to/chm-tiles/chm-judique-2017-20261019.1 \
  --download --cog

python3 -m web.scripts.chm.serve_pilot \
  --directory /path/to/chm-tiles --port 4199

cd web
VITE_CHM_TILE_BASE_URL=http://127.0.0.1:4199 npm run dev
```

Omit `--download` to use an already verified input TIFF. Omit `--cog` for tiles
alone. Existing outputs and mismatched input hashes are refused. Use a new
empty revision directory for a rebuild; failed output does not receive a
`source.json` success receipt. The preview server reuses the Fletcher server,
adds CORS for local browser rendering and binds only to `127.0.0.1`.

The URL layout is
`{base}/chm-judique-2017-20261019.1/{z}/{x}/{y}.png`, with
`source.json` and `tile-inventory.json` beside the pyramid. The committed
[build receipt](chm-pilot/source.json) records source, manifest and builder
hashes, projection, dimensions, acquisition year, palette counts, tile inventory
hash, output sizes and COG validation. It records local output, not publication.

The height classes are 0–<2, 2–<5, 5–<10, 10–<15, 15–<20, 20–<30, and 30 m
or above. Zero remains a measured low-height class. NoData, non-finite and
negative values are transparent. Reprojection and every overview use nearest
resampling to preserve classes; they do not average class colours into new
heights. Display zooms above 17 enlarge existing tiles. Transparent PNGs within
the pyramid's rectangular bounds are retained to avoid missing-object errors.

## Optional GIS file

`--cog` writes `judique-2017-chm.cog.tif`, retaining the original Float32
heights, source projection, 1 m grid and NoData value. The builder verifies
the COG layout and compares every pixel value to the original. This is an
optional file for QGIS or [RustGIS](https://web.rustgis.app), not a new app
dependency. Opening it in either application's UI has not been verified.

## Verification and publication boundary

Local browser evidence uses the real generated tiles at desktop and phone
viewport sizes. The screenshot location, approximately 45.8922, -61.4298,
falls within the Province's mapped stand `S038-01993`, object `140404`, in the
[forest inventory service](https://nsgiwa.novascotia.ca/arcgis/rest/services/FOR/FOR_ProvLandscapeViewer_UT83/MapServer/7).
Its inventory photo year is 2008, which is separate from the 2017 lidar date.
This identifies a mapped forest context for the preview, not present-day field
acceptance or agreement between the two height datasets.

`npm test` includes the bounded downloader/extraction tests and the catalogue,
licence, print-lock and tile-state tests. Browser tests use synthetic tiles to
exercise the real controls, mobile layout, licence gate and source credits.
Those synthetic tests do not establish the source raster's accuracy.

An independent numerical check inspected all 1,558 tiles for palette-only
colours and compared 5,519 samples against same-class 3×3 neighbourhoods in
the original UTM grid, with zero class/geographic mismatches. It excluded
19,991 samples near class edges rather than treating multiple nearest-sampling
choices as evidence of geographic error. The direct `gdal raster tile` path
avoids the rounded read windows in legacy `gdal2tiles` that the first check
caught. The [numerical receipt](chm-pilot/geographic-verification.json) records
the method and sample counts; it is not a field-accuracy measurement.

The same three notices as lidar hillshade remain in the layer attribution,
live credits and receipt under the provisional
[Unrestricted licence](https://nsgiwa.novascotia.ca/documents/licenses/unrestricted/unrestrictedLicense.pdf).
The acknowledgement gate is not confirmation that this licence covers CHM.
Do not upload tiles or COGs, set a public default host or deploy until Dan
explicitly approves and GeoInfo confirms the derived-product licence and uses.
After that separate approval, the intended host convention is
`https://tiles.kinnokilabs.com/{revision}/...`. No upload command is included.

A source PR or Nightly merge does not update KinNoKi's pinned copy, a public
receipt or a deployment. Public-host parity, CORS and rendered acceptance remain
separate future work after those permissions.
