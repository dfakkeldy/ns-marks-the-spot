# Web "Your Maps" PR 4 GeoPDF Import — Replacement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> `superpowers:subagent-driven-development` (recommended) or
> `superpowers:executing-plans` to implement this plan task-by-task. Use
> `superpowers:test-driven-development` for each behavioral change and
> `superpowers:verification-before-completion` before claiming a task or the
> branch complete.

**Goal:** Import page 1 of a browser-local PDF as an opaque-white,
4,096-pixel user map and place every supported valid registration from its
embedded coordinates. Place a sole registration automatically; for multiple
registrations, either use an independently validated exact USGS selector or ask
the user which embedded frame to use. Reserve manual control points for missing,
malformed, unsupported-CRS, unsupported, or unreadable registration.

**Architecture:** Keep four concerns separate. `geoPdfMetadata.ts` discovers
and validates every page-1 `/Measure` and `/LGIDict` registration without
preferring one. `geoPdfFrameSelection.ts` is a pure policy module that returns
`sole`, an evidence-gated producer rule, or `selection-required`.
`geoPdfSource.ts` owns lazy PDF.js/pdf-lib loading, page-1 rasterization, and
normalization into the existing user-map record. Generic `sourceRect` support in
the mesh and renderer clips the full-page canonical raster to the selected
registered frame. A separate frame chooser changes only that frame selection;
the existing georeferencer remains the explicit **Adjust points** path.

**Tech Stack:** React 19.2.7, TypeScript 5.9.3, Vite 8.1.5, Vitest
4.1.10, Leaflet 1.9.4, `pdfjs-dist` 6.1.200, `pdf-lib` 1.17.1, proj4
2.20.x, IndexedDB, a local PDF.js worker, and GDAL 3.9+ as the independent
evidence oracle.

## Global Constraints

- This document is an implementation plan, not implementation authorization.
  Do not execute it, push, or open a pull request until the maintainer grants
  separate authorization.
- Work only in
  `/Users/dfakkeldy/.codex/worktrees/0907/ns-marks-the-spot` on
  `feature/web-geopdf-import`. Preserve the completed compatibility-spike
  commits at and after `fb733a93f` and all unrelated work.
- Target `nightly` if publication is later authorized. Do not rebase,
  force-push, promote, or deploy as part of this plan.
- Import page 1 only. Store and display the PDF's total page count, including
  an explicit notice when later pages were not imported.
- Rasterize the entire canonical page, respecting crop box, rotation, and
  aspect ratio, with its longest edge exactly 4,096 pixels and a fully opaque
  white background. Do not create a separate bitmap for each registration.
- Keep original PDF bytes and all parsing in the browser. Bundle PDF.js, its
  worker, CMaps, standard fonts, ICC data, and pdf-lib locally. No upload,
  remote asset lookup, PDF JavaScript, form, link, attachment, or action
  execution is permitted.
- Lazy-load PDF.js, pdf-lib, their worker, and supporting assets only after
  magic-byte sniffing identifies a PDF.
- Page 1 with exactly one valid supported registration is placed
  automatically. Page 1 with multiple valid registrations is never a manual
  GCP fallback merely because it has multiple frames.
- Never silently select the first, largest, or name-matching registration.
  An automatic producer-specific selector may ship only for an exact signature
  that passes the independent evidence gate in Task 1.
- Frame selection and georeferencing are different states. **Use this frame**
  and an evidence-approved automatic main-map selection apply embedded
  coordinates without requiring a GCP click. **Adjust points** remains
  available after placement.
- Manual control points are used only when registration is absent,
  structurally unsupported, uses an unsupported CRS, contains invalid or
  malformed values, or cannot be read. Preserve those reasons as typed
  provenance rather than reporting “no georeferencing.”
- Preserve source identity, selected registration, selection method, page
  number, total pages, registration family, and any manual adjustment in the
  stored record and rendered UI.
- A stored `sourceRect` clips both the saved Leaflet layer and the
  georeferencer draft mesh. Changing frames updates geometry against the
  already-decoded canonical bitmap; it must not decode or rasterize the PDF
  again.
- Existing GeoTIFF and image records omit all new optional fields and continue
  to load without an IndexedDB version bump or migration.
- PDF password prompts are not supported. Map password callbacks to a typed
  `password-protected` import error; never set pdf-lib's
  `ignoreEncryption: true`.
- Treat browser/worker topology as a separate unresolved shipping gate. A
  successful parser/unit suite does not prove that the chosen worker topology
  works in supported browsers.
- Preserve the current local/CI/merge/deployment distinction. No document,
  test, build, commit, or PR is production acceptance.

## Source-of-Truth Documents

- Design:
  `docs/superpowers/specs/2026-07-27-web-user-maps-pr4-geopdf-design.md`
- Historical compatibility report:
  `docs/research/2026-07-27-geopdf-compatibility.md`
- Discovery corpus receipts:
  `docs/research/2026-07-27-geopdf-external-corpus.json`
- Synthetic-fixture contract:
  `web/src/test/fixtures/geopdf/manifest.json`
- Historical, superseded plan:
  `docs/superpowers/plans/2026-07-27-web-user-maps-pr4-geopdf.md`

## Planned File Map

**Evidence and scripts**

- Modify: `web/scripts/probeGeoPdf.mjs`
- Create: `web/scripts/probeGeoPdfFrames.mjs`
- Create: `web/scripts/probeGeoPdfFrames.test.mjs`
- Modify: `web/package.json`
- Create: `docs/research/2026-07-28-geopdf-frame-selection.md`
- Create: `docs/research/2026-07-28-geopdf-frame-selection-corpus.json`
- Modify only after evidence passes:
  `web/src/test/fixtures/geopdf/manifest.json`
- Modify only after evidence passes:
  `web/src/test/fixtures/geopdf/README.md`

**Contracts, extraction, policy, and parsing**

- Modify: `web/src/userMaps/types.ts`
- Modify: `web/src/userMaps/errors.ts`
- Modify: `web/src/userMaps/errors.test.ts`
- Modify: `web/src/userMaps/transform/projection.ts`
- Modify: `web/src/userMaps/transform/projection.test.ts`
- Create: `web/src/userMaps/parsers/geoPdfMetadata.ts`
- Create: `web/src/userMaps/parsers/geoPdfMetadata.test.ts`
- Create: `web/src/userMaps/parsers/geoPdfFrameSelection.ts`
- Create: `web/src/userMaps/parsers/geoPdfFrameSelection.test.ts`
- Create from evidence:
  `web/src/userMaps/parsers/geoPdfApprovedRules.ts`
- Create: `web/src/userMaps/parsers/geoPdfSource.ts`
- Create: `web/src/userMaps/parsers/geoPdfSource.test.ts`
- Create: `web/src/userMaps/parsers/geoPdfWorker.ts`
- Create: `web/src/userMaps/parsers/parseGeoPdfAuto.ts`
- Create: `web/src/userMaps/parsers/parseGeoPdfAuto.test.ts`

**Generic clipping and rendering**

- Create: `web/src/userMaps/sourceRect.ts`
- Create: `web/src/userMaps/sourceRect.test.ts`
- Modify: `web/src/userMaps/render/mesh.ts`
- Modify: `web/src/userMaps/render/mesh.test.ts`
- Modify: `web/src/userMaps/transform/gcpMesh.ts`
- Modify: `web/src/userMaps/transform/gcpMesh.test.ts`
- Modify: `web/src/userMaps/recordMesh.ts`
- Modify: `web/src/userMaps/recordMesh.test.ts`
- Modify: `web/src/userMaps/render/WarpedRasterLayer.ts`
- Modify: `web/src/userMaps/render/WarpedRasterLayer.test.ts`
- Modify: `web/src/userMaps/render/WarpedRasterLayer.caching.test.ts`
- Modify: `web/src/userMaps/components/UserMapLayers.tsx`
- Modify: `web/src/userMaps/components/UserMapLayers.test.tsx`
- Modify: `web/src/userMaps/useGeoreferenceSession.ts`
- Modify: `web/src/userMaps/useGeoreferenceSession.test.ts`

**State and UX**

- Modify: `web/src/userMaps/useUserMaps.ts`
- Modify: `web/src/userMaps/useUserMaps.test.ts`
- Create: `web/src/userMaps/components/GeoPdfFrameChooser.tsx`
- Create: `web/src/userMaps/components/GeoPdfFrameChooser.test.tsx`
- Modify: `web/src/userMaps/components/UserMapRows.tsx`
- Modify: `web/src/userMaps/components/UserMapRows.test.tsx`
- Modify: `web/src/userMaps/components/ImportDialog.tsx`
- Modify: `web/src/components/MapCanvas.tsx`
- Modify: `web/src/components/MapCanvas.test.tsx`
- Modify: `web/src/App.tsx`
- Modify: `web/src/App.test.tsx`
- Modify: `web/src/styles.css`

**Assets and acceptance**

- Modify: `.gitignore`
- Create: `web/scripts/preparePdfAssets.mjs`
- Create: `web/scripts/checkPdfAssets.mjs`
- Create: `web/scripts/checkPdfAssets.test.mjs`
- Create: `web/public/vendor/pdfjs/` from the pinned package during the
  authorized implementation
- Modify: `web/vite.config.ts`
- Modify: `web/README.md`
- Modify: `ARCHITECTURE.md`
- Create:
  `docs/research/2026-07-28-geopdf-browser-acceptance.md`
- Create:
  `docs/research/2026-07-28-geopdf-browser-acceptance.json`

---

## Task 1: Establish the Independent Frame-Selection Evidence Gate

The five recorded USGS files are discovery evidence. They may define hypotheses
and exact signatures, but they may not count as untouched holdouts for an
automatic selector.

**Files**

- Modify: `web/scripts/probeGeoPdf.mjs`
- Create: `web/scripts/probeGeoPdfFrames.mjs`
- Test: `web/scripts/probeGeoPdfFrames.test.mjs`
- Modify: `web/package.json`
- Create: `docs/research/2026-07-28-geopdf-frame-selection.md`
- Create: `docs/research/2026-07-28-geopdf-frame-selection-corpus.json`

### Step 1: Write a failing script contract test

Use a temporary fake `gdalinfo` executable and fixture JSON so the test can
verify command construction without downloading copyrighted PDFs or depending
on the developer machine's GDAL installation.

```js
// web/scripts/probeGeoPdfFrames.test.mjs
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildNeatlineArgs,
  exactSelectorSignature,
  validateHoldoutRows,
} from "./probeGeoPdfFrames.mjs";

test("opens each named registration through GDAL's NEATLINE option", () => {
  assert.deepEqual(
    buildNeatlineArgs("/tmp/usgs.pdf", "Map Layers"),
    ["-json", "-oo", "NEATLINE=Map Layers", "/tmp/usgs.pdf"],
  );
});

test("signature includes producer, family, page structure, and full label multiset", () => {
  assert.equal(
    exactSelectorSignature({
      producer: "Esri ArcSOC 10.8.1.14362",
      family: "measure",
      structureId: "measure-vp-geo-v1",
      labels: ["Quadrangle Location", "Map Layers", "Adjoining Sheet Diagram"],
    }),
    "Esri ArcSOC 10.8.1.14362|measure|measure-vp-geo-v1|Adjoining Sheet Diagram\u001fMap Layers\u001fQuadrangle Location",
  );
});

test("requires two untouched passing holdouts for every approved signature", () => {
  assert.deepEqual(
    validateHoldoutRows(
      [{
        signature: "modern-3",
        role: "holdout",
        sha256: "aaa",
        productId: "quadrangle-a",
        result: "pass",
      }],
      ["modern-3"],
    ),
    { approved: false, reason: "modern-3 has 1 passing holdout; 2 required" },
  );
});
```

