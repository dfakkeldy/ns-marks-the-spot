# Slop cleanup implementation

Implemented 2026-09-05 on `feature/slop-cleanup`, based on `origin/nightly` at
`0e7af2bbf`. The original audit examined `88f91fb3a` on
`feature/app-icon-refresh`; each finding was rechecked against the newer base.
The original checkout and its unfinished icon work were preserved.

## Changes by audit finding

| Finding | Implementation |
| --- | --- |
| §2.1 Obsolete KMZ parser | Removed `extractKmzDocument` and `parseKmz`. Retargeted document selection, malformed archive and empty KML cases to the active `parseKmzWithAssets` path; also check embedded asset bytes. |
| §2.2 CSS source-text tests | Removed the enlarged 1,018-line suite. Added six Chromium checks using real components for keyboard focus, phone controls, georeferencing at two viewport widths, and research/field print bounds with attribution. Wired them into CI. |
| §2.3 Test-only production helpers | Removed disconnected photo/preview sizing, offline-status, geodesy and hydro calculations and their dedicated tests. Retained actual processing, dataset, generator and styling coverage. Added actual ImageIO importer sizing cases for small and large images. |
| §2.4 Archived browser receipt | Preserved the historical JSON and screenshots. Moved integrity/privacy checks into `tools/validate_browser_evidence.py`, run by CI independently of product tests; deleted validator self-tests. |
| §3.1 Unused networking abstraction | Removed `TileFetching` and `URLSessionTileFetcher`. Preserved request construction, licence gates and the source-confinement guard, now narrowed to the remaining package transport. |
| §3.2 Print wrappers | Replaced seven one-use wrappers with direct calls to the existing generic `visibilityFor`. |
| §3.3 Uncalled conveniences | Removed `listingForPid`, `clearPhotoMessages`, `dismissLicenceSweepFailure` and `clearNotice`. |
| §4.1 Duplicate XML parsing | Parse XML once at routing and pass the resulting `Document` to KML/GPX conversion. Updated import and export round-trip tests. |
| §4.2 Duplicate ZIP inflation | Classification reads directory names through fflate's filter without inflating entries. The selected reader performs decompression once. This avoids introducing an archive cache or changing the routing API. |

## Behavior found during replacement testing

The rendered research print check exposed an 88-pixel page overflow that the
CSS-text assertions had missed. A long licence paragraph made every cell in its
grid row tall. Research attribution now flows through two columns, retaining
all notices and source links. The page and its supporting content fit the
Letter bounds in the fixture; the resulting screenshot was visually reviewed.

## Verification

- Six browser checks pass with no collected console/page errors. The suite uses
  synthetic print evidence and substituted OpenStreetMap tiles; it does not
  establish live-source acceptance or cross-browser compatibility.
- A temporary `outline: none !important` mutation caused the new keyboard-focus
  check to fail at its computed-outline assertion. Restoring the stylesheet
  returned the full browser suite to green. The mutation was not retained.
- XML regression coverage asserts both converted geometry and one DOM parse.
  ZIP coverage demonstrates classification without reading a corrupt compressed
  payload, followed by rejection from the actual importer.
- Full web run: 2,087 Vitest tests passed, one skipped, across 189 passing
  files and one skipped file; all 27 script tests passed.
- Web lint, TypeScript/production build, shared-data parity (13 files), and the
  archived-evidence check pass. Vite retains its large-chunk warning.
- Independent review found no actionable issue in the non-browser changes;
  its focused parser/export run passed 48 tests.
- Native changes received static review. The required build-slot wrapper
  returned exit 75 (outside its preferred schedule) for `swift test`; no native
  build or test result is claimed. Native verification remains pending.
- These are local verification results, not hosted CI or deployment acceptance.
