# Agent guide for NS Marks The Spot

NS Marks The Spot contains two delivery surfaces:

- `web/`: the current product focus, an online React, TypeScript, Vite, and
  Leaflet map.
- `ns-marks-the-spot/` and `ns-marks-the-spot.xcodeproj`: the native Apple app,
  maintained as a separate surface.

Route work by the files and user-visible outcome in scope. A web-map task does
not inherit native MapKit, SwiftUI, Xcode, or App Store requirements. A native
task does not automatically require web changes.

## Web-map work

- Start with `web/README.md`, `web/package.json`, and the files directly relevant
  to the requested behavior. Read the matching section of `ARCHITECTURE.md` for
  architecture, evidence-contract, print/export, or data-source changes.
- Follow the existing React and Leaflet architecture. Do not add a map-engine
  facade, speculative provider abstraction, service layer, schema, or reusable
  subsystem without a current need.
- Keep the map useful on mobile browsers. Verify the rendered interaction when a
  change affects layout, controls, layers, selection, or evidence presentation;
  unit tests and builds do not substitute for browser behavior.
- User-loaded maps, browser location, and other local inputs stay in the browser
  unless a requested feature explicitly establishes a different privacy
  contract.
- Prefer a focused test for changed logic or a reproduced defect. Do not broaden
  a web task into unrelated data refreshes, documentation cleanup, or native
  modernization.

## Evidence and map safety

The map is a screening and research tool, not legal proof.

- Preserve the identity and provenance of every source. Distinguish official
  records, project-derived layers, and user-loaded material.
- Do not invent or interpolate a PID, civic address, parcel match, destination,
  ownership claim, access conclusion, value, permission, flow, power, flood
  probability, or site condition.
- Keep `returned-empty`, `outside-coverage`, `unsupported`, `source-error`,
  `licence-blocked`, `boundary-ambiguous`, and similar states distinct. An empty
  or failed response is not evidence of absence.
- Keep notice, account, parcel, civic-address, assessed-value, and outcome
  evidence attached to their actual identifiers and dates. Do not silently
  promote one kind of evidence into another.
- Preserve licence gates, required attribution, scale/accuracy caveats, and
  source links in the rendered UI. Direct-source permission, derived-tile
  provenance, repository licensing, and deployment clearance are separate
  questions.
- Historical-map acceptance is geographic and numerical, not proof that a
  script completed. Keep rejected or unsupported sheets fail-closed.

## Native work

- Apply Apple-platform guidance only when the task touches the native app.
- Confirm deployment targets, Swift settings, and current architecture from the
  Xcode project before giving version-specific advice.
- Follow established native patterns in the touched subsystem. Do not revive the
  speculative `MapEngine` and `MapLayer` protocol requirement from the former
  guide.
- Run native builds or tests in proportion to the native change. A web-only or
  instruction-only change does not require a local Xcode build.

## Verification

For a clean web setup:

```bash
cd web
npm ci
npm test
npm run lint
npm run build
```

Use focused Vitest paths during iteration, then run the gates appropriate to the
final diff. CI classifies web, native, documentation, and shared-infrastructure
paths and reports the stable `Build gate + tests` check.

Local verification, hosted CI, merge, NS Marks deployment, KinNoKi publication,
and live custom-domain acceptance are separate states. Do not call the website
deployed from a build or repository merge alone.

## Source and publication boundary

- NS Marks The Spot owns the web-map source, GIS/evidence contracts, and
  repository licence boundary.
- KinNoKi Labs publishes a separately pinned generated copy. A source change in
  this repository does not update that pin or prove production deployment.
- Production proof requires the intended source SHA, generated artifact parity,
  the public `source.json` receipt, rendered browser behavior, and a clean
  console after hosting succeeds.

## Repository workflow

- Use `feature/* -> nightly -> weekly -> main`.
- Normal feature work branches from and opens a PR to `nightly`. Promotions are
  separate PRs and should be opened only when requested.
- Hotfixes branch from and PR to `main`, then flow back to `weekly` and
  `nightly`.
- Never push directly to protected branches.
- Inspect branch, upstream, and working tree before editing. Preserve unrelated
  changes and user-owned history.
- Use coherent Conventional Commits. Publish when the task type and user request
  call for it; do not auto-rebase or force-push as a standing rule.
- Update documentation only when a change makes the existing description
  inaccurate.
