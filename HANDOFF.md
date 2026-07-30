# Fletcher web GCP import — handoff log

## 2026-07-30 — Points-file parser landed; UI wiring still open

Done: `web/src/userMaps/parsers/fletcherGcps.ts` parses the emitted Fletcher
points CSV into the georeferencer's `Gcp` shape and serializes it back. Controls
become GCPs; checks are parsed and returned separately but never fed to the
solver, matching the Python side — promoting a check would make the accuracy
figure circular. Refuses wrong headers, non-numeric and out-of-range
coordinates, files with no controls, and points that fall outside a supplied
`pixelSize` (a file measured against a different scan). 35 tests, including a
byte-identical round trip over all 24 real emitted CSVs. Full web suite: 1057
passing, lint clean.

Two things worth knowing. The two Python emitters disagree on precision
(`emit_gcps.py` writes lon/lat at 6 dp, `emit_physical_gcps.py` at 8 dp), so the
parser echoes each field's original text rather than reformatting a float —
otherwise one emitter's files would not round-trip. And the round-trip test
first resolved its directory from `process.cwd()`, which under vitest found only
17 of the 24 files; it now resolves from `import.meta.url`.

Next: the UI half of this milestone is NOT done. Nothing yet imports a points
file into an open record, pre-places pins, or shows residuals over them. That
needs `useGeoreferenceSession` (owns residuals), `GeoreferencePanel`, `GcpList`,
and an import affordance alongside `ImportDialog`, each with the component tests
this repo expects.

Resume:
```
Worktree: /Users/dfakkeldy/Developer/ns-marks-the-spot/.claude/worktrees/fletcher-web-gcp-import
Branch:   fletcher/web-gcp-import (PR open into nightly)
Next:     Wire parseFletcherGcps into the UI: accept a .csv in the import path,
          load its controls into the open record via saveGcps, open the panel
          over the pre-placed pins, and keep the residual column live so the
          human can see which pins are worst. Add component tests to match
          GcpList.test.tsx / GeoreferencePanel.test.tsx. Do NOT read map crops.
```
