# NS Marks The Spot

Open-source iOS map app for overlaying georeferenced historical Nova Scotia maps on modern maps.

## Online companion

The `web/` React app is the online-only companion. It mirrors the native
catalog's Province layers—NS Aerial, Property Boundaries, Crown Lands, Flood
Risk Areas, Waterfalls, water features, and transportation—and adds a collapsed,
default-off Geology & Resources group for mineral occurrences, mineral tenure,
and abandoned mine openings. Fletcher stays disabled until web-use rights are
clear. Its municipal catalog maps the CBRM July 21 and Inverness County
August 11, 2026 tax-sale notices against live NSPRD parcel geometry, supports
PID and civic-address search plus tap-to-identify parcel selection, keeps
browser location local, and puts verified Halifax 2022–2025 outcomes in an
unmistakably separate historical mode. Parcel selection collapses long event
lists, and share links preserve the PID, event, layers, and map position. The
parcel sheet can export a timestamped, source-linked evidence note. Parcel
context distinguishes intersecting,
nearby, and civic-address road evidence without claiming legal access. Each
authoritative mapped civic point also shows a locally calculated Plus Code that
opens Google Maps directions on request, while mapped geology/resource
intersections are reported source by source with explicit empty/error states.
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

Release train uploads require these GitHub Actions secrets:

- `APP_STORE_CONNECT_API_KEY_JSON`
- `MATCH_PASSWORD`
- `MATCH_GIT_SSH_KEY`

GitHub scheduled workflows run only from the default branch (`main`). Use `workflow_dispatch` with `dry_run=true` for explicitly non-shipping compile-and-test validation. Shipping release trains fail when signing/App Store secrets or match configuration are missing.
