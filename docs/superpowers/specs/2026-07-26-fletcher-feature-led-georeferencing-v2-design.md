# Fletcher feature-led georeferencing v2 — Sheet 19 pilot and series system

Date: 2026-07-26
Status: draft for user review
Scope: Hugh Fletcher 1:63,360 Cape Breton sheets (direct Rumsey scans), Sheet 19
pilot first, then a repeatable per-sheet system. Church county maps stay frozen
per `docs/church-four-county-freeze-2026-07-26.md` until this pilot proves the
loop.

## 1. Why the previous attempts failed

Three independent lines of evidence agree:

1. **Wrong reference frame.** The 24-sheet run in `reports/fletcher/RESULTS.md`
   scored residuals against each sheet's own engraved graticule. Sheet 19
   "passed" at RMS 11.5 m while the shipped product was visibly off by
   ~636 m. The 1884 geodetic frame is offset from WGS84, and drawn features
   carry additional survey error relative to that frame. A lattice PASS
   measures neither.
2. **Sparse controls + global transforms cannot express the real distortion.**
   The 2026-07-26 Sheet 19 feature pilot (Codex worktree, uncommitted) fit an
   affine to 12 verified feature controls: control RMS 222.7 m, max 349.8 m.
   No affine places all 12 verified points at once — direct measurement that
   the sheet warps differently in different regions, matching years of manual
   observation. Untouched checks scored RMS 915 m, max 1,588 m, worst on
   River Inhabitants confluences: 1880s interior drainage was sketch-surveyed
   while roads and coast were traversed, so error varies by region *and*
   feature class.
3. **Process weight replaced iteration.** The modern-feature-v1 pipeline
   terminated on its own manifest validation (`source-drift: ...
   list_number must be a non-empty string`) without measuring a single GCP.
   The sheet-19 pilot was a one-shot fit-once-score-once-stop design
   (`stop-affine-failed`). Georeferencing a distorted historical map is
   inherently iterative — fit, look, add points where it is worst, refit —
   and neither pipeline had a loop.

## 2. Goal and acceptance (user-approved 2026-07-26)

- **Workflow**: Claude selects, visually verifies, and records all GCPs;
  the user reviews rendered overlays only.
- **Acceptance bar (tight)**: at z14, roads sit on roads and coves on coves —
  roughly 30–50 m visible agreement — *at and between QA locations with
  feature coverage*. Sparse-coverage zones (featureless interior) get an
  explicit caveat, not an implied guarantee.
- Final acceptance is the user toggling the staged layer in the web map at
  their home area plus at least three other locations, alongside an honest
  held-out numeric report. A numeric gate alone neither ships nor blocks a
  sheet; the rendered overlay decides, the numbers are published context.

## 3. Method — dense-GCP iterative TPS

### 3.1 Inputs and salvage

- Workspace `/var/home/dan/nsmarks-fletcher-sheet19-feature-pilot-20260726`
  on Bazzite (nsmarks-gis distrobox): verified source
  (`direct-rumsey-sheet-19.tif`, SHA
  `965ae592a1aa4276425a43d54b737669f7662f34c179e4861cb6d9284374f319`),
  NSTDB roads/water reference extracts with SHAs, pre-fit evidence crops.
- **Salvaged as controls**: the 12 identity-verified transport controls from
  the frozen observation (c02…c23). Their identity work is sound; only the
  transform they fed was wrong.
- **Burned checks become diagnostics.** The 9 former held-out checks have had
  residuals computed and recorded; they are no longer untouched. After
  identity re-review each is either promoted to a control (with a recorded
  re-review note) or kept as a labelled diagnostic. n08/n09 (~1.5 km) need
  identity re-review first — a wrong-stream match and genuine 1884 drainage
  displacement are both plausible and must be distinguished before reuse.
- The rejected engraved-grid warps stay out of the product path but serve as
  the candidate-finder prior (they are within ~600 m everywhere, good enough
  to locate features for cropping).

### 3.2 Control expansion

Target **35–50 accepted controls** spread across the usable frame, mixing
feature classes: road–road junctions, river confluences and mouths, lake
outlets, coastline junctions, island centroids, headlands. Each candidate
gets a scan crop + modern reference render, and an accept/reject decision
with a one-line identity rationale and uncertainty note, recorded before it
enters any fit. Rail crossings are admitted only with a date check: the
Intercolonial's Cape Breton extension postdates 1884 survey work, so engraved
rail may be a surveyed-but-unbuilt alignment.

Anti-gaming rule kept from v1, without the ceremony: an accepted control may
be demoted afterwards only with a recorded identity re-review that cites
feature evidence (never its residual alone).

### 3.3 Fit and iterate

