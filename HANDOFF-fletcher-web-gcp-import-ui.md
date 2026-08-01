# Fletcher web GCP import — UI wiring

## 2026-07-30 — Points file imports into an open record

Done: `session.importGcps` replaces every GCP in one undoable step, clearing any
half-placed pair and re-seeding the id counter so a file using `gcp-N` labels
cannot collide with later manual points. `GeoreferencePanel` grows a "Load points
file" input that parses with the record's own `pixelSize`, so a file measured
against a different scan is refused rather than placing every pin wrong. The
status line names how many points were replaced and points at undo, and says the
held-out checks were left out on purpose. Residuals needed no wiring — `report`
is a `useMemo` over `gcps`, so the column is live the moment the import commits.
9 new tests; full web suite 1066 passing, tsc and lint clean, build succeeds.

Not verified in a real browser: the preview tooling is scoped to this session's
working directory, which is a different repo. The component tests do render the
real panel and run the real parser over a real `File`, but that is jsdom, not a
browser. Worth one live look at the panel before this is relied on.

Next: sheet 16 (shares the 45.92 seam with 19, has Mabou on it). Mine NSTDB
candidates, emit a points CSV, import it here, drag. Budget controls by spacing
(~16% law), not a fixed per-sheet count.

Resume:
```
Worktree: /Users/dfakkeldy/Developer/ns-marks-the-spot/.claude/worktrees/fletcher-web-gcp-import-ui
Branch:   fletcher/web-gcp-import-ui (PR open into nightly)
Next:     Open the panel on a real Fletcher scan in a dev build, load
          tools/fletcher/gcps/sheet-19.csv, confirm pins land and residuals
          populate. Then start sheet 16: mine candidates, emit CSV, import,
          drag round 1 of 3. Do NOT read map crops.
```

## 2026-08-01 — Open sessions checkpoint themselves to disk

Done: `AUTO_EXPORT_INTERVAL_MS` (5 min) in `autoExport.ts`; `GeoreferencePanel`
now writes a points CSV on a timer, not only on Done. The export baseline ref
(`exported`) advances on every write, so a checkpoint followed by Done does not
write the same points twice, and an idle panel writes nothing. IndexedDB was
already safe — `useGeoreferenceSession` debounces at 400 ms — so this protects
the FILE, the only copy that survives losing the origin. 4 tests added,
mutation-checked; suite 1097 green, tsc + eslint clean. Live panel verified to
register exactly one 300 000 ms interval (StrictMode registers two, cleanup
reclaims one).

Next: sheet 22 point placement (4 corner bootstrap loaded, 50 proposals in
`web/public/sheet22-proposals.csv`). Then close out sheet 16: freeze ~8
stratified checks, refit on the rest, score. Then sheet 14.

Resume:
```
Worktree: /Users/dfakkeldy/Developer/ns-marks-the-spot/.claude/worktrees/fletcher-judique-align
Branch:   fletcher/judique-align (PR #197 open into nightly)
Next:     Start dev server via the `judique` launch.json entry (port 5173),
          then place points on sheet 22 in Chrome. The map record lives in
          IndexedDB on http://localhost:5173 — that origin only.
```
