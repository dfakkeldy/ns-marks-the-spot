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
`simplify_preserve_topology(the_geom, 0.000018)`. Socrata applies that
tolerance in the dataset's own units, which are degrees, even though its
documentation calls it metres; the earlier `2` collapsed 93% of woodland rings
to triangles, which rendered as large background slivers across the forest
fill. 0.000018 degrees is at most two metres on the ground anywhere in Nova
Scotia. This retains polygon topology while reducing an exceptionally dense
dataset (about 17 GB raw) for basemap display. Zooms 8 to 11 are served from
two coarser display copies (half-pixel tolerance, one-pixel minimum ring at
the top of each band) so low-zoom tiles stay small. Source polygons that fail
OGC validity are repaired with GEOS MakeValid (structure method) before
tiling, and the receipt records the repair count per source and the
transformation for every band. Water records with null source geometry retain
their identifiers and rejection reasons in the receipt; the renderer cannot
place them and does not guess their locations.

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
The archive is about 298 MB; five representative browser views fetched about
8 MB in byte ranges. Long Point's rendered labels include Chisholm-MacLean Rd,
with generic Track/Driveway placeholders suppressed. Desktop, mobile, day/night,
Halifax, rural inland, border and overview views were inspected. An actual
in-app PDF download retained the road name, archive identity, release dates,
licences and scale/access caveats. Missing-archive/retry behaviour was exercised.

The same day's first archive (`ns-94fe4f0b…`) drew large triangular slivers
of background across woodland at every zoom because its download used a
Socrata tolerance of `2`, which that service applies in degrees: 157,638 of
168,927 woodland rings were bare triangles. The rebuilt archive
(`ns-7c383881…`) uses the degree tolerance above, repairs 142 woodland and 38
coastal-water polygons that failed OGC validity, and records
`judiqueWoodlandVerticesPerRing` (37.8, previously 4.8) in the receipt; the
generator now fails closed if that figure drops below 8. Judique and Port
Hawkesbury were re-inspected at zooms 9, 11, 14 and 16 with a clean console.

The generated `.pmtiles` file is ignored by Git and remains in
`web/public/atlas/provincial/` for local use and checksum verification. A fresh
checkout verifies the pinned R2 object during prebuild when the local artifact
is absent. Failed downloads and mismatched checksums stop the build.

## R2 hosting acceptance — September 5, 2026

The rebuilt archive and matching `source.json` are published in the existing
public `ns-marks-fletcher-tiles` bucket under `provincial-atlas/`:

- [Archive](https://tiles.kinnokilabs.com/provincial-atlas/ns-7c383881956d105c.pmtiles)
- [Source receipt](https://tiles.kinnokilabs.com/provincial-atlas/source.json)

Hosting acceptance for `ns-7c383881956d105c.pmtiles` on September 5, 2026:
a complete public download matched 297,895,825 bytes and SHA-256
`7c383881956d105ce0d4c7d6854ae5e8aea2208c9a7a140a8e587adabc66a9af`.
HEAD returned 200, `Content-Length: 297895825` and `Accept-Ranges: bytes`.
An actual range GET with origin `https://kinnokilabs.ca` returned 206,
128 bytes and `Content-Range: bytes 0-127/297895825`, with matching CORS
and a `PMTiles` header followed by version byte 3. The archive is served as
`application/octet-stream` without content encoding. The 6,820-byte public
`source.json` matched the PR branch's committed receipt byte for byte.

The upload used the existing AWS CLI environment's Python/botocore on Bazzite
with the Fletcher publisher's R2 credentials, exercising object read and write
access on `ns-marks-fletcher-tiles`. The nine-part upload retained a resume
checkpoint and verified each part's checksum. Only the new archive and
`provincial-atlas/source.json` were written; the receipt now requests cache
revalidation. No bucket configuration changed. The previous archive remains
available with its original ETag and byte count, and Fletcher objects were
untouched.

A fresh clone of PR #346, with no local `.pmtiles`, passed `npm ci` and
`npm run check:provincial-atlas`, printing
`Verified provincial Atlas: ns-7c383881956d105c.pmtiles, 6 sources`.
The failed jobs in [CI run 33988766150](https://github.com/dfakkeldy/ns-marks-the-spot/actions/runs/33988766150)
were rerun after publication; `Web tests + build` and `Build gate + tests`
passed. Publishing these two data objects does not update KinNoKi's pinned generated
copy or establish website deployment acceptance.

Earlier the same day, a complete public download of
`ns-94fe4f0b0bbbf54e.pmtiles` matched SHA-256
`94fe4f0b0bbbf54e0936d5139c45feff13383dc4cb89586e63466a95220f14f2`
and 270,489,158 bytes. The public receipt then matched the local receipt byte
for byte. An actual range GET with origin `https://kinnokilabs.ca` returned 206,
127 bytes, and `Content-Range: bytes 0-126/270489158` with matching CORS.

The bucket's read-only CORS rule retains the existing `.com` and localhost
origins and includes `.ca`, both `www` variants, and the local test origin.
GET/HEAD requests may send Range/If-Match/If-None-Match; the response exposes
ETag, Content-Range and Accept-Ranges alongside the previous headers.

`.env.production` points the map at this public directory. The production
build passed, contains the R2 URL, and omits the duplicate `.pmtiles` file
from `dist`; the source receipt stays with the website. Its local browser
preview loaded the R2-backed map to Ready and displayed Chisholm-MacLean Rd.
That initial acceptance did not include hosted CI, a PR, a KinNoKi pin update
or website deployment.