### Step 2: Run the test and confirm it fails

Run:

```bash
cd web
node --test scripts/probeGeoPdfFrames.test.mjs
```

Expected: FAIL because `probeGeoPdfFrames.mjs` does not exist.

### Step 3: Implement the deterministic evidence harness

Export pure helpers so the command behavior and acceptance math are testable.
Keep the CLI entry point guarded so importing the file does not execute it.

```js
// web/scripts/probeGeoPdfFrames.mjs
export const REQUIRED_HOLDOUTS_PER_SIGNATURE = 2;

export function buildNeatlineArgs(pdfPath, label) {
  return ["-json", "-oo", `NEATLINE=${label}`, pdfPath];
}

export function exactSelectorSignature({
  producer,
  family,
  structureId,
  labels,
}) {
  return [
    producer,
    family,
    structureId,
    [...labels].sort().join("\u001f"),
  ].join("|");
}

export function validateHoldoutRows(rows, requiredSignatures) {
  const grouped = Map.groupBy(rows, (row) => row.signature);
  for (const signature of requiredSignatures) {
    const signatureRows = grouped.get(signature) ?? [];
    const falseSelections = signatureRows.filter(
      (row) => row.result === "false-selection",
    );
    if (falseSelections.length > 0) {
      return {
        approved: false,
        reason: `${signature} has ${falseSelections.length} false selection`,
      };
    }
    const passing = signatureRows.filter(
      (row) => row.role === "holdout" && row.result === "pass",
    );
    const distinctHoldouts = new Set(
      passing.map((row) => `${row.sha256}\u001f${row.productId}`),
    ).size;
    if (distinctHoldouts < REQUIRED_HOLDOUTS_PER_SIGNATURE) {
      return {
        approved: false,
        reason: `${signature} has ${distinctHoldouts} passing holdout${
          distinctHoldouts === 1 ? "" : "s"
        }; ${REQUIRED_HOLDOUTS_PER_SIGNATURE} required`,
      };
    }
  }
  return { approved: true };
}
```

The executable portion must:

1. Read a local-only corpus directory supplied by an explicit argument.
2. Verify each file against its recorded SHA-256 before probing it.
3. Record whether the file is one of the five discovery PDFs or a new untouched
   holdout.
4. Enumerate registrations with a research-only pdf-lib public-object reader
   in this script. Freeze its field paths and normalized output in the receipt;
   Task 4 independently reproduces that contract in product TypeScript.
5. Run `gdalinfo -json -oo "NEATLINE=<exact label>" <file>` for each candidate.
6. Compare the selected candidate's source rectangle and five fixed sample
   points against the corresponding GDAL geotransform.
7. Mark the file PASS only when every canonical pixel is within one pixel and
   every projected ground point is within five metres.
8. Write stable JSON sorted by exact selector signature, SHA-256, and candidate
   ID; exclude absolute paths and timestamps.

It also exposes the deterministic
`--approved-rules-from <receipt> --write-approved-rules <target>` mode used in
Task 5. That mode validates the receipt with `validateHoldoutRows` before
writing and emits an empty array when no signature qualifies.

Add:

```json
{
  "scripts": {
    "probe:geopdf-frames": "node scripts/probeGeoPdfFrames.mjs"
  }
}
```

to `web/package.json`.

### Step 4: Assemble independent holdouts without committing the PDFs

Re-download the five discovery files from their recorded URLs and verify their
SHA-256 values. Store all real PDFs outside Git. For each exact signature that
might receive an automatic selector, obtain at least two additional independent
USGS files that were not used to formulate the rule:

| Hypothesized exact signature | Discovery files | Minimum new holdouts |
| --- | ---: | ---: |
| Esri ArcSOC 10.8.1.14362, `/Measure`, 3-label page structure | 3 | 2 |
| ESRI ArcSOC 10.0.2.3200, `/LGIDict`, 3-label page structure | 1 | 2 |
| ESRI ArcSOC 10.0.2.3200, `/LGIDict`, 4-label page structure | 1 | 2 |

Approving all three signatures therefore requires at least six new independent
files. A holdout must have a distinct SHA-256 and quadrangle and must be
downloaded from an authoritative USGS host. Record URL, title, publication
identifier/date when available, byte size, SHA-256, producer, registration
family, complete label multiset, candidate count, and discovery/holdout role.

Do not broaden one signature's evidence to another producer string,
registration family, page structure, or label multiset.

### Step 5: Run the evidence probe

Run:

```bash
cd web
npm run probe:geopdf-frames -- \
  --corpus /absolute/local/path/to/geopdf-frame-holdouts \
  --manifest ../docs/research/2026-07-28-geopdf-frame-selection-corpus.json
```

Expected:

- The five original files reproduce their recorded `/Measure` or `/LGIDict`
  candidates.
- Every candidate has an independent GDAL result selected by exact `NEATLINE`.
- Each proposed signature reports at least two untouched PASS holdouts or is
  explicitly rejected for automatic selection.
- A rejected signature remains supported through the frame chooser.

### Step 6: Write the evidence report and corpus receipt

`docs/research/2026-07-28-geopdf-frame-selection.md` must state:

- the exact GDAL and runtime versions;
- the five discovery files and the new holdouts;
- every exact selector signature;
- per-candidate source rectangles and sampled deltas;
- whether each signature is approved or rejected for automatic main-map
  selection;
- why neither array order nor rectangle area is an acceptance signal;
- that the chooser remains the supported fallback for every valid unapproved
  multi-frame file;
- that browser/worker topology has not yet passed.

The JSON receipt must be machine-readable and contain no local paths.

### Step 7: Re-run the test and inspect stable output

Run:

```bash
cd web
node --test scripts/probeGeoPdfFrames.test.mjs
npm run probe:geopdf-frames -- \
  --corpus /absolute/local/path/to/geopdf-frame-holdouts \
  --manifest ../docs/research/2026-07-28-geopdf-frame-selection-corpus.json
git diff --check
```

Expected: PASS, and a second probe produces no diff.

### Step 8: Commit the evidence task

```bash
git add \
  web/scripts/probeGeoPdf.mjs \
  web/scripts/probeGeoPdfFrames.mjs \
  web/scripts/probeGeoPdfFrames.test.mjs \
  web/package.json \
  docs/research/2026-07-28-geopdf-frame-selection.md \
  docs/research/2026-07-28-geopdf-frame-selection-corpus.json
git commit -m "research(web): validate GeoPDF frame selection"
```

### Task 1 stop rule

Do not implement an automatic USGS selector for a signature unless that exact
signature has two new untouched PASS holdouts and zero false selections across
the entire recorded corpus. Failure does **not** stop the GeoPDF product:
continue with embedded-coordinate placement through the frame chooser. Stop the
whole implementation only if the extractor cannot reliably enumerate and
validate the embedded registrations or the independent GDAL oracle contradicts
the embedded-coordinate placement itself.

---

## Task 2: Add Stored Contracts, Typed Fallback Reasons, and Projection Entry Point

**Files**

- Modify: `web/src/userMaps/types.ts`
- Modify: `web/src/userMaps/errors.ts`
- Test: `web/src/userMaps/errors.test.ts`
- Modify: `web/src/userMaps/transform/projection.ts`
- Test: `web/src/userMaps/transform/projection.test.ts`

### Step 1: Write failing contract tests

Add runtime assertions for the new error and projection entry point:

```ts
// web/src/userMaps/errors.test.ts
it("exposes password-protected as a typed user-facing import error", () => {
  const error = new UserMapImportError(
    "password-protected",
    "Unlock and export this PDF before importing it.",
  );
  expect(error.code).toBe("password-protected");
});

// web/src/userMaps/transform/projection.test.ts
it("projects a supported CRS point to WGS84", () => {
  expect(projectToLatLng("EPSG:26920", 500_000, 5_000_000)).toEqual({
    lat: expect.closeTo(45.153477, 5),
    lng: expect.closeTo(-63, 5),
  });
});
```

Add a compile-time test fixture that constructs a multi-frame GeoPDF record and
uses every required provenance field.

```ts
const record: UserMapRecord = {
  id: "map-1",
  name: "USGS map.pdf",
  source: "geopdf",
  createdAt: "2026-07-28T12:00:00.000Z",
  pixelSize: { width: 4096, height: 3166 },
  sourceRect: { x: 221, y: 188, width: 3490, height: 2720 },
  georef: {
    kind: "gcp",
    method: "affine",
    gcps: [
      { id: "gcp-1", pixel: { x: 221, y: 188 }, map: { lat: 45, lng: -63 } },
      { id: "gcp-2", pixel: { x: 3711, y: 188 }, map: { lat: 45, lng: -62 } },
      { id: "gcp-3", pixel: { x: 221, y: 2908 }, map: { lat: 44, lng: -63 } },
    ],
  },
  pdf: {
    pageNumber: 1,
    pageCount: 2,
    registration: {
      status: "embedded",
      flavor: "measure",
      selection: { kind: "user" },
      selectedFrameId: "measure-12",
      selectedLabel: "Map Layers",
      candidates: [],
      adjusted: false,
    },
  },
};
expect(record.pdf?.registration.status).toBe("embedded");
```

### Step 2: Run the focused tests and confirm failure

Run:

```bash
cd web
npx vitest run \
  src/userMaps/errors.test.ts \
  src/userMaps/transform/projection.test.ts
npm run build
```

Expected: FAIL because the error code, projection entry point, and record fields
do not exist.

### Step 3: Add the serializable data contracts

Add these types to `types.ts`:

```ts
export type PixelRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type PdfRegistrationFlavor = "measure" | "lgidict";

export type PdfRegistrationCandidate = {
  id: string;
  flavor: PdfRegistrationFlavor;
  embeddedLabel: string | null;
  sourceRect: PixelRect;
  gcps: Gcp[];
};

export type PdfManualReason =
  | "absent"
  | "unsupported"
  | "unsupported-crs"
  | "invalid"
  | "unreadable";

export type ParsedPdfRegistration =
  | {
      status: "automatic";
      selection:
        | { kind: "sole" }
        | { kind: "producer-rule"; ruleId: string };
      selected: PdfRegistrationCandidate;
      candidates: PdfRegistrationCandidate[];
    }
  | {
      status: "selection-required";
      candidates: PdfRegistrationCandidate[];
    }
  | {
      status: "manual";
      reason: PdfManualReason;
    };

export type PdfImportMetadata = {
  pageNumber: 1;
  pageCount: number;
  registration:
    | {
        status: "embedded";
        flavor: PdfRegistrationFlavor;
        selection:
          | { kind: "sole" }
          | { kind: "producer-rule"; ruleId: string }
          | { kind: "user" };
        selectedFrameId: string;
        selectedLabel: string | null;
        candidates: PdfRegistrationCandidate[];
        adjusted: boolean;
      }
    | {
        status: "selection-required";
        candidates: PdfRegistrationCandidate[];
      }
    | {
        status: "manual";
        reason: PdfManualReason;
        adjusted: boolean;
      };
};
```

Extend `UserMapRecord` with:

```ts
sourceRect?: PixelRect;
pdf?: PdfImportMetadata;
```

The frame candidate must store the normalized embedded georeference, not a
pdf-lib object or PDF object number. Candidate IDs must be deterministic from
family, page-1 object identity, and normalized source rectangle so the selected
frame can survive a reload.

Add `"password-protected"` to `UserMapImportErrorCode`.

