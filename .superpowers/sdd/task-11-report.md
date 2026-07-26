# Task 11 — batched Minor fixes and documentation

**Status: COMPLETE.** Gate green. Two commits on `claude/web-your-maps-pr3-75b34a`:

| SHA | Subject |
|---|---|
| `95d3eb067` | `docs(web): correct six load-bearing comment inaccuracies in userMaps` |
| `40b8ebbb1` | `docs: record the TPS warp and Allmaps export (PR 3)` |

Nothing pushed. Working tree clean, 25 ahead of `origin/...`.

**Code-side changes are comment-only.** Verified mechanically: every `+`/`-`
line under `web/src/` sits inside a comment (`//`, `/* */`, or the JSX `{/* */}`
block in `GeoreferencePanel.tsx`). No logic line changed, which is why the test
count is unmoved at 876.

---

## ⚠ Shared-scratchpad hazard recurred — THIRD instance on this branch

`.superpowers/sdd/task-11-report.md` already existed (2 381 bytes, dated
Jul 23 19:25) holding **an unrelated iOS plan's report** — it opened
`Created InfoSheetView as a sheet-ready SwiftUI surface with a visible Data
Sources & Licenses section` and closed with `xcodebuild test` output. Read in
full, confirmed unrelated, overwritten as the brief anticipated. Its own line 33
read *"This report file did not exist in the worktree when Task 11 started"* —
another plan's Task 11, same filename.

The ledger records this happening to `scratchpad/mutate.py` and to
`task-9-report.md`; this is the third. The pattern is reliable enough now that
any future task in this scratchpad should treat a file at its expected output
path as someone else's until proven otherwise.

---

## Group 1 — the two MUST-FIX comment inaccuracies

Both claims were re-verified against the current code before rewriting, as
instructed. **Both were confirmed wrong, and one was wronger than the brief
said.**

### (a) `web/src/userMaps/store/userMapStore.ts` — the `putUserMapRecord` doc

**Verification of the brief's two claims, against the code, not the summary:**

1. **"Permanent" is wrong.** `UserMapRows.tsx:100-116` renders the `Remove`
   button **unconditionally** — it sits outside every ternary in the
   `api.records.map(...)` body, unlike the opacity slider (`:70`) and the
   Georeference button (`:86`), which are both gated. Confirmed by reading the
   whole JSX block.
2. **"Can never be enabled" is wrong.** `UserMapRows.tsx:40` is
   `const needsWork = isGcp && api.needsGeoreferencing(record);`, and that is
   the *only* input to `disabled={needsWork}` at `:48`.

**A correction to the brief itself.** The brief framed claim 2 around a
`kind:"embedded"` orphan. That case is **not reachable through this method**: I
traced both callers (`useUserMaps.ts:502` `saveGcps` and `:549`
`setGeorefMethod`) and both write `georef: {kind: "gcp", ...}`, so every orphan
`putUserMapRecord` can create is `kind:"gcp"`. The comment is wrong anyway, and
for a *stronger* reason — in the exact scenario the comment itself describes
(tab A is mid-drag on a map it is actively georeferencing), the points normally
solve, so `needsGeoreferencing` returns **false**, `needsWork` is false, and the
checkbox is neither disabled nor forced off. The row toggles on and draws
nothing. The failure is reachable on the comment's own worked example, not only
on a hypothetical embedded record.

**"Never rendered" confirmed accurate and kept.** `useUserMaps.ts:563-570`
filters `visibleMaps` on `previewUrls[r.id]`, which an orphan can never have.
The corrected comment now states that reason rather than asserting the
conclusion bare.

**A third inaccuracy found in the same block, fixed with it:** "this method's
**one** caller (`saveGcps`)" — stale since Task 8 added `setGeorefMethod` as the
second (`useUserMaps.ts:549`). It is the premise of the very sentence being
rewritten, so leaving it would have meant shipping a block I had just certified.

**BEFORE:**

```
   * Guarded rather than a blind `put`, because `put` is an upsert and this
   * method's one caller (`saveGcps`) fires from a 400 ms debounce timer. Open
   * the same map in two tabs, drag a point in tab A, delete the map in tab B,
   * and tab A's timer then recreates the metadata row for a map whose blobs
   * tab B already removed. That orphan is permanent: `listUserMaps()` returns
   * it on every subsequent load, while `getPreviewBlob`/`getRasterBlob` return
   * null forever, so the layer row can never be enabled or rendered.
   * `discardPendingWrite` cannot prevent it — it clears the *deleting* tab's
   * hook-local timer, and the writing tab is a different JavaScript realm.
```