- Transform: thin-plate spline (`gdalwarp -tps`) over all accepted controls.
  Affine and polynomial are diagnostic comparisons only, not candidates.
- Working QA loop per iteration: render scan-over-modern overlay crops at a
  fixed 4×4 grid across the frame plus the current worst areas; inspect
  visually; add or re-review controls where misalignment is visible; refit.
  Stop when QA locations meet the z14 bar or improvement plateaus (then
  report the plateau honestly).
- Everything inspected inside the working loop is *seen* evidence by design
  and can never serve as a held-out check. The honest final number comes
  from the next step, not from the loop.

### 3.4 Final scoring, staging, acceptance

1. After convergence, freeze **8–10 brand-new held-out checks** — features
   never measured in any prior run — across at least three separated regions
   including the user's acceptance neighbourhood, then score exactly once
   and publish RMS/P95/max per region. Never adjust points after this.
2. Tile z8–16, stage via `VITE_FLETCHER_TILE_BASE_URL`, and hand the user a
   staged web-map link for visual acceptance.
3. Record per sheet: GCP CSV, result receipt JSON (source SHA, control and
   check tables, per-region metrics, QA crop hashes, disposition), and a new
   `feature-led-v2` row family in `reports/fletcher/RESULTS.md`. The
   engraved-grid table and its rejection banner remain unchanged history.

## 4. Kept invariants and dropped ceremony

Kept (load-bearing):

1. Direct-Rumsey sources only, SHA-verified receipts (scoped Cartography
   Associates permission, CC BY-NC-SA 3.0 attribution).
2. Nothing OldMapsOnline-derived, ever.
3. Final held-out checks frozen before scoring; scored once; never edited.
4. Rejected results stay fail-closed with recorded reasons; superseded runs
   keep their history.

Dropped (process weight that killed prior runs): frozen-observation byte
verification, role-pure file ceremony, LOOCV transform tournaments, the
21×21 structural mesh gate (its orientation normalization made determinant
and area-scale readings meaningless in the sheet-19 pilot), hash-bound
visual-QA choreography, and the ten-terminal-state machine. Terminal states
reduce to: `PASS`, `FAIL (reason)`, `blocked (reason)`.

## 5. Tooling

- New sheet-agnostic driver `tools/fletcher/feature_georeference.py` with
  subcommands: `candidates` (propose features from NSTDB near the prior
  warp), `crops` (evidence crops for review), `fit` (TPS + residuals),
  `qa` (overlay grid renders), `freeze-checks`, `score`, `tile`, `record`.
  Reuses existing primitives (`tools/church/georeference.py` parsing,
  `tools/fletcher/package_web_tiles.py`, report writer).
- The 878-line single-sheet `sheet19_feature_pilot.py` is superseded; its
  observation JSON is imported as data. Its useful schema ideas (identity
  rationale, uncertainty, evidence crops, modern-source object IDs) carry
  into a simplified observation format.
- Observation records keep NSTDB object IDs and retrieval dates so controls
  are re-derivable.

## 6. Privacy boundary

Committed artifacts must not identify the user's home. The Codex observation
embeds `property_selector.pid` and `near_property` flags; v2 replaces these
with neutral region labels (e.g. `qa-region-3`). Acceptance-neighbourhood
checks are described by feature identity only. The private PID linkage stays
local/untracked if needed for the user's own review.

## 7. Series system and skill

After Sheet 19 passes user acceptance:

- Codify the per-sheet loop as a skill (working name
  `fletcher-feature-georeference`): inputs sheet number + workspace; outputs
  staged tiles + receipt + report row; embeds the invariants of §4 and the
  privacy rule of §6.
- Batch the remaining 23 sheets, each ending with a short user spot-check.
  Estimated ~1–2 h agent time per sheet after the pilot.
- Add seam QA: adjacent accepted sheets get boundary overlay crops; visible
  seam disagreement above the bar is recorded and the worse sheet gets
  another control pass.
- Church counties reuse the same skill later with county cutlines and denser
  controls; the four-county freeze stays in force until explicitly lifted by
  the user.

## 8. Risks and honesty boundaries

- 1884 interior drainage may be genuinely displaced; TPS pulls mapped
  features into place near controls but cannot certify unmapped interior.
  Receipts state where accuracy was measured.
- An empty or failed NSTDB response is `returned-empty`/`source-error`, not
  evidence a historical feature never existed.
- A passing sheet registers imagery; it proves no parcel, title, access,
  value, flood, or service conclusion, and no historical-survey accuracy
  beyond the measured checks.
- If the z14 bar proves unreachable in a region after dense controls, the
  sheet can still ship with a region-scoped caveat if the user accepts the
  rendered result; the receipt records the measured shortfall.