### Step 4: Expose the supported-CRS projection function

Keep proj4 configuration in `projection.ts`; do not duplicate it in the PDF
extractor.

```ts
export function projectToLatLng(
  crs: string,
  x: number,
  y: number,
): LatLngPoint {
  const [lng, lat] = converterFor(crs).forward([x, y]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    throw new Error(`Projection produced non-finite coordinates for ${crs}`);
  }
  return { lat, lng };
}
```

`converterFor` remains the single allowlist boundary. Unsupported CRS errors
must be distinguishable by the PDF extractor so they become a manual fallback,
not a corrupt-file failure.

### Step 5: Run focused tests, build, and commit

Run:

```bash
cd web
npx vitest run \
  src/userMaps/errors.test.ts \
  src/userMaps/transform/projection.test.ts
npm run build
git diff --check
```

Expected: PASS.

```bash
git add \
  web/src/userMaps/types.ts \
  web/src/userMaps/errors.ts \
  web/src/userMaps/errors.test.ts \
  web/src/userMaps/transform/projection.ts \
  web/src/userMaps/transform/projection.test.ts
git commit -m "feat(web): define GeoPDF frame contracts"
```

---

## Task 3: Add Generic Source-Rectangle Mesh and Renderer Support

This task is deliberately PDF-agnostic. Every consumer receives an optional
pixel rectangle that defaults to the complete raster.

**Files**

- Create: `web/src/userMaps/sourceRect.ts`
- Create: `web/src/userMaps/sourceRect.test.ts`
- Modify: `web/src/userMaps/render/mesh.ts`
- Modify: `web/src/userMaps/render/mesh.test.ts`
- Modify: `web/src/userMaps/transform/projection.ts`
- Modify: `web/src/userMaps/transform/projection.test.ts`
- Modify: `web/src/userMaps/transform/gcpMesh.ts`
- Modify: `web/src/userMaps/transform/gcpMesh.test.ts`
- Modify: `web/src/userMaps/recordMesh.ts`
- Modify: `web/src/userMaps/recordMesh.test.ts`
- Modify: `web/src/userMaps/render/WarpedRasterLayer.ts`
- Modify: `web/src/userMaps/render/WarpedRasterLayer.test.ts`
- Modify: `web/src/userMaps/render/WarpedRasterLayer.caching.test.ts`
- Modify: `web/src/userMaps/components/UserMapLayers.tsx`
- Modify: `web/src/userMaps/components/UserMapLayers.test.tsx`
- Modify: `web/src/userMaps/useGeoreferenceSession.ts`
- Modify: `web/src/userMaps/useGeoreferenceSession.test.ts`

### Step 1: Write failing source-rectangle and lattice tests

```ts
// web/src/userMaps/sourceRect.test.ts
it("defaults to the complete raster", () => {
  expect(resolveSourceRect({ width: 400, height: 300 })).toEqual({
    x: 0,
    y: 0,
    width: 400,
    height: 300,
  });
});

it("rejects a rectangle outside the canonical raster", () => {
  expect(() =>
    resolveSourceRect(
      { width: 400, height: 300 },
      { x: 350, y: 10, width: 60, height: 20 },
    ),
  ).toThrow("source rectangle");
});

// web/src/userMaps/render/mesh.test.ts
it("builds the source lattice over only the selected rectangle", () => {
  expect(
    buildSrcMesh(
      4096,
      3072,
      1,
      { x: 200, y: 100, width: 3600, height: 2700 },
    ),
  ).toEqual([
    [{ x: 200, y: 100 }, { x: 3800, y: 100 }],
    [{ x: 200, y: 2800 }, { x: 3800, y: 2800 }],
  ]);
});
```

Add equivalent failing assertions for:

- `buildLatLngMesh` evaluating its top-left and bottom-right at the rectangle
  corners;
- affine and TPS GCP meshes evaluating only the rectangle;
- `meshForRecord` forwarding `record.sourceRect` for embedded, affine, and TPS
  records;
- omitted rectangles preserving byte-for-byte coordinate expectations from the
  existing tests; and
- a georeference session forwarding the selected rectangle to both its
  drag-tier and settled-tier mesh.

### Step 2: Run the focused tests and confirm failure

Run:

```bash
cd web
npx vitest run \
  src/userMaps/sourceRect.test.ts \
  src/userMaps/render/mesh.test.ts \
  src/userMaps/transform/projection.test.ts \
  src/userMaps/transform/gcpMesh.test.ts \
  src/userMaps/recordMesh.test.ts \
  src/userMaps/useGeoreferenceSession.test.ts
```

Expected: FAIL because rectangle-aware APIs do not exist.

### Step 3: Implement one strict rectangle normalizer

```ts
// web/src/userMaps/sourceRect.ts
import type { PixelRect } from "./types";
import type { PixelSize } from "./transform/projection";

const EDGE_TOLERANCE_PX = 1e-7;

export function resolveSourceRect(
  pixelSize: PixelSize,
  sourceRect?: PixelRect,
): PixelRect {
  const rect = sourceRect ?? {
    x: 0,
    y: 0,
    width: pixelSize.width,
    height: pixelSize.height,
  };
  const values = [rect.x, rect.y, rect.width, rect.height];
  if (
    !values.every(Number.isFinite) ||
    rect.width <= 0 ||
    rect.height <= 0 ||
    rect.x < -EDGE_TOLERANCE_PX ||
    rect.y < -EDGE_TOLERANCE_PX ||
    rect.x + rect.width > pixelSize.width + EDGE_TOLERANCE_PX ||
    rect.y + rect.height > pixelSize.height + EDGE_TOLERANCE_PX
  ) {
    throw new Error("Invalid source rectangle for canonical raster");
  }
  const x = Math.max(0, rect.x);
  const y = Math.max(0, rect.y);
  return {
    x,
    y,
    width: Math.min(rect.width, pixelSize.width - x),
    height: Math.min(rect.height, pixelSize.height - y),
  };
}
```

Use this function at import-time and renderer boundaries. Do not silently
repair anything beyond the documented floating-point edge tolerance.

### Step 4: Evaluate every mesh over the same rectangle

Add `sourceRect?: PixelRect` after the existing `gridSize` parameter to
`buildSrcMesh`, `buildLatLngMesh`, `buildGcpLatLngMesh`, and
`buildTpsLatLngMesh`. Preserve all existing call sites by making it optional.
Use the same lattice formula in each:

```ts
const rect = resolveSourceRect(pixelSize, sourceRect);
const x = rect.x + (rect.width * col) / gridSize;
const y = rect.y + (rect.height * row) / gridSize;
```

For `buildSrcMesh`, construct `pixelSize` from its existing width/height
arguments. In `meshForRecord`, pass `record.sourceRect` in all three branches.
In `useGeoreferenceSession`, add:

```ts
sourceRect?: PixelRect;
```

to the options, pass it to both affine/TPS builders, and include it in the mesh
memo dependencies. GCP coordinates remain in full canonical-page pixel space.

### Step 5: Make a geometry change atomic in `WarpedRasterLayer`

Extend the options:

```ts
export type WarpedRasterLayerOptions = {
  paneName: string;
  opacity: number;
  image: CanvasImageSource;
  imageSize: PixelSize;
  latLngMesh: LatLngPoint[][];
  sourceRect?: PixelRect;
};
```

Replace the public mesh-only update with:

```ts
setGeometry(
  latLngMesh: LatLngPoint[][],
  sourceRect?: PixelRect,
): void {
  this.cancelPendingWarp();
  this.rasterOptions.latLngMesh = latLngMesh;
  this.rasterOptions.sourceRect = sourceRect;
  this.srcMesh = buildSrcMesh(
    this.rasterOptions.imageSize.width,
    this.rasterOptions.imageSize.height,
    latLngMesh.length - 1,
    sourceRect,
  );
  this.invalidateCache();
  this.redraw();
}
```

Use the class's actual cancellation/cache-reset helpers or extract them once
from the current `setLatLngMesh`; do not duplicate cleanup. Constructor and
geometry updates must derive source and destination meshes from one committed
pair so a frame change cannot draw candidate A's pixels through candidate B's
coordinates.

In `UserMapLayers.tsx`, add `sourceRect` to `WarpedRasterOverlay`, keep it in a
layout-effect ref next to `mesh`, pass it at construction, and call
`setGeometry(mesh, sourceRect)` from one layout effect. The bitmap-loading
effect must still depend on `previewUrl` and mesh presence, not on `mesh` or
`sourceRect`; a frame change must not call `createImageBitmap` again.

Saved and draft overlays both pass `record.sourceRect`.

### Step 6: Add renderer and React lifecycle regressions

Test:

- constructor source mesh starts at the selected `x/y`, not `(0, 0)`;
- `setGeometry` cancels deferred work and changes both source and destination
  meshes before the redraw;
- frame changes retain one decoded bitmap and one Leaflet layer;
- opacity-only changes do not rebuild geometry;
- rectangle removal restores full-page geometry;
- Strict Mode still closes exactly one bitmap and removes exactly one layer;
- a saved selected frame and its **Adjust points** draft draw the same clipped
  extent; and
- existing GeoTIFF/image tests remain unchanged and passing.

Run:

```bash
cd web
npx vitest run \
  src/userMaps/sourceRect.test.ts \
  src/userMaps/render/mesh.test.ts \
  src/userMaps/transform/projection.test.ts \
  src/userMaps/transform/gcpMesh.test.ts \
  src/userMaps/recordMesh.test.ts \
  src/userMaps/render/WarpedRasterLayer.test.ts \
  src/userMaps/render/WarpedRasterLayer.caching.test.ts \
  src/userMaps/components/UserMapLayers.test.tsx \
  src/userMaps/useGeoreferenceSession.test.ts
npm run lint
npm run build
```

Expected: PASS without bitmap re-decode on geometry changes.

### Step 7: Commit the generic clipping task

```bash
git add \
  web/src/userMaps/sourceRect.ts \
  web/src/userMaps/sourceRect.test.ts \
  web/src/userMaps/render/mesh.ts \
  web/src/userMaps/render/mesh.test.ts \
  web/src/userMaps/transform/projection.ts \
  web/src/userMaps/transform/projection.test.ts \
  web/src/userMaps/transform/gcpMesh.ts \
  web/src/userMaps/transform/gcpMesh.test.ts \
  web/src/userMaps/recordMesh.ts \
  web/src/userMaps/recordMesh.test.ts \
  web/src/userMaps/render/WarpedRasterLayer.ts \
  web/src/userMaps/render/WarpedRasterLayer.test.ts \
  web/src/userMaps/render/WarpedRasterLayer.caching.test.ts \
  web/src/userMaps/components/UserMapLayers.tsx \
  web/src/userMaps/components/UserMapLayers.test.tsx \
  web/src/userMaps/useGeoreferenceSession.ts \
  web/src/userMaps/useGeoreferenceSession.test.ts
git commit -m "feat(web): clip user maps to source rectangles"
```

---

## Task 4: Extract Every Independently Valid Page-1 Registration

The extractor discovers candidates; it does not choose a main map.

**Files**

