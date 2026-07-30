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
