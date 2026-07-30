# Fletcher feature-led v2 — handoff log

## 2026-07-30 — Sheet 19 v2 result landed and made reviewable

Done: committed the untracked `sheet-19-score.json`; added the Sheet 19
feature-led-v2 row to `reports/fletcher/RESULTS.md` (45 controls, 8 frozen
checks, RMS 43.0 / P95 90.8 / max 90.8 m, no gate claimed); scoped the
"must not be uploaded or republished" order to the engraved-grid family so
feature-led v2 can publish after a gate and human acceptance. Branch pushed, PR
opened into `nightly`. Nothing is warped, tiled, uploaded, or visually accepted.

Next: settle the accuracy gate by answering offset-vs-distortion from the points
already measured — refit at N = 4, 8, 12, 20, 30, 45 stratified controls against
the 8 frozen checks. Zero human clicks, no image reads.

Resume:
```
Worktree: /Users/dfakkeldy/Developer/ns-marks-the-spot/.claude/worktrees/inverness-tax-sale-report-34e244
Branch:   claude/fletcher-maps-georeferencing-a3f272 (PR open into nightly)
Next:     Using ONLY tools/fletcher/feature_observations/sheet-19.json, refit at
          N = 4, 8, 12, 20, 30, 45 spatially stratified controls and score each
          against the 8 frozen final_checks. Commit the N-to-RMS table and a
          residual-vector-field image. Verdict: uniform frame offset or genuine
          internal warp? Do NOT read map crops. Stop and report cost when done.
```

## 2026-07-30 — Point budget measured; corridor scope set

Done: ran the density diagnostic (`reports/fletcher/SHEET19_DENSITY_DIAGNOSTIC.md`).
Verdict is **distortion, not offset** — 0% of the LOO residual is a uniform
shift. Held-out error has *not* plateaued at 45 controls, and LOO error ≈ 16% of
local control spacing. So 45 is a floor, and placement beats count. Also pinned
the Route 19 corridor from the Bazzite manifest: sheets **22, 19, 16, 14**
(south→north), 19 already measured — scope drops 24 sheets to 4, three left.

Next: build GCP import into the web georeferencer so machine-predicted points
can be pre-placed for dragging. Then pilot sheet 16 (shares the 45.92 seam with
19, has Mabou on it).

Resume:
```
Worktree: /Users/dfakkeldy/Developer/ns-marks-the-spot/.claude/worktrees/inverness-tax-sale-report-34e244
Branch:   new branch fletcher/web-gcp-import off nightly
Next:     Add GCP import to the web georeferencer: load a Fletcher points file
          into an open record, pre-place pins, keep the residual column live,
          and make export->convert round-trip byte-identically under test.
          Budget controls by spacing (~16% law), not by a fixed per-sheet count.
          Do NOT read map crops.
```