- Create: `web/src/userMaps/parsers/geoPdfMetadata.ts`
- Create: `web/src/userMaps/parsers/geoPdfMetadata.test.ts`
- Test: `web/src/test/fixtures/geopdf/test_iso32000.pdf`
- Test: `web/src/test/fixtures/geopdf/test_ogc_bp.pdf`
- Test: `web/src/test/fixtures/geopdf/ns-utm20-iso.pdf`
- Test: `web/src/test/fixtures/geopdf/ns-utm20-lgidict.pdf`
- Test: `web/src/test/fixtures/geopdf/rotated-cropped.pdf`
- Test: `web/src/test/fixtures/geopdf/registration-page-2.pdf`
- Test: `web/src/test/fixtures/geopdf/unsupported-crs.pdf`
- Test: `web/src/test/fixtures/geopdf/malformed-measure.pdf`
- Test: `web/src/test/fixtures/geopdf/adobe_style_geospatial.pdf`
- Modify after the evidence gate:
  `web/src/test/fixtures/geopdf/manifest.json`
- Modify after the evidence gate:
  `web/src/test/fixtures/geopdf/README.md`

### Step 1: Define the pure extraction boundary in a failing test

The parser returns selection inputs and diagnostics, never an automatic
candidate:

```ts
export type PdfViewportGeometry = {
  width: number;
  height: number;
  transform: [number, number, number, number, number, number];
  viewBox: [number, number, number, number];
};

export type GeoPdfPageStructure = {
  family: PdfRegistrationFlavor;
  structureId: string;
  completeLabels: string[];
  registrationCount: number;
};

export type GeoPdfMetadataExtraction = {
  producer: string | null;
  pageStructure: GeoPdfPageStructure | null;
  candidates: PdfRegistrationCandidate[];
  rejected: Array<{
    flavor: PdfRegistrationFlavor | null;
    reason: Exclude<PdfManualReason, "absent">;
  }>;
};

export async function extractGeoPdfMetadata(
  bytes: Uint8Array,
  viewport: PdfViewportGeometry,
): Promise<GeoPdfMetadataExtraction>;
```

Start with this test:

```ts
it("returns every valid Measure viewport in stable document order", async () => {
  const result = await extractGeoPdfMetadata(
    fixture("adobe_style_geospatial.pdf"),
    adobeViewport,
  );
  expect(result.candidates.map((candidate) => candidate.embeddedLabel)).toEqual([
    "Map Layers",
    "Quadrangle Location",
  ]);
  expect(result.candidates).toHaveLength(2);
});
```

The expected labels must match the generated fixture's actual embedded values;
if that fixture is intentionally unlabelled, assert its deterministic IDs and
add an in-memory labelled multi-viewport fixture for the label-order test.
Never change the expectation to “ambiguous manual.”

### Step 2: Add strict `/Measure` tests

Cover:

- no page-1 `VP` and no page-1 `LGIDict`;
- `VP` not an array;
- non-dictionary entries;
- non-`GEO` subtypes;
- indirect references through pdf-lib's public lookup methods;
- finite four-value `BBox`;
- equal, even `LPTS/GPTS` arrays with at least three distinct pairs;
- the exact evidenced axis/CRS ordering only;
- supported and unsupported CRS;
- crop and rotation through the supplied PDF.js viewport transform;
- page-2-only metadata remaining absent;
- malformed, non-finite, duplicate, collinear, or contradictory points;
- finite positive source rectangle within the page; and
- several registrations where one is invalid: return the valid candidates,
  preserve the invalid sibling diagnostic, and do not prefer any candidate.

Strict numeric strings may use:

```ts
const PDF_NUMBER_PATTERN =
  /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[Ee][+-]?\d+)?$/;
```

Reject blank strings, units, `NaN`, and `Infinity`.

### Step 3: Add strict `/LGIDict` tests

Cover every exact structure proven by the compatibility report:

- a direct dictionary and evidenced single-element containers;
- exact `/Type` and version values;
- six-value CTM and/or evidenced registration tuples;
- projection/datum parsing without inferred defaults;
- supported geographic and projected coordinates;
- `Neatline` with one duplicate closing point removed;
- exactly four finite non-self-intersecting rectangular corners;
- arbitrary polygons and self-intersections as unsupported;
- viewport transform of the neatline into the canonical source rectangle;
- multiple dictionaries becoming multiple candidates;
- unknown structures as unsupported;
- known structures with malformed values as invalid; and
- the real legacy fixture producing candidates without using array order or
  rectangle area as a rank.

### Step 4: Run tests and confirm failure

Run:

```bash
cd web
npx vitest run src/userMaps/parsers/geoPdfMetadata.test.ts
```

Expected: FAIL because the extractor does not exist.

### Step 5: Implement strict public-object readers and viewport conversion

Use pdf-lib public classes (`PDFArray`, `PDFDict`, `PDFHexString`, `PDFName`,
`PDFNumber`, `PDFObject`, `PDFString`) and `PDFDocument.load(bytes, {
updateMetadata: false })`. Do not use PDF.js private fields.

```ts
function pdfScalar(value: PDFObject | undefined): number | null {
  if (value instanceof PDFNumber) {
    const number = value.asNumber();
    return Number.isFinite(number) ? number : null;
  }
  if (value instanceof PDFString || value instanceof PDFHexString) {
    const text = value.decodeText().trim();
    if (!PDF_NUMBER_PATTERN.test(text)) return null;
    const number = Number(text);
    return Number.isFinite(number) ? number : null;
  }
  return null;
}

export function applyPdfViewport(
  transform: PdfViewportGeometry["transform"],
  x: number,
  y: number,
): { x: number; y: number } {
  const [a, b, c, d, e, f] = transform;
  return { x: a * x + c * y + e, y: b * x + d * y + f };
}
```

Decode labels, then trim only outer Unicode whitespace. Preserve their exact
case and interior characters for both display and signature matching.
For the evidenced USGS structures, read `/Name` from the `/Measure` viewport
and `/Description` from the `/LGIDict` dictionary. An absent field becomes
`null`; do not synthesize a semantic name from array order, size, or nearby
page text. Read the producer through `PDFDocument.getProducer()` and preserve
its decoded value exactly for policy matching.

### Step 6: Normalize `/Measure` candidates

For each page-1 viewport:

1. Validate the supported dictionary shape and CRS.
2. Map each local point into PDF page coordinates.
3. Map page coordinates through `viewport.transform`.
4. Interpret ground coordinates only in the evidenced order.
5. Convert to WGS84 when required through `projectToLatLng`.
6. Build deterministic full-page-pixel GCP IDs.
7. Transform all four `BBox` corners and derive the axis-aligned canonical
   source rectangle.
8. Validate the source rectangle with `resolveSourceRect`.
9. Require `solveAffineFromGcps(gcps)` to pass.
10. Require the resulting mesh to contain only finite valid lat/lng values.

```ts
const pageX = bbox[0] + (bbox[2] - bbox[0]) * localX;
const pageY = bbox[1] + (bbox[3] - bbox[1]) * localY;
const pixel = applyPdfViewport(viewport.transform, pageX, pageY);
```

### Step 7: Normalize `/LGIDict` candidates

For an evidenced CTM:

```ts
function applyCtm(
  [a, b, c, d, e, f]: readonly number[],
  x: number,
  y: number,
) {
  return { x: a * x + c * y + e, y: b * x + d * y + f };
}
```

For evidenced registration tuples:

```ts
const pixel = applyPdfViewport(viewport.transform, userX, userY);
const map = projectToLatLng(crs, groundX, groundY);
```

Transform the validated rectangular `Neatline` through the viewport to form
`sourceRect`; never reduce an arbitrary polygon to a bounding box. Apply the
same affine and finite-mesh gates used for `/Measure`.

For a CTM-only evidenced dictionary, use each of the four validated neatline
corners as `(userX, userY)`: transform it to canonical pixels through the PDF
viewport and to ground coordinates through `applyCtm`, then call
`projectToLatLng`. Do not apply the CTM to the full page corners.

Candidate IDs must be deterministic from family, page-1 object reference, and
normalized source rectangle. Document order is retained only for chooser
display and provenance.

Set `pageStructure` only when all structurally geospatial siblings share the
same evidenced family and shape. Its `registrationCount` counts valid and
rejected siblings, while `completeLabels` preserves the complete sibling-label
multiset. Mixed or unknown structures leave it null, which can still produce a
chooser but can never match an automatic producer rule.

### Step 8: Classify zero-candidate results without hiding diagnostics

The final parser maps extraction diagnostics to one manual reason with this
fixed precedence:

```ts
const MANUAL_REASON_PRECEDENCE: PdfManualReason[] = [
  "unreadable",
  "invalid",
  "unsupported-crs",
  "unsupported",
  "absent",
];
```

This precedence affects only zero-valid-candidate output. If one or more valid
candidates exist, keep them and their independently valid frames even when a
sibling is rejected. Rejected siblings remain available to the evidence
harness but never appear as chooser options.

### Step 9: Revise the synthetic-fixture outcome contract

Only after the real-corpus candidate oracle passes for the corresponding
family, increment the manifest schema and change:

| Fixture | Revised expected result |
| --- | --- |
| `test_iso32000.pdf` | `automatic-sole` |
| `test_ogc_bp.pdf` | `automatic-sole` |
| `adobe_style_geospatial.pdf` | `selection-required` |
| `ns-utm20-iso.pdf` | `automatic-sole` |
| `ns-utm20-lgidict.pdf` | `automatic-sole` |
| `rotated-cropped.pdf` | `automatic-sole` |
| `plain.pdf` | `manual-absent` |
| `registration-page-2.pdf` | `manual-page-1-absent` |

Keep password, corrupt, unsupported-CRS, malformed, and page-count outcomes
distinct. If one family fails the embedded-coordinate oracle, retain that
family's `manual-unsupported` expectations and invoke the revised product stop
rule rather than relabelling it as supported.

Update the fixture README to state that multiple valid registrations require
frame selection, not manual georeferencing, and that the external USGS PDFs
remain outside Git.

### Step 10: Run focused tests and commit

Run:

```bash
cd web
npx vitest run \
  src/userMaps/parsers/geoPdfMetadata.test.ts \
  src/userMaps/transform/affine.test.ts \
  src/userMaps/transform/projection.test.ts \
  src/userMaps/sourceRect.test.ts
npm run build
git diff --check
```

Expected: PASS for both registration families and every negative control.

```bash
git add \
  web/src/userMaps/parsers/geoPdfMetadata.ts \
  web/src/userMaps/parsers/geoPdfMetadata.test.ts \
  web/src/test/fixtures/geopdf/manifest.json \
  web/src/test/fixtures/geopdf/README.md
git commit -m "feat(web): extract GeoPDF frame candidates"
```

---

## Task 5: Implement the Pure, Evidence-Gated Selection Policy

**Files**

- Create: `web/src/userMaps/parsers/geoPdfFrameSelection.ts`
- Create: `web/src/userMaps/parsers/geoPdfFrameSelection.test.ts`
- Create from Task 1 evidence:
  `web/src/userMaps/parsers/geoPdfApprovedRules.ts`

### Step 1: Write failing policy tests

Use synthetic candidates so the selector tests do not depend on PDF parsing.

```ts
it("selects the only independently valid registration", () => {
  expect(selectGeoPdfFrame(extraction([candidate("map")]))).toMatchObject({
    status: "automatic",
    selection: { kind: "sole" },
    selected: { id: "map" },
  });
});

it("preserves all candidates when no exact producer rule matches", () => {
  expect(
    selectGeoPdfFrame(
      extraction([candidate("map"), candidate("inset")], {
        producer: "Unknown producer",
      }),
    ),
  ).toMatchObject({
    status: "selection-required",
    candidates: [{ id: "map" }, { id: "inset" }],
  });
});
```

Add negative controls proving:

- zero candidates maps to the fixed typed manual reason;
- candidate order changes do not change a producer-rule result;
- source-rectangle size changes do not change a result;
- a label-only `Map Layers` match does not select;
- unknown producer/version, family, structure, or complete label multiset does
  not select;
