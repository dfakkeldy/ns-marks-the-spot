# Provincial-first Atlas

Approved scope: prefer suitable, reusable provincial data for Nova Scotia's
roads, names, water, boundaries and woodland while preserving Atlas day/night
cartography, browser privacy, existing research overlays and print parity.
Supplemental OpenStreetMap geography must remain explicitly credited.

## Implementation and acceptance

- [x] Build a reproducible provincial vector-tile archive from the open-data
  downloads. Preserve original identifiers, names and classifications. Record
  source URLs, release dates, counts, hashes, licences and generation settings.
  Reject incomplete downloads and sources changing during a download.
- [x] Use the same archive and style in the live map, study and PDF renderer.
  Replace competing road/rail/ferry geometry and labels with NSRN; use GeoNAMES
  at its published point locations, NSTDB water and woodland, and provincial
  municipal boundaries. Keep OSM ocean context, non-tree land use and building
  footprints explicitly supplemental. Atlas coverage is Nova Scotia; OSM
  remains the separately selectable worldwide basemap.
- [x] Expose provenance, dates, scale and the open-government attribution in
  the map and exports. Do not describe the hybrid as wholly provincial or
  guarantee current physical conditions from a dataset release date.
- [x] Validate tile contents, source classification, style schemas and failure
  handling. Check Long Point, Halifax, rural inland and the NB border in desktop
  and mobile browsers, day/night, and export. Run applicable web gates.

## Source selection

NSRN (`484g-adjn`) supplies roads, tracks, trails, rail and ferry connectors;
NSCAF civic points (`tntn-er5g`) remain the existing address-search source.
GeoNAMES (`xf3i-vxcb`) supplies official name points. NSTDB water polygons
(`h8jb-hzrm`) and lines (`fpca-jrmt`) supply classified hydrography; land cover
(`xed8-vvg5`) supplies tree areas, orchards, nurseries and reforestation.
Municipal boundaries (`7bqh-hssn`) are administrative boundaries, not civic
community or parcel boundaries.

The woodland download is generalized with Socrata's
`simplify_preserve_topology(the_geom, 2)` (tolerance in metres). This retains
polygon topology while reducing an exceptionally dense dataset for basemap
display. The receipt discloses the transformation. Water records with null
source geometry retain their identifiers and rejection reasons in the receipt;
the renderer cannot place them and does not guess their locations.

Provincial buildings were compared before migration: NSTDB uses polygons for
buildings over 30 metres on one side and points for others. Keep OSM footprints
as supplemental basemap detail and retain the existing provincial Buildings
overlay. Provincial tree cover is not a comprehensive land-use inventory;
retain OSM grass, farmland and settlement fills. Existing provincial imagery,
terrain, parcels and specialist overlays keep their controls and licence gates.

## Publication boundary

Source implementation and local verification do not publish the website.
KinNoKi's generated copy, hosting, source receipt and custom-domain acceptance
remain separate. Refreshes are explicit builds, not a newly scheduled task.

Local acceptance on September 5, 2026: 907,030 downloaded source records;
one water-line record quarantined because its published geometry is null.
The archive is about 270 MB; five representative browser views fetched about
8 MB in byte ranges. Long Point's rendered labels include Chisholm-MacLean Rd,
with generic Track/Driveway placeholders suppressed. Desktop, mobile, day/night,
Halifax, rural inland, border and overview views were inspected. An actual
in-app PDF download retained the road name, archive identity, release dates,
licences and scale/access caveats. Missing-archive/retry behaviour was exercised.

The generated `.pmtiles` file is ignored by Git and remains in
`web/public/atlas/provincial/` for local use and checksum verification. A fresh
checkout verifies the pinned R2 object during prebuild when the local artifact
is absent. Failed downloads and mismatched checksums stop the build.

## R2 hosting acceptance — September 5, 2026

The archive and matching `source.json` are published in the existing public
`ns-marks-fletcher-tiles` bucket under `provincial-atlas/`:

- [Archive](https://tiles.kinnokilabs.com/provincial-atlas/ns-94fe4f0b0bbbf54e.pmtiles)
- [Source receipt](https://tiles.kinnokilabs.com/provincial-atlas/source.json)

A complete public download matched SHA-256
`94fe4f0b0bbbf54e0936d5139c45feff13383dc4cb89586e63466a95220f14f2`
and 270,489,158 bytes. The public receipt matched the local receipt byte for
byte. An actual range GET with origin `https://kinnokilabs.ca` returned 206,
127 bytes, and `Content-Range: bytes 0-126/270489158` with matching CORS.

The bucket's read-only CORS rule retains the existing `.com` and localhost
origins and includes `.ca`, both `www` variants, and the local test origin.
GET/HEAD requests may send Range/If-Match/If-None-Match; the response exposes
ETag, Content-Range and Accept-Ranges alongside the previous headers.

`.env.production` points the map at this public directory. The production
build passed, contains the R2 URL, and omits the duplicate `.pmtiles` file
from `dist`; the source receipt stays with the website. Its local browser
preview loaded the R2-backed map to Ready and displayed Chisholm-MacLean Rd.
No hosted CI run, PR, KinNoKi pin update or website deployment was performed.
