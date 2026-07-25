# Web "Your Maps" — User-Loaded GeoTIFF/GeoPDF + In-Browser Georeferencer — Design

**Date:** 2026-07-24
**Status:** Approved 2026-07-24; amended same day after adversarial review
(Codex gpt-5.6-sol): pane slot pinned to z-160, mesh density corrected,
renderer cadence stated precisely, alpha/nodata scoped out of PR 1.
Amended again 2026-07-25 with the PR-2 georeferencer design (see
"PR 2 — In-browser georeferencer" below), approved by the maintainer the
same day. **PR 2 is implemented and pending its pull request** (2026-07-25, on
`claude/web-georeferencer-user-maps-76f482`) — the section below describes the
georeferencer as built rather than as proposed, but nothing is merged, tagged
or deployed yet.
**Author:** Claude (with Dan Fakkeldy)

## Goal

Let web-map users load their **own** raster maps — GeoTIFFs, GeoPDFs, or plain
scanned images — and drape them over Nova Scotia with the app's signature
transparency slider. Files with embedded georeferencing render immediately;
plain scans (and GeoPDFs we can't read) go through a first-class in-browser
**georeferencer**: click matching points on the scan and the live map, watch
the warp solve in real time.

Everything runs **fully client-side**. The static-hosting deploy has no
backend, so "upload" means "open a local file": nothing ever leaves the user's
device. That is simultaneously the privacy story, the hosting-cost story, and
the licensing story — the site redistributes nothing, which is exactly the
constraint that keeps Fletcher/Church scans off the web today
(`web/src/layers/layerCatalog.ts` "rights-pending" rows). Users who obtain a
Rumsey scan for personal use can view it themselves without the project
hosting a single tile.

Primary motivation: **portfolio piece.** The georeferencer is the demo that
reads in ten seconds — drop in an old map, click four points, watch it snap
onto Nova Scotia.

## Scope decisions (locked with maintainer 2026-07-24)

| Decision | Choice | Rationale |
|---|---|---|
| **Scope** | Everything: GeoTIFF + georeferencer (affine → TPS) + Allmaps export + GeoPDF | Maintainer chose the full suite over phased-scope alternatives. GeoPDF is last and isolated. |
| **Dependencies** | `geotiff.js`, `proj4`, `pdf.js` only | TIFF decode and PDF rasterization are not sanely hand-rollable; proj4 handles arbitrary user CRSs. Rendering and all transform math are hand-rolled and unit-tested. No `georaster*` convenience deps. |
| **Rendering** | Approach B: one custom `WarpedRasterLayer` (canvas + triangulated mesh) | One path serves embedded-georef rasters, affine, and TPS; live re-solve during GCP drags needs mesh redraw speed, not tile rebuilds. Tiling can later hide behind the same interface if perf demands. |
| **Module boundary** | New `web/src/userMaps/` feature folder; `App.tsx`/`MapCanvas.tsx` gain only mounting points | `App.tsx` (~2,900 lines) and `MapCanvas.tsx` (~1,800) must not grow. Hard requirement. |
| **Storage** | IndexedDB, hand-rolled minimal wrapper | Survives reloads with zero server code; no new dependency for a ~100-line need. |
| **GeoPDF failure mode** | Degrade to the georeferencer ("treat as plain scan") + `gdal_translate` hint | A broken GeoPDF is a working scan, not a dead end. Removes most of the format risk. |

## Architecture

### Module layout

```
web/src/userMaps/
  parsers/
    sniff.ts            magic-byte file-type detection (never trust extensions)
    geoTiffSource.ts    geotiff.js wrapper: decode, geokeys→CRS, overview selection
    geoPdfSource.ts     pdf.js page-1 rasterization + georegistration extraction
    imageSource.ts      plain JPG/PNG decode for the georeferencer
  transform/
    affine.ts           6-parameter least-squares solve + apply
    tps.ts              thin-plate-spline solve + apply (phase 3)
    residuals.ts        per-GCP residuals (metres) + RMS
  render/
    WarpedRasterLayer.ts  Leaflet layer: mesh projection + per-triangle drawImage
  store/
    userMapStore.ts     IndexedDB persistence (maps, blobs, previews)
  components/
    UserMapRows.tsx     "Your maps" section in the layer list (import button, rows)
    ImportDialog.tsx    file picker/drop target, progress, privacy note
    GeoreferencePanel.tsx  split-view georeferencer
    GcpList.tsx         GCP table with residuals, delete, zoom-to
```

Every module containing logic gets a sibling `.test.ts(x)`, matching repo
convention; thin wiring files (the worker wrapper, presentational fragments)
are covered through the tests of the modules that drive them.
`transform/` and `parsers/` are pure (no DOM/Leaflet imports beyond types), so
they test headlessly in Vitest.

Integration points (the only edits outside `userMaps/`):

- `mapPanes.ts`: add a `user-maps` pane at **z-index 160** — directly above
  the aerial imagery pane (150) and below every data overlay (environmental
  health at 165, contours 180, parcels 200, roads 235, waterfalls 250) so
  parcel lines and roads stay readable on top of a draped scan.
- Layer list: mount `<UserMapRows>` as its own section.
- `MapCanvas.tsx`: mount `<UserMapLayers>` (renders one `WarpedRasterLayer`
  per enabled user map).
- `package.json`: the three approved dependencies.

### Data model

```ts
type UserMap = {
  id: string;
  name: string;
  source: "geotiff" | "geopdf" | "image";
  createdAt: string;                  // ISO-8601
  raster: Blob;                       // original file, untouched
  preview: Blob;                      // downsampled PNG used for all rendering
  pixelSize: { width: number; height: number };   // original pixel dimensions
  georef:
    | { kind: "embedded"; crs: string; geotransform: number[] }
    | { kind: "gcp"; gcps: Gcp[]; method: "affine" | "tps" };
};

type Gcp = {
  id: string;
  pixel: { x: number; y: number };    // original-image pixel space
  map: { lat: number; lng: number };  // WGS84
};
```

- The **original blob is kept** so re-georeferencing or export never loses
  fidelity and the preview can be regenerated at another resolution.
- GCPs are stored in **original pixel space** (not preview space) so preview
  resolution changes never invalidate them.
- GCP map coordinates are stored as WGS84 for portability, but **all solves
  and residuals run in projected Web Mercator metres** (the map's own space) —
  solving in raw lat/lng degrees would skew east–west vs north–south by
  ~cos(45°) at Nova Scotia latitudes.
- The `gcp` variant maps 1:1 onto an **Allmaps Georeference Annotation**, so
  phase-3 export/import is a serializer, not a redesign.

### Data flow

**Import:** file picked/dropped → `sniff.ts` → parser **in a web worker** →
downsample to a device-safe cap (≈4,096 px max dimension on iOS Safari,
8,192 px desktop; canvas limits are the binding constraint) → persist →
embedded georef? render immediately : open georeferencer.

**Georeferencer:** split view — scan (own pan/zoom) | live Leaflet map;
stacked with a tab toggle on narrow screens. Click scan, click map → one GCP.
At 3 GCPs the affine solve runs live and the warped scan appears under the
transparency slider; every subsequent point drag re-solves in real time.
`GcpList` shows per-point residuals in metres, with the worst highlighted from
five points onward (see *Why nothing is highlighted at 4 points*).
With exactly 3 points residuals are zero by construction, so the UI says
"add a 4th point to check accuracy" instead of a misleading 0 m. At 4+ points
a TPS toggle appears (phase 3). Save → layer row appears.

**Rendering:** `WarpedRasterLayer` projects its mesh into map space on each
*completed* view change (`moveend`/`zoomend`/`viewreset`/`resize`) — an 8×8
grid for embedded georeferencing (dense enough to absorb UTM→WebMercator
curvature at county scale), denser for TPS — and draws the preview bitmap through
per-triangle clipped `drawImage` at device-pixel-ratio resolution. During a
drag the pane carries the canvas; during zoom *animations* the raster jumps
rather than scaling smoothly — an accepted v1 trade-off, revisited only if it
grates in practice. Honors pane order and the per-map opacity slider.

### GeoPDF extraction (the risky module, isolated)

`geoPdfSource.ts` renders page 1 via pdf.js, then walks the PDF object tree
for both georegistration flavours found in the wild: OGC best-practice
`/Measure` dictionaries (`GPTS`/`LPTS` point arrays) and Adobe's legacy
`/LGIDict`. Both yield pixel↔CRS control points that feed the **same affine
solver** as the georeferencer. Unknown or missing dictionary → graceful
degrade to plain-scan georeferencing + a UI hint that
`gdal_translate in.pdf out.tif` converts offline. PR 4 starts with a
**1-day spike** against real files (USGS topo GeoPDFs are the canonical
corpus) before parser details are committed to.

## PR 2 — In-browser georeferencer (amendment 2026-07-25)

The phasing table's PR 2 row, designed in full. Decisions below were locked
with the maintainer on 2026-07-25 and supersede nothing above; they fill in
the "Georeferencer" paragraph of **Data flow**.

### Locked decisions

| Decision | Choice | Rationale |
|---|---|---|
| **Live-map pane** | Reuse the app's own map; the scan opens as a panel over the layer rail | Georeferencing an 1880s NS map is tractable mainly against aerial imagery, parcel lines, and roads — layers the user already has on. Also avoids a second Leaflet instance, keeps the drape WYSIWYG in the real pane at the real z-order, and holds `App.tsx` to a mounting point. |
| **GCP pairing** | Free order with a pending half-point | A strict superset of scan→map alternation: you can work from whichever side you spotted the landmark on. Costs one extra state branch. |
| **Unfinished work** | Drafts persist | Import writes `{kind:"gcp", gcps: []}` immediately and the panel edits in place. Closing never loses points, and "re-georeference an existing map" is the same code path as "create". |
| **Canvas in tests** | `canvas` devDependency | Verified: jsdom 29.1.1 auto-detects it and returns a real `CanvasRenderingContext2D`; prebuilt binary, no compiler. Closes PR 1's renderer test gap with no API redesign. Limitation: cairo, not Skia — it proves geometry and draw order, not pixel-identical browser output. |

PR 2 adds **no runtime dependency**: the `geotiff` / `proj4` / `pdf.js` lock
in **Scope decisions** stands, and `canvas` is dev-only, following the
precedent set when PR 1 added `fake-indexeddb` for the same reason (a test
environment gap, not a shipped capability). Nothing in `web/dist` changes
size.

### Interaction

**Entry.** PNG/JPEG imports now succeed, as do TIFFs with no georeferencing.
Each saves a record with `georef: { kind: "gcp", gcps: [], method: "affine" }`
and opens the panel. Its layer row reads *"Needs georeferencing"* with a
**Georeference** button where the opacity slider normally sits; finished GCP
maps get **Adjust points**, reopening the same panel.

**Layout.** Wide (≥900 px): the panel takes the left ~45% of the viewport and
hides the layer rail; the app map keeps the right ~55%. The scan needs room
for accurate clicking, so it gets close to half the screen rather than a
rail-width column. Narrow: full-screen panel with a `Scan | Map` segmented
toggle, where choosing *Map* hides the panel entirely and leaves a floating
bar carrying the prompt and a *Back to scan* button.

**Scan pane.** A second Leaflet map on `CRS.Simple` with the preview as an
`ImageOverlay` and `maxBounds` locked to the image, giving pan, pinch-zoom,
draggable numbered markers, and coordinate conversion from a dependency
already bundled.

**Map pane.** The app's own map with parcel-identify suppressed (the existing
`MeasureTool` precedent), a crosshair cursor, numbered draggable GCP markers
in their own pane above every overlay, and the live drape in the `user-maps`
pane at z-160.

**Placing a point.** Clicking either side drops a hollow numbered marker and
sets the prompt (*"Now click the same spot on the map. (Esc to cancel)"*).
Clicking the same side again moves it; clicking the other side completes the
GCP, which turns solid and gains a list row. Escape cancels a pending point,
or closes the panel when none is pending.

**GCP list.** Columns `# | scan px | lat/lng | residual | zoom-to, delete`,
under a status header that changes with the point count:

| Points | Header | Residual column |
|---|---|---|
| 0 | "Place 3 points to see the map drape." | — |
| 1–2 | "Place 2 more points to see the map drape." / "Place 1 more point…" | — |
| exactly 3 | "Exact fit — add a 4th point to check accuracy." | `—`, never `0 m` |
| 4 | "RMS 38 m across 4 points" | ground metres, **no row highlighted** |
| 5+ | "RMS 42 m across 5 points" | ground metres, worst row highlighted |

**Why nothing is highlighted at 4 points (amended 2026-07-25).** This
originally specified leave-one-out refitting to pick the suspect row, on the
reasoning that least squares smears a gross error across every point so the
largest fit residual accuses an innocent one. The first half is true; the
conclusion is not, because the outlier also corrupts every refit that still
contains it. A 1104-trial sweep (outlier index × magnitude × direction) had
leave-one-out winning 147 times and losing 150 against the plain fit residual
— a wash — for an extra affine solve per point on every pointer move.

At four points it is worse than a wash, it is arithmetically impossible. Four
points fitting three parameters leave a **one-dimensional residual space**:
the residual-maker `I − H` has rank `n − p = 1`, so every residual vector that
can occur is a multiple of a single direction — and that direction comes from
the pixel layout alone, not from the data. Both axes share it, because both
share the design. Displacing a different control point rescales that vector; it
cannot rotate it.

So the largest residual at four points identifies *where the user clicked*, not
*which click was wrong*, and it names the same row whoever is actually at
fault. Verified across a rectangle, a scalene quad and a lopsided quad: all
three produce an identical normalised residual pattern under all four possible
displacements. That kills raw residual, leave-one-out (`e/(1−h)`) and
studentized (`e/√(1−h)`) in one stroke, since all three rank by magnitude along
that one fixed direction. Measured 24% correct against a 25% chance baseline.
So: plain fit residual, and no accusation below five points, where a second
residual dimension appears, the direction can finally respond to the data, and
the same sweep reaches 60% against a 20% baseline.

*(Amended 2026-07-25. This originally argued from all four leverages being
exactly 0.75. That holds only for a symmetric layout — a scalene quad gives
`[0.871, 0.954, 0.918, 0.258]` — so it proved the conclusion for one rectangle
rather than in general. The rank argument above needs no symmetry. The
conclusion did not change; the reason it is true did.)*

**Designed failure states.** The solve is refused, with no drape and a status
explaining what to do, in three cases: control points too close to a straight
line to determine a transform; a solved transform that squashes one axis more
than 50:1 (three map clicks down a meridian are exactly collinear in Mercator
even when the scan points are ideal, and produce a zero-area drape whose
residuals all read zero — a perfect fit over nothing); and any non-finite
coordinate, which would otherwise reach Leaflet as `{lat: NaN}` and throw from
inside a `moveend` handler. A wildly wrong point is what the worst-residual
highlight exists to surface — the list is the debugging tool, so every row is
deletable.

**Known gap: clustered control points.** Three points inside 200 px of a
4096 px scan are well-conditioned in shape — condition ratio 5.8e-1, healthier
than most real layouts — and solve cleanly, but the fit is extrapolated ~20×
beyond them, so a 1 px click slip moves the far corner by a kilometre. This is
a *coverage* problem, and the acceptance gate is deliberately a *rank* test
only. Trying to make one threshold serve both is not a simplification but a
bug: an earlier revision normalised against the image diagonal to catch
exactly this, and the result was that a 1000×100 px control corridor on a
24000×18000 scan — full rank, 10:1 anisotropy, entirely reasonable — was
refused with the message "too close to a straight line", which was simply
false about that layout. Coverage needs a warning on the reported accuracy
rather than a refusal to solve, and is not implemented in PR 2.

*(Amended 2026-07-25 after adversarial review found the corridor case.)*

**Footer.** Opacity slider (drives the live drape, saved as the map's
opacity), a **Reference layers** row, *Undo*, *Done*, *Delete map*. No
Cancel: drafts persist, so there is nothing to discard — *Undo* covers the
case Cancel would have.

**Reference layers.** Hiding the layer rail would otherwise strand the user
without the two best control references, so the footer carries checkboxes for
**Aerial imagery** (`ns-aerial`) and **Property boundaries** (`nsprd`), wired
straight to the same `provinceLayers` state the rail uses. Two booleans in,
two callbacks out — no duplicate layer state, and toggles made here persist
after the session closes, because they *are* the rail's toggles.

Both layers are `province-restricted`, and everywhere else in the app
`LayerToggle` refuses to enable a restricted layer until the provincial
licence has been accepted. The panel takes a third input, a single "locked"
boolean, and renders the checkboxes disabled with a short reason — otherwise
the georeferencer would be a way around the gate the rest of the UI enforces.
The panel itself knows nothing about licensing; `App` already owns that
policy.

**Undo.** The session keeps a bounded history (50 entries) of `gcps`
snapshots — they are small arrays of small objects, so snapshotting is
cheaper than reconstructing inverse operations. *Undo* is a footer button and
`Cmd/Ctrl+Z`. The one subtlety that makes or breaks it: a marker drag emits
state on every pointer move, so the snapshot is taken on **drag start**, not
per move. Otherwise a single drag buries the history under fifty
indistinguishable frames and undo becomes useless. Adding, moving, and
deleting a GCP are each one undo step; there is no redo (YAGNI — say so if
that proves wrong in use).

**Accessibility.** The prompt line is `aria-live="polite"`, Escape
cancels-then-closes, and deletion lives in the list rather than requiring
marker-precision pointing.

### Module layout (additions)

```
web/src/userMaps/
  transform/
    webMercator.ts    forward/inverse spherical Mercator (pure, no Leaflet)
    affine.ts         6-parameter least-squares solve, apply, singularity test
    residuals.ts      per-GCP ground-metre residuals + RMS
    gcpMesh.ts        buildGcpLatLngMesh(params, pixelSize, gridSize)
  parsers/
    imageSource.ts    PNG/JPEG decode → preview blob + original pixel size
  useGeoreferenceSession.ts   session state machine + undo history + write-through
  components/
    GeoreferencePanel.tsx     shell, status line, footer
    ScanPane.tsx              CRS.Simple map + markers
    GcpList.tsx               residual table
    GeoreferenceMapLayer.tsx  markers + click capture on the main map
```

Modified: `WarpedRasterLayer` gains `setLatLngMesh()`; `UserMapLayers` learns
`kind:"gcp"` plus a draft path; `useUserMaps` accepts image sources and owns
which map is under edit (`georeferencingId`/`editingMap`), while `App.tsx`
owns the session itself — it calls `useGeoreferenceSession` and passes the
result down, so the two hooks stay independent; `MapCanvas` mounts
`<GeoreferenceMapLayer>` and passes `!georeferencing` to the identify
controller and no `<MeasureTool>` at all; `App.tsx` renders the panel, hides
the rail while a session is active, and passes the two reference-layer
booleans plus their setters down to the panel.

### Transform math

**Solve.** GCPs are stored WGS84 and converted to Web Mercator metres before
solving (the existing spec rule), then least-squares for
`X = a·x + b·y + c`, `Y = d·x + e·y + f` on **centred** coordinates: one 2×2
solve for the linear part, with the translation recovered exactly from the two
centroids. Centring is not cosmetic — raw image pixels (~2e4) against Mercator
metres (~7e6) put twelve orders of magnitude into a single uncentred normal
matrix and lose most of the precision to cancellation.

Four independent conditions refuse the solve, all surfaced as the one
`degenerate` status rather than a NaN drape: a collapsed centroid (every point
on the same spot); a point cloud thinner than `MIN_CONDITION_RATIO = 5e-3`,
measured as `sqrt(λmin/λmax)` of the centred 2×2 scatter matrix — the
reciprocal condition number of the design, and the rank test proper; any
non-finite coefficient, which a non-finite *destination* produces while
passing every source-side check; and a solved transform squashing one axis
past `MIN_ANISOTROPY_RATIO` (50:1), which is what three map clicks down a
meridian yield from an ideal scan triangle. "Designed failure states" above
names the three a user can act on; the collapsed centroid is the fourth, and
is the degenerate limit of the first.

> **Amended 2026-07-25.** This originally specified 3×3 normal equations
> solved twice, rejected when `|det|` fell below a scale-relative epsilon —
> "the collinear case". All three clauses were wrong, and the determinant test
> in particular must not come back: measured, `|det|` against the product of
> the normal matrix's diagonal reduces algebraically to `1 − r²` for the
> Pearson correlation of the centred pixels, which is scale-invariant but is
> not a conditioning measure, and goes blind whenever the points lie near a
> coordinate axis. An exactly singular horizontal layout reported a perfectly
> healthy `1 − r² = 0.25`, while the identical degeneracy rotated 45° was
> correctly rejected — and points clicked along a scan's top neatline are the
> layout users actually produce. `affine.ts:16-58` carries the full
> measurement table.

**Residuals are reported in ground metres, not Mercator metres.** Predicted
Mercator → inverse-project → WGS84 → haversine against the observed point.
Measured: a raw Mercator residual over-reports by exactly 1/cos(latitude),
which is 1.44× at 46°N, so reporting it directly would make every accuracy
number wrong by nearly half.

**Mesh density — and why it differs from the embedded case.** Screen space is
Web Mercator scaled and translated, so a pixel→Mercator affine composes to an
exactly affine pixel→screen map: a `gridSize = 1` mesh (two triangles) is
*pixel-exact* for GCP-affine, with no curvature to absorb.

> **Amended 2026-07-25.** True of the maths, and *false of Leaflet's API*.
> `latLngToContainerPoint` routes through `latLngToLayerPoint`, which is
> `this.project(latlng)._round()` — every mesh vertex snapped to a whole CSS
> pixel. Measured: up to 166 m of ground error at zoom 8, a >1 px content
> break along the cell diagonal because the four corners round independently
> (the seam `CLIP_OVERDRAW_DEVICE_PX` was added to hide), and 1-px stepped
> jitter while a control point is dragged. The renderer therefore uses
> `map.project()` and subtracts the pixel origin and pane offset itself.

This does not
contradict the 8×8 grid **Rendering** specifies for embedded georeferencing:
that path runs pixel→UTM→WGS84→Mercator, and UTM→Mercator genuinely curves,
so the lattice is earning its keep there. A GCP solve targets Mercator
directly and skips the curving step entirely. `gridSize = 1` is also the
performance answer — a live drag redraws 2 clipped `drawImage` calls rather
than the 128 an 8×8 grid would cost. PR 3's TPS raises the grid again,
because a spline warp is not affine anywhere.

**Live re-solve without churning record identity.** The map under edit is
excluded from `visibleMaps` and passed to `UserMapLayers` as a separate
`draft` prop. Inside, one effect keyed on `previewUrl` builds the layer and
decodes the bitmap once; a second keyed on `mesh` calls `setLatLngMesh`.
Drags never re-decode, and the PR-1 record-identity tests are untouched.

*(Amended 2026-07-25. The reason first given here — "because a draft never
enters `records`" — is false, even though the conclusion is true. Each
debounced write DOES substitute a new object for the edited record inside
`records`; `saveGcps` builds it outside the `setRecords` updater and the
updater returns every OTHER entry by reference, deliberately, which is what
keeps it pure under StrictMode and leaves unedited records' bitmaps alone. No
re-decode results because the map under edit is EXCLUDED from `visibleMaps`
and reaches `UserMapLayers` only as `draft`, whose renderer keys on
`previewUrl` and `hasMesh` rather than on the record object.)*

### Library facts verified before planning

Recorded because PR 1's plan was confidently wrong about library behaviour
several times; each of these was checked against the real API.

- `L.CRS.Simple.project()` and `map.project()` are **different functions**.
  The CRS method returns raw LonLat (`{x: lng, y: lat}`) and **ignores its
  zoom argument**; the Map method applies `Transformation(1, 0, -1, 0)`.
  Using the CRS method for the scan pane would mirror every GCP's pixel row.
  Image pixel `(x, y)` ↔ `map.unproject(L.point(x, y), 0)`.
- Hand-rolled spherical Mercator matches `L.Projection.SphericalMercator` to
  ~3 nm, so `transform/` stays Leaflet-free at no fidelity cost.
- `canvas` 3.2.3 + jsdom 29.1.1 yields a real `CanvasRenderingContext2D` in
  which `save`/`beginPath`/`clip`/`setTransform`/`drawImage`/`restore`
  produce correct pixels, clip boundaries included.
- `createImageBitmap` does not exist in jsdom, so `imageSource.ts` takes an
  injectable decode seam, matching the `makePreview` convention in
  `geoTiffSource.ts`.

### Testing

- **The renderer gap closes first, before anything builds on it.** With
  `canvas` installed, `WarpedRasterLayer`'s test stops early-returning:
  `getImageData` proves a known fixture lands at known device pixels, that
  `setLatLngMesh` redraws without re-reading the image, and that DPR scaling
  reaches the drawn output. `mesh.test.ts` gains real clip-boundary pixel
  assertions.
- `affine.test.ts` — invent a transform, generate exact GCPs, recover
  parameters to machine precision; collinear rejection; noisy points against
  a hand-computed least-squares answer.
- `residuals.test.ts` — hand-computed metres, with an explicit guard that the
  result is *not* the 1.44×-inflated Mercator figure, and `null` at n = 3.
- `useGeoreferenceSession.test.ts` — the pending-pair state machine in both
  orders, Escape, delete, write-through, and undo: that a simulated drag
  (drag-start then several moves) collapses to exactly one undo step, and
  that history is capped at 50.
- `UserMapLayers.test.tsx` — extended: `kind:"gcp"` renders, the PR-1
  record-identity assertions stay green, and a draft mesh change decodes the
  bitmap exactly once.
- Deferred from PR 1 and swept here: a test for the untested multi-tiepoint
  geotransform branch, and the missing `errors.test.ts`.

### Error handling

Reuses `UserMapImportError` unchanged. Images introduce no new codes — a
corrupt PNG is `corrupt-file`, an oversize one hits the existing size gates.
The georeferencer's own failure states (too few points, collinear points) are
UI states, not thrown errors.

### Out of scope for PR 2

TPS (PR 3), Allmaps export (PR 3), GeoPDF (PR 4), re-georeferencing a raster
that already has embedded georeferencing, renaming maps, and redo (undo only
— revisit if the one-way history proves annoying in real use).

## Error handling & guardrails

Typed errors with human messages for: unsupported file type, corrupt file,
unresolvable CRS, oversize file, quota failure.

- **CRS:** bundle proj4 defs for the NS-relevant set (EPSG 26920, 2961, 2962,
  4617, 4326, 3857) and accept embedded WKT; otherwise a clear "reproject to
  UTM 20N / WGS84" message.
- **Size:** soft warning ≈150 MB (aggressive downsample, note shown); hard
  refusal ≈500 MB with explanation. All decode work in workers with a
  progress indicator — the UI never blocks.
- **Quota:** IndexedDB write failure surfaces as "couldn't save — this map is
  available until you close the tab."
- **Privacy line** in the import dialog: *"Files stay on this device —
  nothing is uploaded."*

## Testing

- **Transforms:** golden fixtures — invent a transform, generate GCPs,
  recover parameters to machine precision; TPS must pass exactly through
  every GCP (its defining property); residual/RMS calcs against hand-computed
  values.
- **Parsers:** tiny script-generated GeoTIFF and GeoPDF fixtures in
  `web/src/test/fixtures/`, plus corrupt/truncated cases and a
  GeoPDF-without-geo-dictionary case (must degrade, not throw).
- **Components:** the repo's established mocked-react-leaflet pattern
  (rows, slider wiring, import flow, georeferencer state machine).
- **WarpedRasterLayer:** assert mesh geometry in map space (pure function),
  not rendered pixels.

## Phasing — four PRs up the ladder

| PR | Contents | Outcome |
|---|---|---|
| 1 | `sniff` + GeoTIFF parser + store + `WarpedRasterLayer` + layer rows + docs updates | Embedded-georef GeoTIFFs render end-to-end |
| 2 | Georeferencer UI + affine + residuals + plain-image sources | The portfolio demo |
| 3 | TPS mesh + Allmaps annotation export/import | Curved scans sit flat; interop |
| 4 | GeoPDF parser (spike first) | Full format coverage |

Each is a `feature/*` branch → PR into `nightly` per the promotion ladder.

## Documentation impact

New layer type + new persistence store, so PR 1 updates `README.md` (web
feature list), `ARCHITECTURE.md` (web section: userMaps module, IndexedDB),
and `plan.md` (new checklist items).

PR 2 updates the same three: `README.md` gains the georeferencer in the web
feature list, `ARCHITECTURE.md` gains the `transform/` solve chain and the
draft-overlay path through `UserMapLayers`, and `plan.md` ticks the PR-2
checklist items.

## Out of scope

- Server-side anything (no uploads, no shared maps, no accounts).
- Multi-page GeoPDFs (page 1 only; note shown if more pages exist).
- Mobile-optimized *editing* (georeferencer works stacked on phones but is
  designed desktop-first; viewing saved maps is first-class everywhere).
- Tile-pyramid optimization for very large rasters (can later hide behind
  the `WarpedRasterLayer` interface if panning perf demands it).
- iOS app parity (web-only feature; the iOS overlay engine is a separate
  design if ever wanted).
- Alpha bands, transparency masks, and nodata rendering (PR 1 renders every
  pixel opaque; 16-bit samples are scaled correctly, but alpha/nodata support
  is PR-2+ scope with its own tests).
- Full WKT CRS parsing. PR 1 accepts the six locked EPSG codes plus a
  best-effort `proj4` parse of the GeoTIFF citation string when the CRS key
  is user-defined (32767); exotic WKT beyond what proj4 accepts is rejected
  with the reproject message.