- duplicate `Map Layers`, missing sibling, duplicate sibling, invalid sibling,
  or non-rectangular candidate does not select;
- an approved signature selects exactly one case-sensitive, outer-trimmed
  `Map Layers` candidate;
- a signature approved for `/Measure` does not approve `/LGIDict`; and
- every no-match with several valid candidates returns `selection-required`,
  never `manual`.

### Step 2: Run and confirm failure

Run:

```bash
cd web
npx vitest run src/userMaps/parsers/geoPdfFrameSelection.test.ts
```

Expected: module-not-found failure.

### Step 3: Materialize only approved exact signatures

Task 1's evidence harness must generate a deterministic module. When no
signature passes, its complete content is:

```ts
import type { ApprovedGeoPdfRule } from "./geoPdfFrameSelection";

export const APPROVED_GEO_PDF_RULES: readonly ApprovedGeoPdfRule[] = [];
```

For each passing signature, the generated array contains the exact producer,
family, structure ID, registration count, sorted complete label multiset, and
`ruleId: "usgs-ustopo-map-layers-v1"`. The generator must refuse any entry
without two untouched PASS holdouts or with any false selection. Never hand-add
an entry based on the five discovery files.

Run the generator against the committed evidence receipt:

```bash
cd web
npm run probe:geopdf-frames -- \
  --approved-rules-from ../docs/research/2026-07-28-geopdf-frame-selection-corpus.json \
  --write-approved-rules src/userMaps/parsers/geoPdfApprovedRules.ts
```

Run it twice and require no second diff.

### Step 4: Implement the selector as exact matching

```ts
export type ApprovedGeoPdfRule = {
  ruleId: "usgs-ustopo-map-layers-v1";
  producer: string;
  family: PdfRegistrationFlavor;
  structureId: string;
  registrationCount: number;
  completeLabels: readonly string[];
};

export function selectGeoPdfFrame(
  extraction: GeoPdfMetadataExtraction,
): ParsedPdfRegistration {
  if (extraction.candidates.length === 0) {
    return {
      status: "manual",
      reason: manualReasonFor(extraction.rejected),
    };
  }
  if (extraction.candidates.length === 1) {
    return {
      status: "automatic",
      selection: { kind: "sole" },
      selected: extraction.candidates[0],
      candidates: extraction.candidates,
    };
  }
  const selected = selectByApprovedRule(extraction);
  return selected ?? {
    status: "selection-required",
    candidates: extraction.candidates,
  };
}
```

`selectByApprovedRule` must compare exact strings and sorted full multisets,
require `candidates.length === pageStructure.registrationCount` so every
sibling is independently valid, and require exactly one
`embeddedLabel === "Map Layers"`. It must not read candidate array indices or
source-rectangle dimensions except for already-completed validity checks.

### Step 5: Run the policy suite and mutation-like negative controls

Run:

```bash
cd web
npx vitest run src/userMaps/parsers/geoPdfFrameSelection.test.ts
```

Temporarily alter each comparison in turn while developing (producer, family,
label multiset, uniqueness) and confirm at least one named negative-control test
fails. Restore the implementation; do not commit mutations.

Expected final result: PASS.

### Step 6: Commit the selector

```bash
git add \
  web/src/userMaps/parsers/geoPdfFrameSelection.ts \
  web/src/userMaps/parsers/geoPdfFrameSelection.test.ts \
  web/src/userMaps/parsers/geoPdfApprovedRules.ts
git commit -m "feat(web): select evidence-approved GeoPDF frames"
```

---

## Task 6: Rasterize Page 1, Keep Dependencies Lazy and Local, and Implement Both Topologies

**Files**

- Create: `web/scripts/preparePdfAssets.mjs`
- Create: `web/scripts/checkPdfAssets.mjs`
- Create: `web/scripts/checkPdfAssets.test.mjs`
- Modify: `web/package.json`
- Modify: `.gitignore`
- Create: `web/src/userMaps/parsers/geoPdfSource.ts`
- Create: `web/src/userMaps/parsers/geoPdfSource.test.ts`
- Create: `web/src/userMaps/parsers/geoPdfWorker.ts`
- Create: `web/src/userMaps/parsers/parseGeoPdfAuto.ts`
- Create: `web/src/userMaps/parsers/parseGeoPdfAuto.test.ts`
- Modify: `web/vite.config.ts`

### Step 1: Write failing deterministic asset tests

Use temporary fake `pdfjs-dist` and public directories. Assert that asset
preparation:

- copies only `cmaps`, `standard_fonts`, `iccs`, and `wasm`;
- removes a stale file from the exact generated target;
- copies bytes unchanged;
- emits a stable SHA-256 inventory;
- refuses a source whose package version is not exactly `6.1.200`; and
- never reads or deletes outside the passed source/target directories.

Also test that `checkPdfAssets.mjs` fails for a missing file, changed hash,
unexpected remote URL in the inventory, or version mismatch.

Run:

```bash
cd web
node --test scripts/checkPdfAssets.test.mjs
```

Expected: FAIL because the scripts do not exist.

### Step 2: Implement local asset preparation

```js
// web/scripts/preparePdfAssets.mjs
export const PDFJS_VERSION = "6.1.200";
export const ASSET_DIRECTORIES = [
  "cmaps",
  "standard_fonts",
  "iccs",
  "wasm",
];
```

Copy from the installed pinned package into
`web/public/vendor/pdfjs/6.1.200/`. Write
`web/public/vendor/pdfjs/6.1.200/asset-manifest.json` with package version,
relative path, byte size, and SHA-256 for every copied file. Generate the
directory during `predev` and `prebuild`; do not commit the generated package
assets.

Add to `web/package.json`:

```json
{
  "scripts": {
    "prepare:pdf-assets": "node scripts/preparePdfAssets.mjs",
    "check:pdf-assets": "node scripts/checkPdfAssets.mjs",
    "predev": "npm run prepare:pdf-assets",
    "prebuild": "npm run prepare:pdf-assets"
  }
}
```

Add this exact ignore rule:

```gitignore
web/public/vendor/pdfjs/
```

### Step 3: Write failing page-raster and lifecycle tests

Inject PDF.js, canvas, metadata extraction, selection, and encoding seams into
`parseGeoPdf` tests. Assert:

- `getPage(1)` is the only page request;
- `numPages` is returned unchanged;
- PDF.js viewport crop and rotation are retained;
- the longest rounded output edge is exactly 4,096 and the other is at least
  one pixel;
- the canvas is filled opaque white before `page.render`;
- PNG encoding occurs only after `renderTask.promise`;
- metadata sees the same page viewport used for rendering;
- one valid candidate returns `automatic/sole`;
- several candidates without an approved rule return
  `selection-required`;
- zero candidates retains the page raster and typed manual reason;
- password callbacks return `password-protected`;
- corrupt files and page-render failures return `corrupt-file`;
- metadata public-object failures return manual/unreadable when the page itself
  rendered;
- page, PDF document/loading task, canvas, and feature worker are released on
  success and every failure path; and
- no second PDF byte buffer remains retained after parsing.

Real fixture regressions cover `ns-utm20-iso.pdf`, `ns-utm20-lgidict.pdf`,
`plain.pdf`, `registration-page-2.pdf`, `byte_enc.pdf`, `corrupt.pdf`,
`rotated-cropped.pdf`, and a generated multi-frame fixture.

### Step 4: Run source tests and confirm failure

Run:

```bash
cd web
npx vitest run src/userMaps/parsers/geoPdfSource.test.ts
```

Expected: module-not-found failure.

### Step 5: Implement the shared parse pipeline

`geoPdfSource.ts` exports:

```ts
export type ParsedGeoPdf = {
  pixelSize: PixelSize;
  previewSize: PixelSize;
  preview: Blob;
  pageCount: number;
  registration: ParsedPdfRegistration;
};

export type GeoPdfCanvas = {
  canvas: HTMLCanvasElement | OffscreenCanvas;
  context: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
  encodePng: () => Promise<Blob>;
  release: () => void;
};

export async function parseGeoPdf(
  buffer: ArrayBuffer,
  environment: GeoPdfParseEnvironment,
): Promise<ParsedGeoPdf>;
```

Configure PDF.js only with public display APIs:

```ts
const loadingTask = getDocument({
  data: new Uint8Array(buffer),
  cMapUrl: pdfAssetUrl("cmaps/"),
  cMapPacked: true,
  standardFontDataUrl: pdfAssetUrl("standard_fonts/"),
  iccUrl: pdfAssetUrl("iccs/"),
  wasmUrl: pdfAssetUrl("wasm/"),
  enableXfa: false,
  isEvalSupported: false,
  stopAtErrors: true,
  useWorkerFetch: false,
});
```

Build the asset base from `import.meta.env.BASE_URL` and the current local
origin so subpath deployments work. Every resulting URL must be same-origin.
Set PDF.js's worker URL through Vite's `new URL(..., import.meta.url)` asset
handling; never use a CDN.

After `getPage(1)`:

```ts
const baseViewport = page.getViewport({ scale: 1 });
const scale =
  4096 / Math.max(baseViewport.width, baseViewport.height);
const viewport = page.getViewport({ scale });
const pixelSize = {
  width: Math.max(1, Math.round(viewport.width)),
  height: Math.max(1, Math.round(viewport.height)),
};
```

If rounding makes the longest edge differ from 4,096, recompute the scale from
the rounded dominant dimension and assert the final invariant before
allocating the canvas. Fill:

```ts
context.save();
context.fillStyle = "#fff";
context.fillRect(0, 0, pixelSize.width, pixelSize.height);
context.restore();
```

then render. Extract metadata before transferring the only byte buffer into
PDF.js when the selected topology would detach it. Release the pdf-lib
document before that transfer. Call `selectGeoPdfFrame` only after extraction
has returned every valid candidate.

Map a PDF.js password callback and pdf-lib encryption error to:

```ts
new UserMapImportError(
  "password-protected",
  "Unlock and export this PDF before importing it.",
);
```

Do not use `ignoreEncryption`.

### Step 6: Write failing topology-facade tests

```ts
it("transfers the buffer to the feature worker", async () => {
  await parseGeoPdfAuto(buffer, testEnvironment);
  expect(worker.postMessage).toHaveBeenCalledWith(
    { type: "parse", buffer },
    [buffer],
  );
});

it("uses metadata-worker plus main-canvas fallback when worker rendering is unavailable", async () => {
  environment.supportsWorkerCanvas = false;
  await parseGeoPdfAuto(buffer, environment);
  expect(metadataWorker.postMessage).toHaveBeenCalled();
  expect(mainThreadRenderer).toHaveBeenCalled();
});
```

Also cover:

- preferred worker success;
- an explicit `topology-unsupported` worker response invoking fallback once;
- typed import failures not being retried as topology failures;
- unexpected worker failure becoming `corrupt-file`;
- fallback metadata worker transferring the original buffer back rather than
  cloning it;
- termination after success, failure, and cancellation;
- main-thread canvas release after fallback;
- no worker constructed until the PDF parser module is dynamically imported;
  and
- concurrent imports owning independent workers and cleanup.

### Step 7: Implement the preferred and fallback paths

`geoPdfWorker.ts` accepts:

