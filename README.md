# NS Marks The Spot

NS Marks The Spot is an open-source iOS and iPadOS map app for exploring
georeferenced historical Nova Scotia maps over modern map context.

The v1.0 release candidate focuses on Hugh Fletcher historical map overlays,
adjustable transparency, optional Nova Scotia reference layers, waterfall POIs,
and Fletcher offline area preparation for field research.

## Current Status

Status as of July 1, 2026:

- GitHub Pages is served from `main` at `docs/`.
- The current Pages site is published at <https://dfakkeldy.github.io/ns-marks-the-spot/>.
- `nightly` is the integration branch for v1.0 app work and nightly TestFlight uploads.
- The latest verified release train uploaded and distributed TestFlight build `1.0 (4)` to internal testers.
- There are no open GitHub PRs or issues in the public repository.
- App Store submission is not complete yet. See [docs/APP_STORE_NEXT_STEPS.md](docs/APP_STORE_NEXT_STEPS.md).

## Product Scope

Core v1.0 capabilities:

- Historical Fletcher map overlay on top of modern MapKit terrain.
- Transparency slider for comparing historical and modern geography.
- Optional Nova Scotia reference layers, including property, Crown land, flood-risk, and waterfall context.
- Viewed-tile caching for field use.
- Prepared offline Fletcher areas, with restricted online-only behavior for NS Aerial and provincial services.
- Data Sources & Licenses disclosure for historical and provincial map material.
- Optional current-location display with an in-app location purpose string.

Deferred after v1.0:

- Bulk offline support for NS Aerial imagery.
- Bulk offline support for restricted provincial layers where licensing permits.
- Additional historical map collections beyond Fletcher.
- User-submitted POIs and syncing improvements.

## Repository Map

- [ARCHITECTURE.md](ARCHITECTURE.md): map-engine boundary, services, data flow, and release architecture.
- [plan.md](plan.md): near-term development plan.
- [docs/ROADMAP.md](docs/ROADMAP.md): v1.0 and post-v1 roadmap.
- [docs/APP_STORE_NEXT_STEPS.md](docs/APP_STORE_NEXT_STEPS.md): next ten App Store steps and pre-flight gaps.
- [docs/FASTLANE.md](docs/FASTLANE.md): Fastlane lanes, metadata files, secrets, and known release notes.
- [docs/BRANCH_CLEANUP.md](docs/BRANCH_CLEANUP.md): local branch/worktree cleanup map.
- [docs/guides/devlog.md](docs/guides/devlog.md): generated build-in-public devlog source.
- [docs/devlog.html](docs/devlog.html): generated public devlog page.

## Development

Project facts:

- Xcode: 26.6 locally; GitHub Actions selects Xcode 26.5.
- Deployment target: iOS 26.5.
- Swift language setting: `SWIFT_VERSION = 5.0`.
- App bundle id: `com.danfakkeldy.nsmarksthespot`.
- Version: `MARKETING_VERSION = 1.0`.
- Build number in source: `CURRENT_PROJECT_VERSION = 1`; Fastlane increments during upload.
- Third-party app dependencies: none.

Useful local commands:

```sh
xcodebuild -resolvePackageDependencies \
  -project ns-marks-the-spot.xcodeproj \
  -scheme ns-marks-the-spot

xcodebuild build-for-testing \
  -project ns-marks-the-spot.xcodeproj \
  -scheme ns-marks-the-spot \
  -destination "generic/platform=iOS Simulator" \
  CODE_SIGNING_ALLOWED=NO

PATH="$HOME/.rbenv/shims:$PATH" bundle exec fastlane ios lint_metadata
PATH="$HOME/.rbenv/shims:$PATH" bundle exec fastlane ios build
make doc-automation-test
make devlog-update
```

## Release Engineering

This repository uses a one-way promotion ladder:

`feature/* -> nightly -> weekly -> main`

- Feature work branches from `nightly`; feature PRs target `nightly`.
- `nightly` feeds daily internal TestFlight builds through the release train workflow.
- `weekly` is promoted from `nightly` and feeds Monday beta builds.
- `main` remains the GitHub default branch, hosts GitHub Pages, and contains workflow definitions.
- App Store releases are cut by pushing a `v*` tag or dispatching the App Store Release workflow from `main`.
- Hotfix exception: branch from `main`, PR to `main`, then merge `main` back down into `weekly` and `nightly`.

| Branch | Required approvals | Required check | Strict | Intended source |
| --- | ---: | --- | --- | --- |
| `main` | 0 | `Build gate + tests` | Yes | `weekly` or `hotfix/*` |
| `weekly` | 0 | `Build gate + tests` | Yes | `nightly`, or `main` for hotfix back-merge |
| `nightly` | 0 | `Build gate + tests` | No | feature and integration branches |

Release train uploads require these GitHub Actions secrets:

- `APP_STORE_CONNECT_API_KEY_JSON`
- `MATCH_PASSWORD`
- `MATCH_GIT_SSH_KEY`

Scheduled workflows run from the default branch (`main`). Use workflow dispatch
with `dry_run=true` for non-shipping compile-and-test validation. Shipping
release trains fail when signing/App Store secrets or match configuration are
missing.
