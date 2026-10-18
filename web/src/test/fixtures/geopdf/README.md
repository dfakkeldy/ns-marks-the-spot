# GeoPDF fixtures

## Provenance and licence

`test_iso32000.pdf`, `test_ogc_bp.pdf`, `adobe_style_geospatial.pdf`,
`byte_and_rgbsmall_2pages.pdf`, and `byte_enc.pdf` are immutable test inputs
from `OSGeo/gdal/autotest/gdrivers/data/pdf` under that repository's MIT
licence. The remaining PDFs are repository-owned test data generated from
tracked inputs by `web/scripts/generateGeoPdfFixtures.mjs`.

The external USGS corpus used for the compatibility decision is not stored
here or elsewhere in Git. Its URLs, hashes, and public-domain basis are in
`docs/research/2026-07-27-geopdf-external-corpus.json`.

## Generation and exact tool versions

- Node.js 22.23.1
- pdf-lib 1.17.1
- GDAL 3.9.0, released 2024/05/07 (debug build)
- `gdal_translate` options: `GEO_ENCODING=ISO32000` or `GEO_ENCODING=OGC_BP`,
  and `DPI=72`

Run `npm run generate:geopdf-fixtures` from `web/`. Paths are resolved from the
script, and its output guard refuses writes outside this directory. The
pdf-lib documents have fixed metadata dates and disable object streams. The
two GDAL documents use the tracked 8 by 6 pixel
`web/src/test/fixtures/utm20-8x6.tif`.

## Immutable upstream hashes

| File | SHA-256 |
| --- | --- |
| `adobe_style_geospatial.pdf` | `8492c975c7dd68977566d95b0c1f0db2a24d464bf2105612e20799b04485766b` |
| `byte_and_rgbsmall_2pages.pdf` | `e483d8eec5820e0a828d41d804978e4090d46c806615fa961de0ec205777abb9` |
| `byte_enc.pdf` | `8a621f1857597997c86079c8738bfac2e077bd15d8d8ce4959e8148971cc4678` |
| `test_iso32000.pdf` | `c57b35f6820dcb7d08ae273ed39e935f91af1c9594f99bfb3b3da05ed0197da1` |
| `test_ogc_bp.pdf` | `ec2a34f853a4d5bf86ccf6a7170439b5c89e9a6a674db965ba7d762cbea3a93b` |

Hash drift is a stop condition until the upstream change is inspected.

## Generated-file hashes

| File | Bytes | SHA-256 |
| --- | ---: | --- |
| `corrupt.pdf` | 515 | `cc5f70981143056f4d920a1fb15d5a0d649574c4e7eea6d5e00dc9081b6b2776` |
| `malformed-measure.pdf` | 1,971 | `c546d702dfe021dd5fd0d0b0608f50bfba5f5a2e095e4657a1b6538f0f80cf53` |
| `ns-utm20-iso.pdf` | 1,878 | `43e07add666de062d2dfb91eca17fc807d32eea7e9a1e5fc90b35d8441a82148` |
| `ns-utm20-lgidict.pdf` | 1,896 | `92196cd8210c63aeb14977a6213045a90e97a630dd008bbc6e1136d94ecc101a` |
| `plain.pdf` | 1,030 | `65b2f799cca6153964eab02498be32e1dc1362f1ed886e8803b9e9a8735880c4` |
| `registration-page-2.pdf` | 2,377 | `2aaf9e12c110eb3f09f85dbcf628d80dedcd63350b9d46f9d26ac524bd02992a` |
| `rotated-cropped.pdf` | 2,020 | `c6be781d8862f45a449479157829adb5c3e1e5bf1303520cae212479b89c67b8` |
| `unsupported-crs.pdf` | 1,345 | `4e78a7869df58cd43ec4aa608ddd0b61bb6ec9493434c7ba3cc247a4227a5d34` |

## Expected parser and raster outcomes

The manifest is authoritative for exact expected statuses. Page 1 is the only
page eligible for import. `byte_and_rgbsmall_2pages.pdf` reports two pages and
does not import page 2; `registration-page-2.pdf` deliberately proves that a
registration on a later page does not affect page 1. Missing, invalid,
unsupported-CRS, unsupported, and ambiguous registrations are successful
manual-georeferencing imports. `byte_enc.pdf` is a typed unlock/export error
with no password UI, while `corrupt.pdf` is not a renderable PDF.

The canonical raster contract remains a longest edge of exactly 4,096 pixels,
preserving the page-1 crop, rotation, and aspect ratio on an opaque white
background. No PDF action, JavaScript, form, link, attachment, or remote
resource is executed or retrieved.

## Regeneration is a reviewed operation

A regeneration diff is evidence to review, not an automatic fixture refresh.
Review the exact tool versions, generator diff, source hash, output hashes,
GDAL CRS and geotransform, and expected-status changes before accepting it. CI
uses the committed outputs; it does not run GDAL or download source fixtures.