```ts
type GeoPdfWorkerRequest =
  | { type: "parse"; buffer: ArrayBuffer }
  | { type: "metadata"; buffer: ArrayBuffer; viewport: PdfViewportGeometry };

type GeoPdfWorkerReply =
  | { ok: true; kind: "parsed"; parsed: ParsedGeoPdf }
  | {
      ok: true;
      kind: "metadata";
      extraction: GeoPdfMetadataExtraction;
      buffer: ArrayBuffer;
    }
  | {
      ok: false;
      kind: "import-error";
      code: UserMapImportErrorCode;
      userMessage: string;
    }
  | { ok: false; kind: "topology-unsupported"; message: string };
```

Preferred path:

1. Transfer the original `ArrayBuffer` into one feature worker.
2. Parse public pdf-lib metadata.
3. Render page 1 with PDF.js and `OffscreenCanvas`.
4. Return the PNG blob plus normalized result.
5. Terminate the feature worker and PDF.js work on completion.

Fallback path:

1. Transfer the original buffer into the feature worker.
2. Extract pdf-lib metadata.
3. Transfer that same buffer back.
4. Render page 1 through PDF.js's supported worker-backed display path onto an
   opaque main-thread canvas.
5. Return the same normalized `ParsedGeoPdf`.

`parseGeoPdfAuto.ts` prefers the feature-worker path only when Worker,
OffscreenCanvas 2D, and `convertToBlob` are present. It may retry the fallback
only for `topology-unsupported`, never for password, corrupt, typed metadata,
or user cancellation outcomes.

### Step 8: Run parser, topology, asset, and build tests

Run:

```bash
cd web
node --test scripts/checkPdfAssets.test.mjs
npx vitest run \
  src/userMaps/parsers/geoPdfMetadata.test.ts \
  src/userMaps/parsers/geoPdfFrameSelection.test.ts \
  src/userMaps/parsers/geoPdfSource.test.ts \
  src/userMaps/parsers/parseGeoPdfAuto.test.ts
npm run prepare:pdf-assets
npm run check:pdf-assets
npm run build
```

Inspect `dist/.vite/manifest.json`. Expected:

- initial entry imports neither pdf-lib nor PDF.js;
- parser and worker code are separate lazy chunks;
- worker and supporting asset URLs are local;
- no `http://`, `https://`, or protocol-relative PDF asset reference exists;
  and
- source maps or chunks do not include real-corpus PDFs.

### Step 9: Commit the parser and topology implementation

```bash
git add \
  .gitignore \
  web/package.json \
  web/package-lock.json \
  web/vite.config.ts \
  web/scripts/preparePdfAssets.mjs \
  web/scripts/checkPdfAssets.mjs \
  web/scripts/checkPdfAssets.test.mjs \
  web/src/userMaps/parsers/geoPdfSource.ts \
  web/src/userMaps/parsers/geoPdfSource.test.ts \
  web/src/userMaps/parsers/geoPdfWorker.ts \
  web/src/userMaps/parsers/parseGeoPdfAuto.ts \
  web/src/userMaps/parsers/parseGeoPdfAuto.test.ts
git commit -m "feat(web): rasterize GeoPDF page one locally"
```

This commit does not pass the browser-topology gate by itself.

---

## Task 7: Integrate Import, Persistence, Selection State, and Adjustment Provenance

**Files**

- Modify: `web/src/userMaps/useUserMaps.ts`
- Modify: `web/src/userMaps/useUserMaps.test.ts`
- Modify: `web/src/userMaps/store/userMapStore.test.ts`

### Step 1: Add a PDF parser seam and file helper

```ts
function pdfFile(name = "map.pdf"): File {
  return new File(
    [new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d])],
    name,
    { type: "application/pdf" },
  );
}

function testParsePdf(
  registration: ParsedPdfRegistration,
): () => Promise<ParsedGeoPdf> {
  return async () => ({
    pixelSize: { width: 4096, height: 3072 },
    previewSize: { width: 4096, height: 3072 },
    preview: new Blob(["preview"], { type: "image/png" }),
    pageCount: 2,
    registration,
  });
}
```

Add an injectable:

```ts
parsePdf?: (buffer: ArrayBuffer) => Promise<ParsedGeoPdf>;
```

whose product default dynamically imports `parseGeoPdfAuto` only inside the
PDF branch.

### Step 2: Replace PDF rejection with failing state tests

Cover:

- automatic/sole imports a drawable affine GCP record, `source:"geopdf"`,
  selected rectangle, candidate list, and selection provenance;
- automatic/producer-rule retains the exact `ruleId`;
- multi-frame no-match imports successfully as `selection-required`, stores
  all candidates, has no `sourceRect`, is excluded from visible maps, and does
  not open the georeferencer;
- choosing a frame installs that candidate's GCPs and rectangle without asking
  for control points;
- user selection persists `{ kind:"user" }`;
- manual absent/unsupported/unsupported-crs/invalid/unreadable imports
  successfully with an empty affine GCP record and opens the georeferencer;
- total page count and “later pages were not imported” copy are retained for
  automatic, chooser, and manual outcomes;
- first selection-required record in a batch opens the chooser;
- only if none require selection does the first manual record open the
  georeferencer;
- later unresolved records retain their distinct row states;
- password, corrupt, oversize, and storage failure remain distinct;
- original PDF plus canonical PNG are passed to `saveUserMap`;
- storage failure keeps the complete map and candidates session-only;
- reload preserves source rectangle, candidates, selected frame, rule/user
  provenance, page count, and adjustment state;
- merely opening/closing **Adjust points** does not set `adjusted`;
- GCP add, move, or delete sets `adjusted:true`;
- changing affine/TPS alone does not set `adjusted`;
- choosing another frame after adjustment is refused unless the caller
  explicitly confirms replacement; and
- a confirmed frame change replaces GCPs and rectangle atomically and resets
  `adjusted:false`.

### Step 3: Run and confirm failure

Run:

```bash
cd web
npx vitest run \
  src/userMaps/useUserMaps.test.ts \
  src/userMaps/store/userMapStore.test.ts
```

Expected: FAIL on the old PDF rejection and missing chooser state.

### Step 4: Add explicit selection state to the API

Add:

```ts
export function needsFrameSelection(record: UserMapRecord): boolean {
  return (
    record.source === "geopdf" &&
    record.pdf?.registration.status === "selection-required"
  );
}

export type UserMapsApi = {
  // existing members
  frameChoosingId: string | null;
  frameChoosingMap: VisibleUserMap | null;
  beginFrameSelection: (id: string) => void;
  endFrameSelection: () => void;
  selectPdfFrame: (
    id: string,
    candidateId: string,
    options?: { replaceAdjustedPoints?: boolean },
  ) => Promise<void>;
  needsFrameSelection: (record: UserMapRecord) => boolean;
};
```

`beginFrameSelection` closes the georeferencer before opening the chooser;
`beginGeoreference` closes the chooser. Removing a map closes either mode when
it owns the removed ID.

### Step 5: Convert parsed results into exact stored records

For automatic:

```ts
const selected = parsed.registration.selected;
record.sourceRect = selected.sourceRect;
record.georef = {
  kind: "gcp",
  method: "affine",
  gcps: selected.gcps,
};
record.pdf = {
  pageNumber: 1,
  pageCount: parsed.pageCount,
  registration: {
    status: "embedded",
    flavor: selected.flavor,
    selection: parsed.registration.selection,
    selectedFrameId: selected.id,
    selectedLabel: selected.embeddedLabel,
    candidates: parsed.registration.candidates,
    adjusted: false,
  },
};
```

For selection-required, store an empty affine GCP record, no `sourceRect`, and
the candidates. For manual, store the typed reason, empty affine GCP record,
and `adjusted:false`.

PDF `pixelSize` and `previewSize` are equal, so do not show the GeoTIFF
downsample note.

### Step 6: Implement truthful outcome copy and batch priority

Use one pure helper. Required phrases:

```ts
const pageNote =
  pageCount > 1
    ? `Page 1 of ${pageCount} imported; later pages were not imported.`
    : "Page 1 imported.";
```

Append:

- automatic: `Placed from embedded GeoPDF coordinates.`
- selection-required:
  `Choose the main map or an inset; its embedded coordinates will place it.`
- manual: the exact typed reason plus `Add matching points to place it.`

The manual reason map is:

```ts
const manualReasonNote: Record<PdfManualReason, string> = {
  absent: "No supported geospatial registration was found.",
  unsupported: "This GeoPDF registration variant is not supported.",
  "unsupported-crs":
    "This GeoPDF registration uses an unsupported coordinate system.",
  invalid: "The embedded positioning could not be validated.",
  unreadable: "The embedded positioning could not be read.",
};
```

In `finally`, scan successful outcomes once. Open the first frame chooser when
present; otherwise open the first manual georeferencer. Never translate a
selection-required outcome into `needsGeoreferencing:true`.

### Step 7: Implement frame application as one record replacement

```ts
const candidate = registration.candidates.find(
  (item) => item.id === candidateId,
);
if (!candidate) {
  throw new Error("Selected GeoPDF frame is no longer available");
}
if (
  registration.status === "embedded" &&
  registration.adjusted &&
  !options?.replaceAdjustedPoints
) {
  throw new Error("Replacing adjusted points requires confirmation");
}

const saved: UserMapRecord = {
  ...existing,
  sourceRect: candidate.sourceRect,
  georef: { kind: "gcp", method: "affine", gcps: candidate.gcps },
  pdf: {
    ...existing.pdf,
    registration: {
      status: "embedded",
      flavor: candidate.flavor,
      selection: { kind: "user" },
      selectedFrameId: candidate.id,
      selectedLabel: candidate.embeddedLabel,
      candidates: registration.candidates,
      adjusted: false,
    },
  },
};
```

Update in-memory state and `putUserMapRecord(saved)` using the existing
build-before-setState pattern. Preserve all untouched record object identities.

### Step 8: Mark only real point changes as adjusted

Compare IDs and coordinate values before `saveGcps`. If GCPs actually differ
and `pdf.registration.status` is `embedded` or `manual`, copy its registration
with `adjusted:true`. Do not set it for an equal debounced write or in
`setGeorefMethod`.

### Step 9: Run focused tests and commit

Run:

```bash
cd web
npx vitest run \
  src/userMaps/useUserMaps.test.ts \
  src/userMaps/store/userMapStore.test.ts \
  src/userMaps/recordMesh.test.ts
npm run lint
npm run build
```

Expected: PASS.

```bash
git add \
  web/src/userMaps/useUserMaps.ts \
  web/src/userMaps/useUserMaps.test.ts \
  web/src/userMaps/store/userMapStore.test.ts
git commit -m "feat(web): persist GeoPDF frame selections"
```

---

## Task 8: Build the Frame Chooser and Keep It Distinct from Georeferencing

**Files**

- Create: `web/src/userMaps/components/GeoPdfFrameChooser.tsx`
- Create: `web/src/userMaps/components/GeoPdfFrameChooser.test.tsx`
- Modify: `web/src/userMaps/components/UserMapRows.tsx`
- Modify: `web/src/userMaps/components/UserMapRows.test.tsx`
- Modify: `web/src/userMaps/components/ImportDialog.tsx`
- Modify: `web/src/userMaps/components/UserMapLayers.tsx`
- Modify: `web/src/userMaps/components/UserMapLayers.test.tsx`
- Modify: `web/src/components/MapCanvas.tsx`
- Modify: `web/src/components/MapCanvas.test.tsx`
- Modify: `web/src/App.tsx`
- Modify: `web/src/App.test.tsx`
- Modify: `web/src/styles.css`

### Step 1: Write failing accessible chooser tests

Render a selection-required record with three candidates. Assert:

