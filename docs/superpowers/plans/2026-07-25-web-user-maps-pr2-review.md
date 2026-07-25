# PR-2 georeferencer — adversarial review findings (2026-07-25)

> **SUPERSEDED — historical record only. Do not implement from this file.**
>
> These findings drove the plan revision; the shipped code then went past them,
> and several statements here are now false or contrary to shipped intent. The
> authorities are the spec
> (`docs/superpowers/specs/2026-07-24-web-user-maps-design.md`, "Transform
> math") and `web/src/userMaps/transform/affine.ts`, which carries the
> measurements.
>
> Most important: **L1 and L4 below prescribe normalising the acceptance gate
> against the image diagonal, and that is a measured bug.** It folds a
> *coverage* question into what claims to be a *rank* question, and the two
> disagree — a 1000×100 px control corridor on a 24000×18000 scan is full rank
> with only 10:1 anisotropy, yet scores 1.7e-3 against the image and would be
> refused as "too close to a straight line", which is simply false about that
> layout. The shipped gate normalises against the point cloud's own long axis
> instead (`MIN_CONDITION_RATIO`), and coverage is recorded as a known gap
> against the reported accuracy rather than as a refusal to solve. L4's huddled
> points are that known gap, deliberately, not a defect.

Three independent reviewers went at
`docs/superpowers/plans/2026-07-25-web-user-maps-pr2.md` and the two commits it
declares already landed. Lenses: library/React correctness, the georeferencing
maths, and spec coverage plus cross-task type consistency.

The GPT-5.6-sol pass the process normally calls for **did not run** — the Codex
account is over its usage limit until 2026-07-28. These findings are from three
Claude reviewers instead. They are not a substitute for a different model
family's blind spots, and the plan should still get that pass if the schedule
allows.

Findings below are deduplicated across the three reports. **Verified here**
means reproduced independently after the reviewer reported it, with the probe
and its output recorded.

---

## Part 1 — Defects in code that has already landed

These are in commits `5a199f76b` and `6c1ffd217`, i.e. shipped on this branch
and depended upon by every remaining task. They must be fixed before anything
is built on top.

### L1 (BLOCKER) — The collinearity gate is the Pearson correlation, and is blind in the most likely orientation

`web/src/userMaps/transform/affine.ts:90-98`. The test is
`|det M| > ε · sumXX · sumYY`, which reduces algebraically to `1 − r²` where
`r` is the correlation of the centred pixel coordinates. Correlation is
scale-invariant, which is what the comment advertises — but it is not a
conditioning measure, and it goes blind whenever the point cloud lies near a
coordinate axis.

**Verified here.** Same degeneracy, two orientations:

```
B1 horizontal near-collinear accepted: true
B1 45deg    near-collinear accepted: false
```

The repo's own guard test (`affine.test.ts:66-73`) uses a 45° line — the one
orientation where the metric happens to be sensitive. Rotate that fixture to
horizontal and it passes. The reviewer measured an exactly-singular horizontal
layout (`λmin = 0`, condition `Infinity`) being reported as a healthy
`1 − r² = 0.25`.

**Why it matters:** `params === null` is the only signal for the
`{kind: "collinear"}` status. It never fires, so the panel falls through to
`{kind: "exact-fit"}` and tells the user *"Exact fit — add a 4th point to check
accuracy"* while the drape is kilometres out. Three GCPs clicked along a
scan's top neatline ±5 px: one 1-px slip moves the far corner **1.43 km**.

**Fix:** replace with a size-relative smallest-spread gate — reject when the
GCP cloud's narrowest RMS extent is a negligible fraction of the image
diagonal (`sqrt(λmin / n) / hypot(width, height)`, threshold ~1e-2). One
metric separated all six of the reviewer's cases correctly. This deliberately
abandons scale invariance: fitness depends on GCP spread *relative to the
image being warped*, which is the normalisation the current gate discards.
`solveAffine` needs the pixel extent passed in, or the gate moves up to
`solveAffineFromGcps`.

### L2 (BLOCKER) — Degeneracy is only ever checked on the source side

`affine.ts:90-98` inspects `sumXX/sumXY/sumYY` — source pixels only. Nothing
validates the solved transform. Three map clicks down a meridian are exactly
collinear in Mercator, so the fitted linear part is singular while the source
layout looks textbook:

```
source scatter 1-r^2=9.988e-1  accepted=true
linear-part det=0.0000e+0   drape area=0.000e+0 km^2
residuals (m): 7.08e-10, 1.42e-9, 7.08e-10        <-- reports a PERFECT fit
```

Downstream, `render/mesh.ts` gets zero-area destination triangles and a
singular `setTransform`. It does not throw — the image simply never appears,
with the panel showing "Exact fit". The near-miss case (longitudes agreeing to
~0.8 m) yields a drape squashed to 0.01% of its area.

**Fix:** after solving, take the singular values of the 2×2 linear part and
reject when `σ₂/σ₁` drops below ~1/50. No plausible historical-map
georeference squashes one axis 50:1. This is the natural place to raise
`{kind: "collinear"}`.

### L3 (BLOCKER) — Non-finite destinations produce half-finite params, and Leaflet then throws on every pan

The determinant guard is built from source terms only, so a non-finite
destination passes into `sumXdX`/`sumYdY`.

**Verified here:**

```
M4 params with NaN destination: [3.5, -1.25, -6790000, NaN, NaN, NaN]
```

Half the transform is finite nonsense returned as a valid `AffineParams`, not
`null`. `buildGcpLatLngMesh` then emits `{lat: NaN}`, and
`WarpedRasterLayer.redraw()` constructs `new L.LatLng(NaN, …)` inside a
`moveend/zoomend/viewreset/resize` handler — so it throws from a Leaflet event
dispatch on every pan and zoom. Reachable from a restored IndexedDB record
(structured clone preserves NaN, unlike JSON).

**Fix:** one line — `return params.every(Number.isFinite) ? params : null;`.
`transform/projection.ts:136-142` already does exactly this for the embedded
path, with a comment explaining why. The GCP path should match.

### L4 (MAJOR) — No minimum-baseline check: a 40 px huddle is accepted as a 111 km drape

Three GCPs within 40 px of each other on a 4096×3072 scan are perfectly
conditioned in *shape* (scatter condition 3.0) and catastrophic in *scale* — a
100× extrapolation from the GCP hull to the image bounds, where a 1 px click
error moves the far corner 1.1 km. At three points there is no residual report
either, so nothing warns the user. The L1 spread-ratio gate flags this at
2.6e-3 against a 1e-2 threshold, so one fix covers both.

### L5 (MAJOR) — `gridSize = 1 is EXACT` is false in the actual render path

`WarpedRasterLayer.ts:106` uses `map.latLngToContainerPoint`, which routes
through `latLngToLayerPoint`. **Verified here** —
`node_modules/leaflet/dist/leaflet-src.js:4117`:

```js
latLngToLayerPoint: function (latlng) {
    var projectedPoint = this.project(toLatLng(latlng))._round();
```

Every destination vertex is snapped to a whole CSS pixel before the `dpr`
scale. The mathematics is affine; the API used to evaluate it is not.

```
zoom= 6: worst non-affine deviation via Leaflet = 1.0308 px;  unrounded = 1.9e-12 px
zoom=13: worst non-affine deviation via Leaflet = 1.4142 px;  unrounded = 2.4e-10 px
```

Three measured consequences: ground error that **exceeds the RMS the panel
advertises** (166 m at z8, 21 m at z11, 6 m at z13); a >1 px content
discontinuity across the cell diagonal, because the four corners round
independently and the two triangles no longer share one affine — the very
seam `CLIP_OVERDRAW_DEVICE_PX` exists to hide; and 1-px stepped jitter during a
GCP drag, in the live warp the whole design is built around.

**Fix:** bypass the rounding. `map.project()` does not round, and the layer
already computes the pane offset:

```ts
const origin = map.getPixelOrigin();
const paneShift = map.containerPointToLayerPoint(new L.Point(0, 0));
const p = map.project(new L.LatLng(ll.lat, ll.lng), map.getZoom());
return { x: (p.x - origin.x - paneShift.x) * dpr, y: (p.y - origin.y - paneShift.y) * dpr };
```

The reviewer confirmed this reproduces `latLngToContainerPoint` exactly except
for the quantisation. Antimeridian and high latitude are fine — the deviation
at 80 N / 170 E is the same rounding term and nothing more.

### L6 (MAJOR) — Leave-one-out does not identify the bad GCP better than the fit residual

`residuals.ts:50-106`. The premise is true (least squares smears a gross error
across every point) but the conclusion does not follow: when the outlier is in
the training set for the other n−1 refits, it corrupts those predictions too.

**Verified here** — sweep over outlier index × magnitude × direction:

```
M2 n=4 corners:    trials=96  LOO=21 (22%)  FIT=24 (25%)
M2 n=6 scattered:  trials=144 LOO=120 (83%) FIT=120 (83%)
```

The reviewer's larger sweep (1104 trials) has LOO winning 147 times and losing
150 — a wash overall. At **n = 4, which is exactly `MIN_GCPS_FOR_RESIDUALS`,
the point where the UI starts highlighting a suspect row, LOO is at chance
(1/4)** and marginally worse than the criterion it replaced.

The existing regression test locks in one favourable fixture — its own comment
says *"Measured on this exact fixture"*. Moving the outlier to a different
index on the same fixture flips the result.

This invalidates the plan's "Verified library facts" row asserting the
opposite. It was one fixture, generalised too far. **This is a decision for
the maintainer, not a mechanical fix — see Part 3.**

### L7 (MINOR) — `residualReport` silently degrades to the criterion it says is wrong

`residuals.ts:94` — `leaveOneOutMetres(gcps) ?? metresPerGcp`. When a refit
fails (dropping one point leaves the rest collinear), the highlighted index
silently becomes the largest fit residual, and `ResidualReport` carries no flag
saying so.

### L8 (MINOR) — `fromMercator` has no clamp symmetric to `toMercator`'s

`webMercator.ts:36-43`. A large-scale affine emits latitudes outside the
Mercator domain (`89.33` observed against an 85.05 limit), which Leaflet then
silently clamps — breaking affinity in a way no test catches.

### L9 (MINOR) — "ground metres" use the equatorial radius, and are not the figure QGIS shows

`webMercator.ts:59` uses 6378137 in the haversine where the great-circle
convention is the mean radius 6371008.8 — a uniform +0.112% (4.5 cm on a 40 m
residual). Defensible, but undocumented. Separately, `residuals.ts:82-84`
claims the displayed figure is *"the figure QGIS and Allmaps show, so they are
comparable"* — a QGIS georeference targeting EPSG:3857 reports **Mercator**
metres, ~1.44× larger. The two comments in that file contradict each other.

### Verified correct — do not "fix" these

- The centred normal equations are excellent. Against an exact-rational
  least-squares reference, `solveAffine` returns **0.000e+0 relative error** on
  well-spread points, on a 20000×16000 scan with GCPs in a 200 px corner
  cluster, and on a 30000×24000 scan with a 30 px cluster — where the naive
  uncentred formulation is **15.84 km** wrong. The comment at `affine.ts:36-45`
  is fully earned. Every failure above is in the *acceptance test*, never the
  solve.
- Mercator round trip: worst ground error 2.418e-9 m over a 43–48 N × 67–59 W
  sweep; worst disagreement with `L.Projection.SphericalMercator` 2.794e-9 m.
- Haversine matches `L.CRS.Earth.distance` to the constant radius ratio.
  Measured 1/cos(46°) = 1.4396 inflation, in both N-S and E-W (conformality).
- Mirrored / negative-determinant transforms recover to 8 significant figures.
- `gridSize = 1` is exact **as mathematics** (≤1.536e-8 px over an 8×8 lattice
  at zooms 6–19). Only the rounded API defeats it — see L5.
- `L.CRS.Simple` vs `map.project` behaviour, the `|| 0` negative-zero guard,
  Marker drag event payloads, pane idempotency, react-leaflet 5 exports and
  context rules, partial `vi.mock` of react-leaflet, `<fieldset disabled>` +
  `toBeDisabled()`, `toHaveValue("70")` on a range input.
- The conditional `setState` during render is genuinely lint-clean under
  `eslint-plugin-react-hooks@7.0.1`, and `exhaustive-deps` flagged nothing
  anywhere in the plan. No test mixes fake timers with `userEvent`.

---

## Part 2 — Defects in the unexecuted plan

Each of these fails the task that contains it, at execution time.

| # | Task | Finding |
|---|---|---|
| P1 | 7 | **StrictMode double-fire.** `setPending`'s updater calls `snapshot()`, `nextGcpId()` and `setGcps()` — side effects inside a state updater. React 19 double-invokes updaters in StrictMode, and `main.tsx:8` wraps `<App/>` in it. Measured: one completed pair creates **two coincident GCPs**; every action needs two Undo presses. All 22 Task-7 tests pass anyway (bare `renderHook`), so it ships green and surfaces only in the browser — and because the duplicates are coincident, the affine still solves and it looks "nearly right". Fix: read `pending` from a ref and branch outside the updater. |
| P2 | 5 | **`saveGcps` never writes to IndexedDB.** It assigns `saved` inside a `setRecords` updater and reads it on the next line; React defers the updater whenever the owning fiber has queued work — which `App` always does. Measured: `captured after save (with a prior queued update): null`. The task's own test asserts only in-memory `records`, so persistence has *zero* coverage. Found independently by two reviewers. |
| P3 | 4 | **Parser edit collides.** `geoTiffSource.ts:183` already declares `const georef`, and line 197 dereferences it; the plan's replacement range stops at 181. Produces `TS2451` plus an unguarded null deref on exactly the plain-TIFF path the task enables. |
| P4 | 4 | **Fixture contradicts geotiff.js.** The plan uses `plainTiff({})` and expects `georef` to be null; the existing test file documents at length that `plainTiff({})` auto-injects a whole-globe WGS84 georeference, which is why it passes `{ ProjectedCSTypeGeoKey: 0 }`. |
| P5 | 5 | **Tests reference an undefined `store`**, and two of them omit the `parseImage` seam while importing a PNG — the real path calls `createImageBitmap`, which the plan's own facts table says does not exist in jsdom. |
| P6 | 6 | **"Draws nothing" test cannot pass.** It waits for `createPane`, but `ensurePane` sits inside the `.then()` past the `hasMesh` early return. Confirmed failing against the plan's own implementation. Found independently by two reviewers. |
| P7 | 10 | **`userEvent.clear()` throws on `input[type=range]`** — `clear() is only supported on editable elements`. Use `fireEvent.change`. |
| P8 | 8,9,10,6 | **`react-refresh/only-export-components` is an ERROR here**, and four new files export non-component helpers from `.tsx`. `npx eslint src` is clean today, so these are new failures that break Task 12's gate. Fix: move helpers to `.ts` modules (cleaner — `ScanPane.test.tsx` then needs no React) or use the existing disable-comment precedent. |
| P9 | 7 | Dead `commit` callback → `no-unused-vars` error, failing Task 7's own lint step. |
| P10 | 10,12 | **The panel is not an overlay.** CSS targets `.georeference-overlay`, `.georeference-side`, `[data-tab]` and `.gcp-row` — the DOM renders none of them. The panel lands in normal document flow at the end of the page. The style tests regex CSS *text*, never the rendered DOM, so all of them pass. Both breakpoints, the `Scan\|Map` toggle, and the rail-hiding are dead. Found independently by two reviewers. |
| P11 | 5,12 | **`ImportOutcome.needsGeoreferencing` is produced and never consumed.** Spec:183-185 requires an imported scan to *open the panel*; nothing calls `beginGeoreference` from an import outcome. |
| P12 | 11 | **`ScanPane.tsx` is edited but never committed.** Task 11 requires exporting `numberedIcon` from it; the file appears in no task's Files list or `git add`. Local tests pass, the pushed branch does not compile. |
| P13 | 7 | **The debounce still loses map A's edits across a switch.** The `mapId` fix covers a *late* flush but not an *interrupted* one: a single `dirtyRef` slot and a single timer mean the first edit on map B overwrites A's pending write. Measured: `persist calls: [["map-b",1]]` — A's deletion gone. The plan's test passes only because it never edits B. |
| P14 | 6,12 | **Identity churn defeats the hot path.** `meshForRecord(map.record)` in the render body returns a fresh array each render, and the layout effect is keyed on it — measured `setLatLngMesh` calls after 3 identical re-renders: **3**. During a drag, every saved layer rebuilds its lattice and repaints per pointer move. `editingMap` is likewise a fresh literal, defeating the `georeferenceBinding` memo. |
| P15 | 12 | **Vacuous test.** `"saved user map layers: 0"` reads 0 whether or not the filter exists — the seeded map has no GCPs and is never enabled. |
| P16 | 9 | The GCP list's **zoom-to control** (spec:211) is silently dropped; the list is the stated debugging tool, and you can see a 400 m residual but not navigate to it. |
| P17 | 8,12 | **No `.gcp-marker` CSS exists at all** — spec:205-209's hollow→solid numbered markers render unstyled on both panes. Compounding: `selectedGcpId` is passed as the `pendingHalf` argument, so hovering a completed row renders its marker in the pending style. |
| P18 | 6 | `UserMapLayers.test.tsx`'s hoisted mock type lacks `setLatLngMesh` — Vitest passes, `tsc --noEmit` fails a task later. |
| P19 | 10,12 | **"Delete map" prompts twice** — both the panel and App wrap it in `window.confirm`. |
| P20 | 12 | Fixture uses `geoTransform`; the real field is `geotransform`, and it is a 6-tuple. The plan says "read it, do not invent it" and then hands the executor an invented name. |
| P21 | 12 | `makeApi(...)` does not exist — the real factory is `api(overrides)`. |
| P22 | 12 | `nsprd` defaults to **true** (`layerCatalog.ts:733`), so the new App test asserts backwards. |
| P23 | 11 | `PANE_Z_INDEXES` does not exist (`PROVINCE_LAYER_Z_INDEXES`), and it omits the measure and established-parcel panes, so the assertion is weaker than its comment claims. |
| P24 | 9,12 | `.visually-hidden` is rendered but never defined in `styles.css`, so a literal "Actions" header cell appears. |
| P25 | 11 | **The pane-placement rationale is wrong.** 700 is Leaflet's *popup* pane; `markerPane` is 600. The value still clears every data overlay, but it puts GCP markers level with parcel-identify popups, and the stated reasoning would be repeated by the next reader. |
| P26 | 7,16 | `useMapEvents` with an inline handler object re-runs `map.off()/on()` every render — per pointer move during a drag. |
| P27 | 7 | `onPersistRef` syncs in a `useEffect`, contradicting the plan's own Global Constraint about `useLayoutEffect` for refs read by in-flight work. Practically safe behind a 400 ms timer; the inconsistency invites a wrong "fix". |
| P28 | 3,7 | Test-count expectations are wrong (Task 7 says 20, actual 22). |
| P29 | 5 | Missing `GcpGeoref` import in the test additions. |
| P30 | 12 | Copy drift: spec says **"Adjust points"**, plan says "Edit points". The spec also puts the button where the opacity slider sits; the plan keeps a live opacity slider on a row whose checkbox it simultaneously disables. |

### Clean

- **Persisted schema:** no task touches `types.ts`; `Gcp` and `GcpGeoref` are consumed by value only. `putUserMapRecord` writes the existing store with `DB_VERSION` unchanged. No migration needed and none missing.
- **The three mid-plan signature changes** (`mapId`, `onPersist(mapId, gcps)`, `referenceLayersLocked`, dropped `selectedGcpId`) are consistent at every one of their call sites.
- **The "already landed" claim is accurate** — every symbol Tasks 1 and 3 attribute to `5a199f76b` / `6c1ffd217` exists with the stated signature, and `residualReport(gcps, params)` matches Task 7's call site.
- **Forward dependencies:** only two (P3/P12). No "run the tests" step references a file that does not exist yet.

---

## Part 3 — The one decision that is not mechanical

L6 kills the plan's stated method for identifying a bad control point. The spec
locks "leave-one-out" as a decision, so replacing it is a spec change. Three
options:

1. **Drop leave-one-out; highlight the largest fit residual.** Identical
   accuracy on the sweep, O(n) instead of O(n²) per drag frame, and deletes a
   module. Requires amending the spec's locked decision and the plan's facts
   table.
2. **Keep leave-one-out but studentize it** — divide by `sqrt(1 − hᵢ)` using
   the hat-matrix leverage. This is the standard outlier statistic and is what
   actually delivers the promised property; it is also *cheaper* than the
   current brute-force refit, since the PRESS identity gives it in closed form.
   Most work, best result, keeps the spec's intent.
3. **Keep it as-is but only highlight at n ≥ 6**, where the sweep shows the
   signal becoming real, and say nothing at 4–5.

Whichever is chosen, the plan's "Verified" row asserting leave-one-out is
better must be downgraded to "observed on one fixture, disproven by sweep".
