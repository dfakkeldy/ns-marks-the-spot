# NS Marks The Spot

Open-source iOS map app for overlaying georeferenced historical Nova Scotia maps on modern maps.

## Online companion

The `web/` React app is the online-only companion. It mirrors the native
catalog's Province layers—NS Aerial, Property Boundaries, Crown Lands, Flood
Risk Areas, Waterfalls, water features, and transportation—and adds a collapsed,
default-off Topography group for labelled 5 m contours, a collapsed Geology &
Resources group for mineral occurrences, mineral tenure, and abandoned mine
openings, plus a separately licence-gated derived row for NSPRD parcels within
1 kilometre of a published mineral occurrence. A collapsed Environmental health
screens group adds the province's relative arsenic, uranium, and manganese
well-water risk zones and surficial aquifer extent, each shown with the
province's own legend bands and its reminder that a zone describes bedrock, not
a test result for any property. A collapsed, default-off
Municipal zoning group renders unofficial zoning polygons live from five
municipal ArcGIS services—Inverness, Victoria, Richmond, Cumberland, and
Halifax—each linked to its authoritative land use by-law; Nova Scotia publishes
no provincial zoning layer, so an area with no polygon is an area with no data
rather than an area with no zoning. Fletcher remains disabled in the product,
but the direct-Rumsey georeferencing use described for the free Nova Scotia web
map now has scoped written permission; hosting and layer enablement were not
part of that permission-recording task. Four A.F. Church Cape Breton
county maps (Inverness, Victoria, Richmond, Cape Breton; 1884–85, David
Rumsey Map Collection) are catalogued alongside it as disabled rows, with
tiles still pending—see
[docs/CHURCH_MAPS.md](docs/CHURCH_MAPS.md). Its municipal catalog maps the
CBRM July 21, Inverness County August 11, and Annapolis County
August 31, 2026 tax-sale notices against live NSPRD parcel geometry, supports
PID and civic-address search plus tap-to-identify parcel selection, keeps
browser location local, and puts verified Halifax 2022–2025 and Lunenburg
District 2021–2026 outcomes in an unmistakably separate historical mode. Parcel selection collapses long event
lists, and share links preserve the PID, event, layers, and map position. The
parcel sheet can export a timestamped, source-linked evidence note. An
on-map measure tool reads out distances (m/km) and areas (ha + acres) for
frontage and part-lot checks. At
overview zooms the modern basemap carries the view, listed parcels appear as
selectable markers, and a scale bar plus copyable centre/zoom readout stay on
screen; zoom-gated Province imagery and line work take over at legible
scales. An About dialog states the app's data-handling method and links the
source repository. Parcel
context distinguishes intersecting,
nearby, and civic-address road evidence without claiming legal access. Each
authoritative mapped civic point also shows a locally calculated Plus Code that
opens Google Maps directions on request, while mapped geology/resource
intersections are reported source by source with explicit empty/error states.
The same parcel sheet shows dated PVSC assessed-value history from the licensed
open dataset, using an official notice AAN when available or a bounded
point-in-parcel screen otherwise; multiple accounts remain separate and the UI
does not treat assessment as current market value.

- **Your maps** — load your own GeoTIFFs (georeferenced scans, orthophotos) and
  drape them over Nova Scotia with an opacity slider. Plain JPEG and PNG scans
  can be georeferenced in the browser: click a landmark on the scan, then the
  same landmark on the map, and from three points on the scan drapes live.
  Files never leave your device: parsing, warping, georeferencing, and storage
  are all in-browser.

See
[web/README.md](web/README.md) for the source receipt, privacy boundary, and
local verification commands. Candidate hazard, groundwater, coastal, terrain,
and conservation overlays are evaluated in
[docs/property-context-data-candidates.md](docs/property-context-data-candidates.md).

## Release Engineering - Promotion Ladder

This repository uses a one-way promotion ladder:

`feature/* -> nightly -> weekly -> main`

- `main` remains the GitHub default branch and represents stable releases.
- Feature work branches from `nightly`; feature PRs target `nightly`.
- `nightly` is the integration branch and feeds daily TestFlight builds through the release train workflow.
- `weekly` is promoted from `nightly` and feeds Monday beta TestFlight builds through the release train workflow.
- `main` is promoted only from `weekly`; tagging `vX.Y.Z` on a commit with the App Store release workflow cuts the App Store release.
- Hotfix exception: branch from `main`, PR to `main`, then merge `main` back down into `weekly` and `nightly`.

| Branch | Required Approvals | Required Check | Strict | Intended Source |
| --- | --- | --- | --- | --- |
| `main` | 0 | `Build gate + tests` | Yes | `weekly`, or `hotfix/*` |
| `weekly` | 0 | `Build gate + tests` | Yes | `nightly`, or `main` for hotfix back-merge |
| `nightly` | 0 | `Build gate + tests` | No | `feature/*` and integration branches |

All protected branches require PRs to pass `Build gate + tests`; none require review approval because this is a single-maintainer project.

`Build gate + tests` is a stable aggregate check. CI classifies each diff before
starting product suites: web-only changes run the web tests, lint, and Vite
build without reserving a macOS runner; native changes run the Xcode build and
tests; CI-infrastructure changes run both; documentation-only changes satisfy
the aggregate gate after classification. Unknown paths fail safe to native CI
until explicitly classified.

Release train uploads require these GitHub Actions secrets:

- `APP_STORE_CONNECT_API_KEY_JSON`
- `MATCH_PASSWORD`
- `MATCH_GIT_SSH_KEY`

GitHub scheduled workflows run only from the default branch (`main`). Use `workflow_dispatch` with `dry_run=true` for explicitly non-shipping compile-and-test validation. Shipping release trains fail when signing/App Store secrets or match configuration are missing.