- `role="dialog"` has the map name in its accessible name;
- page-1 preview is an `<img>` using the existing local blob URL;
- the preview has no Leaflet map or basemap;
- candidates are one labelled radio group in stable document order;
- exact embedded labels are shown unchanged;
- null labels become `Unnamed frame 1`, `Unnamed frame 2`, based only on
  unlabelled display order;
- no candidate is initially selected for a new unresolved import;
- **Use this frame** is disabled until the user chooses a radio;
- choosing a radio highlights only that candidate's source rectangle;
- highlight position uses percentages of canonical `pixelSize`;
- confirming calls `selectPdfFrame` and does not call
  `beginGeoreference`;
- Escape/Cancel closes without choosing;
- changing an existing frame preselects its current candidate;
- selecting a different adjusted frame shows one replacement confirmation;
- cancelling that confirmation keeps the record unchanged;
- accepting passes `{ replaceAdjustedPoints:true }`; and
- no unapproved candidate is described as “Main map.”

Example highlight style:

```ts
function rectStyle(rect: PixelRect, page: PixelSize): CSSProperties {
  return {
    left: `${(rect.x / page.width) * 100}%`,
    top: `${(rect.y / page.height) * 100}%`,
    width: `${(rect.width / page.width) * 100}%`,
    height: `${(rect.height / page.height) * 100}%`,
  };
}
```

### Step 2: Run and confirm chooser tests fail

Run:

```bash
cd web
npx vitest run src/userMaps/components/GeoPdfFrameChooser.test.tsx
```

Expected: module-not-found failure.

### Step 3: Implement the chooser as a controlled overlay

Use props:

```ts
export type GeoPdfFrameChooserProps = {
  map: VisibleUserMap;
  onCancel: () => void;
  onUseFrame: (
    candidateId: string,
    options?: { replaceAdjustedPoints?: boolean },
  ) => Promise<void>;
};
```

Derive candidates only from `map.record.pdf.registration`. If the record is
neither selection-required nor embedded-with-candidates, render nothing.

The overlay contains:

```tsx
<div
  className="geopdf-frame-chooser-backdrop"
  role="presentation"
>
  <section
    className="geopdf-frame-chooser"
    role="dialog"
    aria-modal="true"
    aria-labelledby={titleId}
  >
    <h2 id={titleId}>Choose a frame for {record.name}</h2>
    <p>
      Select the map or inset to display. Its embedded coordinates will place
      it automatically.
    </p>
    <div
      className="geopdf-frame-preview"
      style={{ aspectRatio: `${record.pixelSize.width} / ${record.pixelSize.height}` }}
    >
      <img src={map.previewUrl} alt={`Page 1 of ${record.name}`} />
      {selectedCandidate ? (
        <span
          className="geopdf-frame-highlight"
          style={rectStyle(selectedCandidate.sourceRect, record.pixelSize)}
          aria-hidden="true"
        />
      ) : null}
    </div>
    <fieldset>
      <legend>Registered frames on page 1</legend>
      {candidates.map((candidate, index) => (
        <label key={candidate.id}>
          <input
            type="radio"
            name="geopdf-frame"
            value={candidate.id}
            checked={selectedId === candidate.id}
            onChange={() => setSelectedId(candidate.id)}
          />
          {frameDisplayLabel(candidates, index)}
        </label>
      ))}
    </fieldset>
    <button type="button" onClick={onCancel}>Cancel</button>
    <button type="button" disabled={!selectedId}>Use this frame</button>
  </section>
</div>
```

Use:

```ts
function frameDisplayLabel(
  candidates: PdfRegistrationCandidate[],
  index: number,
): string {
  const label = candidates[index].embeddedLabel;
  if (label !== null) return label;
  const unnamedOrdinal = candidates
    .slice(0, index + 1)
    .filter((candidate) => candidate.embeddedLabel === null).length;
  return `Unnamed frame ${unnamedOrdinal}`;
}
```

Trap focus within the modal, focus the heading or first radio on open, restore
focus to the invoking control on close, close on Escape, and keep background
controls inert while open. Follow the repository's existing modal/overlay
pattern; do not introduce a dialog package.

The preview uses `object-fit: contain` and an inner wrapper with the page's
aspect ratio so percentage rectangles track the rendered page rather than the
outer panel.

### Step 4: Write failing row/provenance tests

Cover these exact row states:

| Record state | Disabled reason/status | Primary action | Secondary action |
| --- | --- | --- | --- |
| Selection required | `Choose frame` | **Choose frame** | none |
| Embedded, one retained candidate | placed | **Adjust points** | none |
| Embedded, several retained candidates | placed | **Change frame** | **Adjust points** |
| Manual fallback, unsolved | `Needs georeferencing` | **Georeference** | none |
| Manual or embedded, solved | placed | **Adjust points** | **Change frame** when candidates permit |

Assert provenance copy includes:

- `GeoPDF page 1` or `GeoPDF page 1 of N`;
- selected exact label or `Unnamed frame N`;
- `Measure` or `LGIDict`;
- `sole registration`, `USGS rule`, or `chosen by you`;
- `adjusted` only after a real GCP edit; and
- the manual reason without implying metadata was absent when it was invalid,
  unreadable, unsupported, or unsupported-CRS.

The unresolved row must never render **Georeference** or “Needs
georeferencing.”

### Step 5: Implement row and import-copy changes

Change the empty summary from “Load your own GeoTIFF” to “Load GeoTIFF, PDF, or
image.” Keep the existing privacy line visible.

Derive row state through small pure helpers in `UserMapRows.tsx`; do not put
PDF branching into `MapCanvas` or `WarpedRasterLayer`. Render **Choose frame**
or **Change frame** through `api.beginFrameSelection(record.id)`. Keep
**Adjust points** wired to `beginGeoreference`.

### Step 6: Mount the chooser and forward the selected rectangle

In `App.tsx`:

1. pass `editingMap?.record.sourceRect` to
   `useGeoreferenceSession`;
2. mount `GeoPdfFrameChooser` when `userMapsApi.frameChoosingMap` exists;
3. wire cancel/use to the state API;
4. keep the georeferencer and chooser mutually exclusive; and
5. never expose GCP controls in the chooser.

Add an `App.test.tsx` integration proving:

```text
import multi-frame PDF
→ chooser opens
→ georeference panel absent
→ choose "Map Layers"
→ no map click
→ chooser closes
→ selected user-map layer becomes drawable
→ row offers Change frame and Adjust points
```

Add a second flow that chooses an inset and confirms the chosen candidate's
rectangle/GCPs, not the main map's.

### Step 7: Fit the live map after explicit frame confirmation

Extend the user-map state with a monotonically numbered fit request emitted
only after automatic placement or successful user confirmation:

```ts
type UserMapFitRequest = { mapId: string; revision: number };
```

Pass it from `App` through `MapCanvas` to `UserMapLayers`. A small
`UserMapFitController` inside `UserMapLayers` uses `meshForRecord`, computes
finite Leaflet bounds over every mesh vertex, and calls:

```ts
map.fitBounds(bounds, { padding: [48, 48], maxZoom: 16 });
```

Consume each revision once. Do not fit for selection-required or manual
records. Test that selecting a different frame fits its mesh bounds exactly
once without reconstructing the raster layer.

### Step 8: Add responsive styles and real-mount coverage

Add styles adjacent to the existing user-map/georeferencer styles. Required
behavior:

- readable at a 320 CSS-pixel viewport;
- scrollable panel when vertical space is tight;
- preview maintains page aspect ratio;
- rectangle has a high-contrast solid edge plus translucent fill;
- radio labels have at least 44 CSS-pixel touch height;
- visible keyboard focus;
- safe-area padding on mobile Safari; and
- no horizontal overflow.

Use the existing real Leaflet mount harness to prove that confirmation creates
a drawable selected layer and that **Adjust points** draws the same clipped
source rectangle.

### Step 9: Run focused UI and integration tests

Run:

```bash
cd web
npx vitest run \
  src/userMaps/components/GeoPdfFrameChooser.test.tsx \
  src/userMaps/components/UserMapRows.test.tsx \
  src/userMaps/components/UserMapLayers.test.tsx \
  src/userMaps/components/GeoreferenceMapLayer.realMount.test.tsx \
  src/components/MapCanvas.test.tsx \
  src/App.test.tsx
npm run lint
npm run build
```

Expected: PASS.

### Step 10: Commit the chooser and UX

```bash
git add \
  web/src/userMaps/components/GeoPdfFrameChooser.tsx \
  web/src/userMaps/components/GeoPdfFrameChooser.test.tsx \
  web/src/userMaps/components/UserMapRows.tsx \
  web/src/userMaps/components/UserMapRows.test.tsx \
  web/src/userMaps/components/ImportDialog.tsx \
  web/src/userMaps/components/UserMapLayers.tsx \
  web/src/userMaps/components/UserMapLayers.test.tsx \
  web/src/components/MapCanvas.tsx \
  web/src/components/MapCanvas.test.tsx \
  web/src/App.tsx \
  web/src/App.test.tsx \
  web/src/styles.css
git commit -m "feat(web): choose embedded GeoPDF frames"
```

---

## Task 9: Run the Separate Browser/Worker-Topology Acceptance Gate

Unit tests and a production build are prerequisites for this task, not evidence
that it passed.

**Files**

- Create:
  `docs/research/2026-07-28-geopdf-browser-acceptance.md`
- Create:
  `docs/research/2026-07-28-geopdf-browser-acceptance.json`
- Modify only if observed browser behavior requires the accepted fallback:
  `web/src/userMaps/parsers/parseGeoPdfAuto.ts`
- Modify with a regression for every topology correction:
  `web/src/userMaps/parsers/parseGeoPdfAuto.test.ts`

### Step 1: Freeze the acceptance inputs and environment

Record before testing:

- branch and exact HEAD SHA;
- OS and hardware;
- Node, npm, GDAL, Chrome, Firefox, desktop Safari, iOS, and mobile Safari
  versions actually used;
- device pixel ratio, viewport, and available memory where exposed;
- `pdfjs-dist` and pdf-lib exact versions;
- SHA-256 of every local PDF;
- which exact selector signatures passed Task 1;
- whether the run is preferred worker rendering or fallback; and
- the command and local URL used.

The PDF set is:

1. deterministic `ns-utm20-iso.pdf`;
2. deterministic `ns-utm20-lgidict.pdf`;
3. one real current USGS `/Measure` file;
4. one real legacy USGS `/LGIDict` file;
5. one 10–20 MB real GeoPDF;
6. one larger real stress GeoPDF;
7. `byte_and_rgbsmall_2pages.pdf`;
8. `plain.pdf`; and
9. an unknown/unapproved multi-frame selector signature.

Keep real PDFs local and outside Git.

### Step 2: Build and serve the exact production artifact

Run:

```bash
cd web
npm ci
npm run prepare:pdf-assets
npm run check:pdf-assets
npm test
npm run lint
npm run build
npx vite preview --host 0.0.0.0
```

Use that exact built artifact and HEAD for every browser; record the preview
URL and do not mix artifacts within one matrix.

### Step 3: Exercise the preferred topology in desktop Chrome

For each required input:

1. Start performance and memory recording.
2. Open the import control and select the local file.
3. Confirm progress text paints before parsing work.
4. Interact with the base map during parsing.
5. Record total import duration and every import-caused main-thread long task.
6. Confirm page count and exact automatic/chooser/manual state.
7. For chooser files, select each independently accepted frame in turn.
8. Confirm only its source rectangle draws at independently verified
   coordinates.
9. Open **Adjust points** and confirm the same rectangle and extracted GCPs.
10. Reload and confirm provenance and placement.
11. Remove the map and verify object URLs, workers, documents, and canvases
    release.