**AFTER:**

```
   * Guarded rather than a blind `put`, because `put` is an upsert and both
   * callers (`saveGcps`, from a 400 ms debounce timer, and `setGeorefMethod`)
   * fire after the user has already moved on. Open the same map in two tabs,
   * drag a point in tab A, delete the map in tab B, and tab A's timer then
   * recreates the metadata row for a map whose blobs tab B already removed.
   * That orphan survives every reload — `listUserMaps()` returns it while
   * `getPreviewBlob`/`getRasterBlob` return null forever — so it can never be
   * RENDERED: `visibleMaps` filters on a preview URL it will never have.
   *
   * It is NOT, however, permanent, and it is NOT inert. `UserMapRows` renders
   * a `Remove` button for every record, so the user can delete it. And that
   * component disables the layer checkbox only when `needsGeoreferencing`
   * refuses the points — which the points being actively dragged normally pass
   * — so the row toggles ON, reports itself enabled, and silently draws
   * nothing. `discardPendingWrite` cannot prevent any of it: it clears the
   * *deleting* tab's hook-local timer, and the writing tab is a different
   * JavaScript realm.
```

### (b) `web/src/userMaps/components/GeoreferencePanel.tsx` — orphan tabpanel

Now at `:474-496` (the brief's `:329-345` was stale; the block had moved).

**CSS facts verified directly in `src/styles.css`, all three confirmed:**

| Claim | Evidence |
|---|---|
| `.georeference-map-bar` base rule is `display: none` | `styles.css:4000-4001`. Turned on only by `.georeference-map-bar[data-tab="map"]` at `:4272-4274`, **inside** the `@media (max-width: 1199.98px)` block opened at `:4230`. So at wide widths the map panel is not in the tree at all → only ONE panel orphaned. |
| `.georeference-tabs` is a **child** of `.georeference-panel` | `GeoreferencePanel.tsx:282` opens `.georeference-panel`; `:296` opens `.georeference-tabs` inside it; the panel closes at `:461`. The map bar at `:484` is the sibling. |
| `.georeference-panel[data-tab="map"] { display: none }` | `styles.css:4268-4270`, narrow only. Takes the child tablist down with it → a `role="tabpanel"` named "Map" with **zero** `role="tab"` in the tree. |

`styles.css` was **not modified**, so none of `styles.test.ts`'s first-match
positional lookups can re-target.

**BEFORE:**

```
          whose whole design is "no JS knows the viewport width". Above the
          breakpoint the tablist is `display: none`, so both panels are
          momentarily orphaned — harmless, because the failure mode of an
          orphan tabpanel is content you cannot reach, and up there BOTH panes
          are on screen at once with nothing hidden. Neither panel takes
          `hidden` for the same reason: visibility is the stylesheet's job,
          and hiding the unselected one would blank the wide layout. */}
```

**AFTER:**

```
          whose whole design is "no JS knows the viewport width". The price is
          an orphaned tabpanel at BOTH ends of the breakpoint, in opposite
          shapes. Both are harmless, but for different reasons:

          WIDE — `.georeference-tabs` is `display: none` (its base rule), so no
          `role="tab"` is in the tree. Exactly ONE panel is orphaned, not both:
          this bar's own base rule is `display: none` too, and only the narrow
          Map tab turns it on, so the map panel is not in the wide tree at all.
          The orphan is the scan panel, and up there both panes are on screen
          at once with nothing hidden.

          NARROW + MAP TAB — the opposite shape. `.georeference-tabs` is a
          CHILD of `.georeference-panel`, so `[data-tab="map"] {display:none}`
          takes the tablist down together with the panel, leaving this element
          as a `role="tabpanel"` named "Map" with ZERO tabs in the tree. Still
          not unreachable content: the status line reads out, and "Back to
          scan" below restores the panel and its tablist together.

          Neither panel takes `hidden`: visibility is the stylesheet's job, and
          hiding the unselected one would blank the wide layout. */}
```

The design decision (roles unconditional, no `matchMedia`) is **unchanged** —
only the analysis justifying it is corrected.

---

## Group 2 — comment-accuracy corrections

All five were still wrong on arrival; none had been fixed by a later edit.

### T1-M2 — stale `affine.ts:158` citations (2 sites)

`affine.ts` was verified **at its current state**, as instructed, not taken from
the brief. `sed -n '111,121p'` returns exactly the summed-guard reasoning
(`:111-113`) followed by the per-coefficient guard (`:114-121`). The two sites
cite different things, so they got different (correct) ranges:

- `tps.ts:264` says "the reason … **records**" → now `affine.ts:111-121`
  (reasoning + guard).
- `tps.test.ts:66` says "**guards** this explicitly" → now `affine.ts:114-121`
  (the guard alone).

### T1-M3 — `tps.ts` reason precedence

**BEFORE:**
```
  // Negated so NaN falls through to the rejection rather than past it. The
  // delegated `solveAffine` call below applies this same gate to these same
  // points, so deleting this line changes nothing but the cost of refusing;
  // it is here to reject a hopeless layout before paying for a Mercator pass
  // and an affine solve.
```
**AFTER:**
```
  // Negated so NaN falls through to the rejection rather than past it. The
  // delegated `solveAffine` call below applies this same gate to these same
  // points, so this line changes no ACCEPT/REJECT verdict; it is here to
  // reject a hopeless layout before paying for a Mercator pass and an affine
  // solve.
  //
  // It does, however, set reason PRECEDENCE, so deleting it is not free. It
  // sits above the destination-finiteness loop, so for a doubly-degenerate
  // layout — road-thin pixels AND one NaN destination — the line present
  // reports `ill-conditioned` and the line deleted reports `non-finite`.
```
Ordering verified in the current file: the `conditionRatio` gate is at `:170`,
the destination-finiteness loop at `:179-183`.

### T6-M1 — `residuals.ts` shared `ResidualReport` doc

The type is now documented **per producer**, since two producers with different
semantics share it. `metresPerGcp`'s doc distinguishes the affine fit residual
from the TPS leave-one-out prediction error and states the 1.8x–3.7x
upper-bound framing; `mostInconsistentIndex`'s doc names both floors
(`MIN_GCPS_FOR_SUSPECT` / `MIN_GCPS_FOR_TPS_SUSPECT`) and states that on the TPS
path it is deliberately **not** the largest entry in the column. Both facts
re-verified in the code: `tpsResidualReport` gates on
`MIN_GCPS_FOR_TPS_SUSPECT` at `:332` and ranks by
`residualMetresFor(affine, gcps)` at `:333` while returning
`leaveOneOutMetres(gcps)` as `metresPerGcp` at `:326`.

**BEFORE:** `/** Per-GCP fit residual in GROUND metres, same order as the input. */`
and `Index of the worst-fitting point, or null when there are too few points for
that to mean anything (see MIN_GCPS_FOR_SUSPECT).`

### T8-M2 — `recordMesh.ts` delegation argument

**Delegation verified at source level.** `affine.ts:192-196`:
`solveAffineFromGcps(gcps)` = `solveAffine(gcps.map((gcp) => ({src: gcp.pixel,
dst: toMercator(gcp.map)})))`. `tps.ts:190-192` calls `solveAffine(gcps.map((gcp,
index) => ({src: gcp.pixel, dst: destinations[index]})))` where
`destinations = gcps.map((gcp) => toMercator(gcp.map))` (`tps.ts:174`). Same
function, same inputs — so I wrote "over the same pixels and the same
`toMercator`'d destinations" rather than repeating the brief's
"character-for-character", which is true of the *inputs* but not literally of
the two call expressions.

**AFTER (replacing the n=3 coincidence argument):**
```
    // This does NOT make the fallback path draw something `needsGeoreferencing`
    // calls undrawable, and the guarantee is not count-specific. `solveTps`
    // gates its destinations with a `solveAffine` call over the same pixels and
    // the same `toMercator`'d destinations that `solveAffineFromGcps` builds —
    // so `solveTps(g).ok` implies `solveAffineFromGcps(g) !== null` at EVERY n,
    // by delegation rather than by two thresholds that happen to agree. That
    // delegation is the thing a future editor might "simplify" away; keep it.
    // Were it ever broken, it breaks safe: the predicate would badge the
    // record, `visibleMaps` would exclude it, and nothing would be drawn —
    // never a mesh the predicate called impossible.
```

### M1 — `useGeoreferenceSession.ts` map-switch flag reset

Now at `:288-297`. Narrowed to "a move that arrives without a drag-start" **and**
labelled defensive (the brief offered these as alternatives; both fit in the
same comment and the pair is more useful than either).

**AFTER:**
```
    // Belongs to the map that just closed, like the history it guards.
    // DEFENSIVE, not load-bearing: deleting this line leaves the whole suite
    // green, because every edit kind reachable as a new map's FIRST edit
    // snapshots — and snapshotting clears the flag — before it consumes it.
    // The residue would only bite on a move that arrives WITHOUT a preceding
    // drag-start, which no path in `ScanPane` or `GeoreferenceMapLayer`
    // currently produces. Kept because a new mover need only forget the
    // drag-start to make it reachable, and the symptom (map B's first edit
    // silently not undoable) is invisible until a user hits Ctrl+Z.
```

---

## Grep evidence — removed phrasings are gone

The brief's mandated check, verbatim, plus broader sweeps:

```
$ grep -c "orphan is permanent\|can never be enabled" src/userMaps/store/userMapStore.ts
0
```

```
=== broader M5 phrasings (must be 0 each) ===
That orphan is permanent         0
never be enabled or rendered     0
one caller                       0

=== stale affine.ts:158 citations anywhere in src (must be 0) ===
(none above = 0 hits)          # grep -rc over all of src/, no file had a nonzero count

=== M12 wide-case phrasings (must be 0) ===
both panels are              0
momentarily orphaned         0

=== T1-M3 phrasing (must be 0) ===
0                              # "changes nothing but the cost of refusing"
=== T6-M1 phrasing (must be 0) ===
0                              # "Per-GCP fit residual in GROUND metres"
=== T8-M2 n=3 coincidence phrasing (must be 0) ===
0                              # "At n = 3 the two solvers agree exactly"
```

Replacement text is quoted in full above so it can be checked against the code
rather than trusted.

---

## Group 3 — documentation

### `plan.md`

```diff
-- [ ] TPS warping + Allmaps annotation export (PR 3)
+- [x] TPS warping + Allmaps annotation export (PR 3)
```

### `README.md` — "Your maps" bullet

```diff
-  points the scan drapes live. Files never leave your device: parsing,
-  warping, georeferencing, and storage are all in-browser.
+  points the scan drapes live. A scan whose distortion is not uniform — a
+  hand-drawn county map rather than a survey grid sheet — can be switched from
+  a straight-line fit to a curved thin-plate-spline warp, which bends the drape
+  to pass through every control point. The reported accuracy under that warp is
+  a deliberately conservative upper bound, not a best guess: it is measured to
+  overstate the true warp error by roughly 1.8x at twelve points and 3.7x at
+  four, and never to read better than the truth, so the copy says "no worse
+  than". The drape re-warps live while you drag, on a coarse mesh during the
+  drag and a fine one once the point settles. Finished control points export as
+  a IIIF Georeference (Allmaps) annotation, so the georeferencing you did here
+  can be taken to other tools. Files never leave your device: parsing, warping,
+  georeferencing, and storage are all in-browser.
```

README's voice is second-person and jargon-light ("drape them over Nova
Scotia", "Files never leave your device"), so the two mandated facts are stated
without constant names — "a deliberately conservative upper bound, not a best
guess" and "a coarse mesh during the drag and a fine one once the point
settles".

### `ARCHITECTURE.md`

Two edits. First, the folder inventory sentence:

```diff
 `transform/` (proj4 registry for NS CRSs plus WKT-citation best-effort,
-pixel→WGS84, mesh building), `render/` (`WarpedRasterLayer`: a
+pixel→WGS84, mesh building, and the two solvers — `affine.ts` and `tps.ts` —
+over the shared point-cloud conditioning gate in `conditioning.ts`),
+`allmaps/` (`annotation.ts`: a pure IIIF Georeference Annotation serializer,
+no new dependency), `render/` (`WarpedRasterLayer`: a
```

Second, two new paragraphs appended to the georeferencer section, matching that
section's existing register (dense, measurement-citing, naming constants):

```
PR 3 adds a second solver beside the affine one. `transform/tps.ts` is a
hand-rolled thin-plate spline, pure and Leaflet-free, solving in the same Web
Mercator metres; `UserMapRecord.georef.method` (`"affine" | "tps"`) already
existed, so nothing migrates. Agreement between the solvers is one-directional
and true **by construction**, not by matched constants: `solveTps`'s
destination gate *is* a `solveAffine` call over the same inputs, so everything
affine refuses TPS refuses, while TPS additionally refuses coincident control
points and a singular interpolation matrix. An earlier revision matched two
hand-tuned thresholds on two different quantities instead and drifted — a
100:1-squashed drape was refused by one and accepted by the other. The
source-side gate is the shared `conditionRatio` in `transform/conditioning.ts`,
which rejects on a *ratio* rather than exact singularity, so thin clouds (five
points along a road) are refused rather than solved into a drape a 1 px nudge
moves 12 km.

The spline reaches the screen through the same `WarpedRasterLayer` mesh at a
**two-tier** density: `TPS_DRAG_GRID_SIZE = 16` while a control point is being
dragged, `TPS_GRID_SIZE = 64` once the pointer settles (affine stays at 1 — a
single cell represents it exactly). Both numbers are measured, and error is
**not** monotone in grid size, so no test may assert that denser is always
better. Accuracy under a spline needs a different statistic: an interpolating
spline passes through its control points exactly, so the fit residual is ~0 by
construction and carries no signal. `tpsResidualReport` reports **leave-one-out
prediction error** instead, capped at 50 points to stay inside half a frame.
That figure is a conservative upper bound — measured to overstate true warp
error by 1.8x (n=12) to 3.7x (n=4) and never to be optimistic — so the UI reads
"No worse than N m" rather than "RMS N m". The highlighted suspect row is
ranked separately, by the **affine** fit residual even under a spline, because
leave-one-out loses that job decisively (62.9% vs 46.8% at n=8, z = −18.3): an
outlier left in a refit is absorbed into the spline's shape and corrupts its
neighbours' scores. So the flagged row is often not the largest number in the
column, which is what its copy ("Disagrees most with the other points") already
claims. Finally, `allmaps/annotation.ts` serializes the control points as a
IIIF Georeference Annotation — plain JSON, no `@allmaps/*` dependency, with
`transformation` on the body FeatureCollection rather than the annotation root,
and a `urn:uuid:` target because the extension has no provision for a local
file with no IIIF service.
```

Both mandated facts (conservative upper bound; two-tier mesh) appear in **both**
files, in each file's own register.

---

## Gate — verbatim

Run from `web/`, each exit status captured via `$?` from a redirected file, no
pipes. Run **twice**: once after the code-comment edits, once after everything
including the docs. Identical both times. No vitest runs overlapped.

```
VITEST_EXIT=0
TSC_EXIT=0
ESLINT_EXIT=0
=== vitest summary ===
 Test Files  76 passed | 1 skipped (77)
      Tests  876 passed | 1 skipped (877)
=== tsc (empty=clean) ===
=== eslint (empty=clean) ===
```

Full vitest tail from the first run:

```
 RUN  v4.1.10 /Users/dfakkeldy/Developer/ns-marks-the-spot/.claude/worktrees/wizardly-liskov-4b89a9/web

Not implemented: Window's scrollTo() method
Not implemented: Window's scrollTo() method
Not implemented: Window's scrollTo() method

 Test Files  76 passed | 1 skipped (77)
      Tests  876 passed | 1 skipped (877)
   Start at  20:17:49
   Duration  26.36s (transform 6.07s, setup 15.40s, import 9.31s, tests 33.17s, environment 68.93s)
```

876 passed matches Task 10's recorded 876 exactly — expected, since nothing but
comments changed. The known `MapCanvas.test.tsx` pilot-load flake did not appear
in either run.

---

## Explicitly NOT done — left for the whole-branch review

All remaining DEFERRED entries, untouched and unre-prioritised:
`T1-M1` (`MIN_TPS_SEPARATION` tolerance gap), `T10-M1` (missing export
confirmation), `T10-M2` (400 ms stale-payload window), `T8-M1` (`GcpList`'s
unframed "Off by" column), `T5-M3` (`GeoreferenceMapLayer` memo-stability gap),
`T5-M1` (unpinned literal grid values), plus `M2`, `M4`, `M6`–`M11`, `M13`,
`M14`, `T2-M1`, `T5-M2`, `T6-M2`, `T6-M3`, `T7b-M1`–`M3`, `T8-M3`, `T10-M3`.

**No deferred finding became more serious on inspection.** One observation for
the reviewer, offered as information rather than as a re-rating: `T8-M1`
(`GcpList`'s "Off by" column showing unframed leave-one-out figures) is now the
**only** surface presenting that number without the upper-bound framing —
Task 8 fixed the status line, and this task added the framing to
`ResidualReport`, `README.md` and `ARCHITECTURE.md`. The column is the last
holdout, so the inconsistency is more visible than when it was filed. Still
Minor; still not mine to fix.