Repeat import/remove three consecutive times for both a normal and large file.
Pass requires:

- no import-caused main-thread task over 200 ms on the reference desktop
  Chrome run;
- responsive map/UI input during worker parsing;
- no monotonically retained PDF/canvas memory after cleanup;
- a clean console; and
- no network request containing PDF bytes, a local PDF path, or an upload
  body. Normal unrelated map-tile/data traffic is recorded separately and is
  not confused with PDF upload.

### Step 4: Run the required rendered interaction matrix

Run the same user-visible behavior in:

- current desktop Chrome;
- current desktop Firefox;
- current desktop Safari; and
- current mobile Safari on a real device or the project's accepted physical
  device path.

For every browser:

- deterministic supported sole `/Measure` places automatically;
- deterministic supported sole `/LGIDict` places automatically;
- a rule-enabled exact signature, if Task 1 approved one, selects the unique
  `Map Layers` frame automatically;
- an unapproved signature opens **Choose frame**, not **Georeference**;
- selecting the primary frame and each supported inset uses embedded GCPs
  without map clicks;
- margins and sibling frames do not draw through the selected transform;
- **Change frame** changes GCPs and clipping without decoding the bitmap again;
- adjusted points trigger the replacement warning;
- reload preserves page, candidates, selection, rule/user provenance,
  clipping, and adjustment;
- plain PDF opens the existing manual georeferencer;
- multi-page PDF reports the total and imports only page 1;
- removal releases local resources; and
- the console has no PDF/worker/asset errors.

Capture screenshots of the selected main-map and inset extents and record their
candidate IDs, not just human-readable labels.

### Step 5: Exercise the fallback only when required

If a required browser cannot complete preferred worker parsing/rendering:

1. Preserve the exact error and preferred-topology failure evidence.
2. Verify it is a topology limitation, not corrupt input, unsupported
   metadata, or an asset-path bug.
3. Run the metadata-worker plus PDF.js/main-canvas fallback.
4. Add a focused automated regression for the cause before changing runtime
   selection.
5. Re-run the complete matrix, responsiveness measurement, cleanup cycle, and
   local-network inspection on the fallback.

Do not silently catch all worker errors and retry. Only the explicit
`topology-unsupported` result may select fallback.

### Step 6: Apply the topology stop rule

The gate passes only if each required browser has one accepted path and the
reference desktop responsiveness/cleanup gates pass.

If neither topology passes any required browser:

- stop implementation;
- record the failed matrix without softening the requirement;
- do not call the feature shippable;
- do not update README/architecture as completed behavior; and
- return to design.

Metadata success, a valid automatic rule, a chooser unit test, or a green build
cannot override this stop.

### Step 7: Write a stable acceptance receipt

The Markdown report explains observations and limitations. The JSON receipt
uses `schemaVersion: 1` and requires the exact tested 40-character `headSha`
plus non-empty `topologies`, `browsers`, `files`, `performance`, `cleanup`, and
`networkPrivacy` arrays. `decision` is exactly `pass` or `blocked`. A schema
test rejects an empty required array, an unrecognized decision, or a non-SHA
head value. Exclude local absolute paths, personal device names, and real PDF
bytes.

### Step 8: Re-run topology regressions and commit the receipt

Run:

```bash
cd web
npx vitest run \
  src/userMaps/parsers/parseGeoPdfAuto.test.ts \
  src/userMaps/parsers/geoPdfSource.test.ts \
  src/userMaps/components/GeoPdfFrameChooser.test.tsx \
  src/userMaps/components/UserMapLayers.test.tsx
npm run build
git diff --check
```

Expected: PASS if the browser matrix passed.

```bash
git add \
  docs/research/2026-07-28-geopdf-browser-acceptance.md \
  docs/research/2026-07-28-geopdf-browser-acceptance.json \
  web/src/userMaps/parsers/parseGeoPdfAuto.ts \
  web/src/userMaps/parsers/parseGeoPdfAuto.test.ts
git commit -m "test(web): accept GeoPDF browser topology"
```

If the matrix is blocked, commit only the honest failure receipt on the task
branch if the maintainer wants to preserve it; do not proceed to Task 10.

---

## Task 10: Update Product Documentation and Run Final Local Gates

Proceed only after Tasks 1 and 9 pass under their distinct rules.

**Files**

- Modify: `web/README.md`
- Modify: `ARCHITECTURE.md`
- Modify: `docs/superpowers/specs/2026-07-27-web-user-maps-pr4-geopdf-design.md`

### Step 1: Write the documentation from observed behavior

Update `web/README.md` with:

- PDF page-1-only behavior and total-page notice;
- exact automatic/chooser/manual distinction;
- supported `/Measure` and `/LGIDict` structures;
- which exact USGS signatures, if any, have automatic main-map selection;
- chooser behavior for every other valid multi-frame file;
- **Change frame** versus **Adjust points**;
- local-only privacy and local PDF.js assets;
- 4,096-pixel opaque-white raster contract;
- password/corrupt/unsupported cases; and
- browser matrix actually accepted.

Update `ARCHITECTURE.md` with:

- lazy parser/worker boundary;
- public pdf-lib object traversal;
- metadata discovery versus selection policy;
- generic `sourceRect`;
- canonical PDF pixel space;
- selected-frame clipping in saved and draft rendering;
- stored provenance union;
- exact selector evidence boundary;
- local asset preparation;
- accepted browser topology and cleanup lifecycle; and
- browser acceptance remaining distinct from deployment.

Set the design document implementation status only to the state actually
reached, for example “Implemented locally; browser gate passed; unpublished.”
Do not mark it deployed.

Do not rewrite the historical 2026-07-27 compatibility report's `BLOCKED`
result. Link the new evidence reports as the follow-up under the corrected
contract.

### Step 2: Run fixture integrity and focused behavior tests

Run:

```bash
cd web
npx vitest run \
  src/userMaps/testFixtures.test.ts \
  src/userMaps/parsers/geoPdfMetadata.test.ts \
  src/userMaps/parsers/geoPdfFrameSelection.test.ts \
  src/userMaps/parsers/geoPdfSource.test.ts \
  src/userMaps/parsers/parseGeoPdfAuto.test.ts \
  src/userMaps/useUserMaps.test.ts \
  src/userMaps/store/userMapStore.test.ts \
  src/userMaps/recordMesh.test.ts \
  src/userMaps/render/WarpedRasterLayer.test.ts \
  src/userMaps/components/GeoPdfFrameChooser.test.tsx \
  src/userMaps/components/UserMapRows.test.tsx \
  src/userMaps/components/UserMapLayers.test.tsx \
  src/App.test.tsx
```

Expected: PASS.

### Step 3: Run the complete repository-local web gates

Run from a clean dependency install:

```bash
cd web
npm ci
npm test
npm run lint
npm run build
npm run check:pdf-assets
```

Then from the repository root:

```bash
git diff --check
git status --short --branch
```

Expected:

- all tests, lint, build, and asset checks pass;
- generated PDF assets are ignored;
- no real external-corpus PDF is tracked;
- only task files are changed; and
- every durable implementation change is committed.

### Step 4: Inspect lazy bundle output

Record initial entry size and PDF/pdf-lib/worker lazy chunk sizes in the
browser acceptance report. Verify:

```bash
cd web
rg -n "pdfjs|pdf-lib|geoPdf" dist/.vite/manifest.json
rg -n "https?://|//" public/vendor/pdfjs/6.1.200/asset-manifest.json
```

The first command must show PDF code reachable only through lazy chunks. The
second must show no remote PDF asset URL; ordinary JSON syntax or hashes are
not failures.

### Step 5: Review requirement traceability

Confirm every design constraint has executable evidence:

| Requirement | Primary evidence |
| --- | --- |
| One valid registration auto-places | Tasks 4, 5, 7 |
| Multiple valid registrations use exact rule or chooser | Tasks 1, 5, 8 |
| No first/largest/name-only selection | Tasks 1 and 5 negative controls |
| Frame choice uses embedded coordinates, no GCP clicks | Tasks 7 and 8 integration |
| Manual only for unusable metadata | Tasks 4, 5, 7 |
| Page 1 only and total pages | Tasks 6 and 7 |
| Opaque-white longest edge 4,096 | Task 6 |
| Local-only and lazy dependencies | Tasks 6 and 9 |
| Selected rectangle in saved layer and Adjust Points | Tasks 3, 8, 9 |
| Provenance survives reload | Tasks 7, 8, 9 |
| Browser/worker topology separately accepted | Task 9 |
| Automatic USGS rule has independent holdouts | Task 1 |

### Step 6: Commit the documentation

```bash
git add \
  web/README.md \
  ARCHITECTURE.md \
  docs/superpowers/specs/2026-07-27-web-user-maps-pr4-geopdf-design.md
git commit -m "docs(web): document GeoPDF frame import"
```

### Step 7: Stop before publication

Report:

- final local HEAD SHA;
- Task 1 selector signatures approved or left chooser-only;
- Task 9 accepted topology by browser;
- exact test/lint/build commands and results;
- browser acceptance report paths;
- final `git status --short --branch`; and
- that the branch is local and unpublished.

Do not push, open a PR, merge, promote, or deploy without separate
authorization.

---

## Revised Stop Rules

1. **Candidate extraction:** If neither real `/Measure` nor real `/LGIDict`
   can place a selected frame from embedded coordinates within the frozen
   pixel and ground gates, stop. A manual-only PDF renderer is not an
   acceptable product.
2. **Family scope:** A failed registration-family variant remains a typed
   unsupported manual fallback; do not infer axis order, projection, or
   missing values to make it pass.
3. **Automatic selector:** A signature without two new untouched PASS holdouts
   and zero false selections is not allow-listed. Continue with the chooser;
   this does not block the useful GeoPDF product.
4. **Ordinary multi-frame files:** Several valid registrations are never a
   manual-georeferencing reason. A producer-rule no-match returns
   `selection-required`.
5. **Heuristics:** Any implementation whose result changes with candidate
   order or relative rectangle area fails. `Map Layers` text alone is
   insufficient.
6. **Browser topology:** If neither preferred worker rendering nor the defined
   fallback passes every required browser plus responsiveness and cleanup
   gates, stop regardless of metadata, unit-test, or build success.
7. **Publication:** Local completion is not authorization to publish or
   evidence of deployment.

## Plan Self-Review Checklist

Before implementation begins, the executing agent must:

- read the approved design and both 2026-07-28 evidence reports named here;
- verify branch/worktree/head and preserve spike commits;
- confirm every file path and named API still exists;
- search this plan for `TODO`, `TBD`, “manual ambiguity,” “choose first,” and
  “choose largest” and resolve any accidental placeholder or obsolete rule;
- ensure the manifest is not revised before the independent family evidence;
- ensure `geoPdfApprovedRules.ts` is generated only from passing holdouts;
- ensure selection-required rows and outcomes never call
  `beginGeoreference`;
- ensure generic render/mesh code contains no PDF metadata inspection;
- ensure real USGS files and generated PDF.js package assets remain untracked;
  and
- stop for a new design review if codebase drift makes the approved boundaries
  materially inaccurate.

## Execution Handoff

When the maintainer grants separate implementation authorization, choose one:

1. **Subagent-driven in this task:** use
   `superpowers:subagent-driven-development`, review after every task, and
   preserve the stop gates.
2. **Separate execution task:** open a fresh task in this worktree and use
   `superpowers:executing-plans` for batched checkpoints.

Until that authorization is explicit, this plan and its specification commit
are the final deliverables.
