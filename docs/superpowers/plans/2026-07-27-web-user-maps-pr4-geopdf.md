# Web "Your Maps" PR 4 GeoPDF Import Implementation Plan

> **Superseded on 2026-07-28:** Do not execute this plan. Its ambiguity
> contract incorrectly routes ordinary multi-frame USGS GeoPDFs to manual
> georeferencing. Use
> [`2026-07-28-web-user-maps-pr4-geopdf.md`](2026-07-28-web-user-maps-pr4-geopdf.md)
> instead. This file remains as the historical plan that governed the
> compatibility spike.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Import page 1 of a browser-local PDF as a fixed 4,096-pixel user map, automatically place only evidence-proven `/Measure` or `/LGIDict` registrations, and route every other readable page to the existing manual georeferencer.

**Architecture:** PDF.js rasterizes page 1 while pdf-lib traverses low-level geospatial dictionaries. Both dependencies stay behind the PDF branch and lazy chunks. The parser normalizes a PDF into the same preview-plus-GCP contract already consumed by IndexedDB, affine/TPS solving, and `WarpedRasterLayer`; no PDF logic enters Leaflet or the renderer.

**Tech Stack:** React 19, TypeScript 5.9, Vite 8, Vitest 4, PDF.js (`pdfjs-dist` candidate `6.1.200`), pdf-lib `1.17.1`, proj4, IndexedDB, Web Workers, OffscreenCanvas, GDAL as a spike-time oracle.

## Global Constraints

- Import page 1 only. Report `pageCount` and say explicitly when later pages were not imported.
- The PDF canonical raster has a longest edge of exactly 4,096 px, preserves crop/rotation/aspect ratio, and uses an opaque white background.
- Nothing is uploaded. Load PDF bytes from `File`, bundle PDF assets locally, and do not execute actions, JavaScript, forms, links, attachments, or remote resources.
- Probe both `/Measure` and `/LGIDict`; ship only independently proven variants. Never depend on PDF.js internals.
- Missing, unsupported, unsupported-CRS, invalid, or ambiguous registration is a successful manual-georeferencing import.
- Multiple page-1 registrations are ambiguous. Never select the first, named, or largest candidate.
- Valid embedded registration becomes ordinary affine GCPs, renders immediately, and remains editable through **Adjust points**. Never select TPS automatically.
- Pin exact runtime versions. Keep PDF.js, pdf-lib, their worker, and their supporting assets out of the initial application request.
- No password UI. A password callback produces a typed unlock/export error.
- Existing maps omit the new optional PDF metadata and require no IndexedDB version bump.
- Keep `App.tsx`, `MapCanvas.tsx`, `WarpedRasterLayer`, and the affine/TPS solvers free of PDF-specific branches.
- Do not loosen acceptance criteria after a failed corpus file. If neither registration family passes the spike, stop and return to design.
- Preserve the distinction among local gates, hosted CI, merge, deployment, and browser/device acceptance.

## Approved Design

Read before implementation:

- `docs/superpowers/specs/2026-07-27-web-user-maps-pr4-geopdf-design.md`
- `ARCHITECTURE.md:490-565`
- `web/src/userMaps/useUserMaps.ts:175-394`
- `web/src/userMaps/store/userMapStore.ts:108-141`
- `web/src/userMaps/components/UserMapRows.tsx:15-122`

## File Structure

### New parser files

- `web/src/userMaps/parsers/geoPdfMetadata.ts` — pdf-lib dictionary traversal, candidate classification, coordinate normalization, and GCP validation.
- `web/src/userMaps/parsers/geoPdfMetadata.test.ts` — exact `/Measure` and `/LGIDict` contracts, ambiguity, malformed values, CRS, crop, and rotation.
- `web/src/userMaps/parsers/geoPdfSource.ts` — PDF.js document/page lifecycle, canonical rasterization, typed errors, and dependency-injected test seams.
- `web/src/userMaps/parsers/geoPdfSource.test.ts` — page-1, 4,096-pixel, password, rasterization, and cleanup tests.
- `web/src/userMaps/parsers/geoPdfWorker.ts` — selected off-main-thread entry point and typed worker messages.
- `web/src/userMaps/parsers/parseGeoPdfAuto.ts` — worker-first wrapper with the approved fallback topology.
- `web/src/userMaps/parsers/parseGeoPdfAuto.test.ts` — transfer, termination, reply, and fallback tests.

### New fixture and verification files

- `web/src/test/fixtures/geopdf/README.md` — fixture provenance, licence, generation, hashes, and expected status.
- `web/src/test/fixtures/geopdf/manifest.json` — machine-readable fixture ledger.
- `web/scripts/generateGeoPdfFixtures.mjs` — reproducible GDAL/pdf-lib fixture generation from tracked inputs.
- `web/src/test/fixtures/geopdf/test_iso32000.pdf` — tiny GDAL ISO `/Measure` fixture.
- `web/src/test/fixtures/geopdf/test_ogc_bp.pdf` — tiny GDAL `/LGIDict` fixture.
- `web/src/test/fixtures/geopdf/ns-utm20-iso.pdf` — ISO GeoPDF generated from the repository's Nova Scotia UTM 20N raster.
- `web/src/test/fixtures/geopdf/ns-utm20-lgidict.pdf` — OGC-BP GeoPDF generated from the same raster.
- `web/src/test/fixtures/geopdf/adobe_style_geospatial.pdf` — two-viewport ambiguity fixture.
- `web/src/test/fixtures/geopdf/byte_and_rgbsmall_2pages.pdf` — page-count fixture.
- `web/src/test/fixtures/geopdf/byte_enc.pdf` — password fixture.
- `web/src/test/fixtures/geopdf/plain.pdf` — readable page without registration.
- `web/src/test/fixtures/geopdf/rotated-cropped.pdf` — crop/rotation transform fixture.
- `web/src/test/fixtures/geopdf/registration-page-2.pdf` — registration after page 1 only.
- `web/src/test/fixtures/geopdf/unsupported-crs.pdf` — known structure with an unsupported CRS.
- `web/src/test/fixtures/geopdf/malformed-measure.pdf` — known structure with mismatched point arrays.
- `web/src/test/fixtures/geopdf/corrupt.pdf` — deterministically truncated readable-input rejection fixture.
- `web/scripts/probeGeoPdf.mjs` — external-corpus key inventory and GDAL comparison receipt.
- `web/scripts/preparePdfAssets.mjs` — deterministic local copy of PDF.js CMaps, fonts, ICC profiles, and WASM into `public/vendor/pdfjs`.
- `web/scripts/preparePdfAssets.test.mjs` — exact asset-set and cleanup test.
- `web/scripts/checkGeoPdfBundle.mjs` — Vite manifest assertion that PDF chunks are dynamic, not initial.
- `docs/research/2026-07-27-geopdf-compatibility.md` — spike evidence, supported matrix, worker topology, timing, and stop-rule result.
- `docs/research/2026-07-27-geopdf-external-corpus.json` — authoritative URLs, hashes, rights, and oracle results for untracked real files.
- `docs/real-world-testing/2026-07-27-web-geopdf-import-test-plan.md` — desktop/mobile rendered acceptance checklist and receipts.

### Existing files modified

- `web/package.json`, `web/package-lock.json` — exact dependencies and verification scripts.
- `.gitignore` — exact ignore for generated local PDF.js support assets.
- `web/vite.config.ts` — emit a production manifest for lazy-chunk verification.
- `web/src/userMaps/types.ts` — PDF registration/result/provenance types.
- `web/src/userMaps/errors.ts`, `errors.test.ts` — password-protected error.
- `web/src/userMaps/transform/projection.ts`, `projection.test.ts` — projected-coordinate-to-WGS84 helper reused by `/LGIDict`.
- `web/src/userMaps/useUserMaps.ts`, `useUserMaps.test.ts` — PDF parser branch, records, outcomes, persistence, and adjustment provenance.
- `web/src/userMaps/components/UserMapRows.tsx`, `UserMapRows.test.tsx` — PDF page/registration status and import hint.
- `README.md`, `ARCHITECTURE.md`, `plan.md` — shipped behavior only after the implementation and gates pass.

---

### Task 1: Run the compatibility spike and freeze the support matrix

**Files:**
- Modify: `web/package.json`
- Modify: `web/package-lock.json`
- Create: `web/scripts/probeGeoPdf.mjs`
- Create: `web/scripts/generateGeoPdfFixtures.mjs`
- Create: `web/src/test/fixtures/geopdf/README.md`
- Create: `web/src/test/fixtures/geopdf/manifest.json`
- Create: `web/src/test/fixtures/geopdf/test_iso32000.pdf`
- Create: `web/src/test/fixtures/geopdf/test_ogc_bp.pdf`
- Create: `web/src/test/fixtures/geopdf/adobe_style_geospatial.pdf`
- Create: `web/src/test/fixtures/geopdf/byte_and_rgbsmall_2pages.pdf`
- Create: `web/src/test/fixtures/geopdf/byte_enc.pdf`
- Create: `web/src/test/fixtures/geopdf/ns-utm20-iso.pdf`
- Create: `web/src/test/fixtures/geopdf/ns-utm20-lgidict.pdf`
- Create: `web/src/test/fixtures/geopdf/plain.pdf`
- Create: `web/src/test/fixtures/geopdf/rotated-cropped.pdf`
- Create: `web/src/test/fixtures/geopdf/registration-page-2.pdf`
- Create: `web/src/test/fixtures/geopdf/unsupported-crs.pdf`
- Create: `web/src/test/fixtures/geopdf/malformed-measure.pdf`
- Create: `web/src/test/fixtures/geopdf/corrupt.pdf`
- Create: `docs/research/2026-07-27-geopdf-compatibility.md`
- Create: `docs/research/2026-07-27-geopdf-external-corpus.json`

**Interfaces:**
- Consumes: Official USGS current and pre-June-2017 GeoPDFs; GDAL `gdalinfo`; pdf-lib public `PDFDocument`, `PDFName`, `PDFArray`, and `PDFDict` APIs.
- Produces: A committed support matrix whose `measure` and `lgidict` entries are each `"automatic"` or `"manual-unsupported"`; an accepted worker topology; exact dependency pins; reproducible tracked fixtures; an external-corpus provenance ledger; and frozen oracle coordinates.

- [ ] **Step 1: Establish the clean baseline**

Run:

```bash
git status --short --branch
cd web
npm ci
npm test
npm run lint
npm run build
node --version
gdalinfo --version
```

Expected: clean task branch; 917 tests passing with one existing skip or a
strictly explained higher count; lint/build exit 0; Node satisfies PDF.js's
`>=22.13.0 || >=24` engine.

- [ ] **Step 2: Pin the candidate dependencies**

Run:

```bash
cd web
npm install --save-exact pdfjs-dist@6.1.200 pdf-lib@1.17.1
npm ls pdfjs-dist pdf-lib
npm audit --omit=dev
```

Expected: exactly `pdfjs-dist@6.1.200` and `pdf-lib@1.17.1`; audit reports zero
production vulnerabilities. If either package fails registry, engine, licence,
or build compatibility, record the exact evidence and stop rather than choosing
an unreviewed substitute.

- [ ] **Step 3: Download and hash the small GDAL fixtures**

Run:

```bash
cd web
mkdir -p src/test/fixtures/geopdf
curl -L --fail --silent --show-error \
  https://raw.githubusercontent.com/OSGeo/gdal/master/autotest/gdrivers/data/pdf/test_iso32000.pdf \
  -o src/test/fixtures/geopdf/test_iso32000.pdf
curl -L --fail --silent --show-error \
  https://raw.githubusercontent.com/OSGeo/gdal/master/autotest/gdrivers/data/pdf/test_ogc_bp.pdf \
  -o src/test/fixtures/geopdf/test_ogc_bp.pdf
curl -L --fail --silent --show-error \
  https://raw.githubusercontent.com/OSGeo/gdal/master/autotest/gdrivers/data/pdf/adobe_style_geospatial.pdf \
  -o src/test/fixtures/geopdf/adobe_style_geospatial.pdf
curl -L --fail --silent --show-error \
  https://raw.githubusercontent.com/OSGeo/gdal/master/autotest/gdrivers/data/pdf/byte_and_rgbsmall_2pages.pdf \
  -o src/test/fixtures/geopdf/byte_and_rgbsmall_2pages.pdf
curl -L --fail --silent --show-error \
  https://raw.githubusercontent.com/OSGeo/gdal/master/autotest/gdrivers/data/pdf/byte_enc.pdf \
  -o src/test/fixtures/geopdf/byte_enc.pdf
shasum -a 256 src/test/fixtures/geopdf/*.pdf
```

Expected hashes:

```text
adobe_style_geospatial.pdf      8492c975c7dd68977566d95b0c1f0db2a24d464bf2105612e20799b04485766b
byte_and_rgbsmall_2pages.pdf    e483d8eec5820e0a828d41d804978e4090d46c806615fa961de0ec205777abb9
byte_enc.pdf                    8a621f1857597997c86079c8738bfac2e077bd15d8d8ce4959e8148971cc4678
test_iso32000.pdf               c57b35f6820dcb7d08ae273ed39e935f91af1c9594f99bfb3b3da05ed0197da1
test_ogc_bp.pdf                 ec2a34f853a4d5bf86ccf6a7170439b5c89e9a6a674db965ba7d762cbea3a93b
```

Hash drift is a stop condition until the upstream change is inspected.

- [ ] **Step 3a: Generate the repository-owned fixtures from tracked inputs**

Create `web/scripts/generateGeoPdfFixtures.mjs`. It must resolve paths relative
to the script, refuse to write outside `web/src/test/fixtures/geopdf`, and run
these exact GDAL conversions from the tracked 8×6 Nova Scotia UTM 20N raster:

```js
const source = fileURLToPath(
  new URL("../src/test/fixtures/utm20-8x6.tif", import.meta.url),
);
const conversions = [
  ["ns-utm20-iso.pdf", "ISO32000"],
  ["ns-utm20-lgidict.pdf", "OGC_BP"],
];

for (const [file, encoding] of conversions) {
  execFileSync("gdal_translate", [
    "-of", "PDF",
    "-co", `GEO_ENCODING=${encoding}`,
    "-co", "DPI=72",
    source,
    join(outputDirectory, file),
  ], { stdio: "inherit" });
}
```

The same script uses pdf-lib with fixed creation/modification dates, creator,
producer, page sizes, and `useObjectStreams:false` to write:

```text
plain.pdf
rotated-cropped.pdf
registration-page-2.pdf
unsupported-crs.pdf
malformed-measure.pdf
```

Use one shared `/Measure` builder. `rotated-cropped.pdf` has a page crop box
`[50,40,250,140]`, a 90-degree rotation, and one valid registration over that
box. `registration-page-2.pdf` has two pages and attaches registration only to
the second. `unsupported-crs.pdf` declares EPSG `999999`.
`malformed-measure.pdf` has six `LPTS` scalars and four `GPTS` scalars. Finally,
write `corrupt.pdf` as the first half of `plain.pdf`; never mutate a source
fixture in place.

The script prints a sorted JSON array of `{ file, sha256, byteSize }` for every
generated file. Add:

```json
"generate:geopdf-fixtures": "node scripts/generateGeoPdfFixtures.mjs"
```

Run:

```bash
cd web
npm run generate:geopdf-fixtures
gdalinfo -json src/test/fixtures/geopdf/ns-utm20-iso.pdf
gdalinfo -json src/test/fixtures/geopdf/ns-utm20-lgidict.pdf
```

Expected: both generated GeoPDFs report the same CRS, bounds, and pixel-to-map
mapping as `utm20-8x6.tif`. Record the generator's hashes and the exact GDAL
version in the fixture ledger. CI consumes the committed outputs and never runs
GDAL or downloads fixtures.

- [ ] **Step 4: Write the machine-readable fixture manifest**

Create `web/src/test/fixtures/geopdf/manifest.json` with this exact schema and
the five entries above:

```json
{
  "schemaVersion": 1,
  "sourceRepository": "https://github.com/OSGeo/gdal",
  "sourceLicence": "MIT",
  "fixtures": [
    {
      "file": "test_iso32000.pdf",
      "sha256": "c57b35f6820dcb7d08ae273ed39e935f91af1c9594f99bfb3b3da05ed0197da1",
      "pageCount": 1,
      "registration": "measure",
      "gdalGeoTransform": [2, 0.05, 0, 49, 0, -0.05]
    },
    {
      "file": "test_ogc_bp.pdf",
      "sha256": "ec2a34f853a4d5bf86ccf6a7170439b5c89e9a6a674db965ba7d762cbea3a93b",
      "pageCount": 1,
      "registration": "lgidict",
      "gdalGeoTransform": [2, 0.05, 0, 49, 0, -0.05]
    },
    {
      "file": "adobe_style_geospatial.pdf",
      "sha256": "8492c975c7dd68977566d95b0c1f0db2a24d464bf2105612e20799b04485766b",
      "pageCount": 1,
      "registration": "measure-multiple",
      "expected": "manual-ambiguous"
    },
    {
      "file": "byte_and_rgbsmall_2pages.pdf",
      "sha256": "e483d8eec5820e0a828d41d804978e4090d46c806615fa961de0ec205777abb9",
      "pageCount": 2,
      "registration": "page-1-readable",
      "expected": "page-1-only"
    },
    {
      "file": "byte_enc.pdf",
      "sha256": "8a621f1857597997c86079c8738bfac2e077bd15d8d8ce4959e8148971cc4678",
      "pageCount": null,
      "registration": "encrypted",
      "expected": "password-protected"
    }
  ]
}
```

After Step 8, add `"expected": "automatic"` or
`"expected": "manual-unsupported"` to each of the first two entries. Add a
manifest validation assertion to the fixture test so Task 1 cannot be committed
while either final support result is absent.

Append one manifest entry for every generated file. Each generated entry
records the printed SHA-256 and byte size, `sourceInput`, `generator`,
`gdalVersion`, `registration`, and exact expected status. Create
`web/src/test/fixtures/geopdf/README.md` with:

```markdown
# GeoPDF fixtures

## Provenance and licence
## Generation and exact tool versions
## Immutable upstream hashes
## Generated-file hashes
## Expected parser and raster outcomes
## Regeneration is a reviewed operation
```

The README must say that a regeneration diff is evidence to review, not an
automatic fixture refresh.

- [ ] **Step 5: Write the pdf-lib/GDAL probe**

Create `web/scripts/probeGeoPdf.mjs`. It must:

```js
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFHexString,
  PDFName,
  PDFNumber,
  PDFString,
} from "pdf-lib";

function scalar(value) {
  if (value instanceof PDFNumber) return value.asNumber();
  if (value instanceof PDFString || value instanceof PDFHexString) {
    return value.decodeText();
  }
  if (value instanceof PDFName) return `/${value.decodeText()}`;
  return null;
}

function describe(value, depth = 0) {
  if (depth > 5 || value == null) return null;
  if (value instanceof PDFArray) {
    return Array.from({ length: value.size() }, (_, index) =>
      describe(value.lookup(index), depth + 1),
    );
  }
  if (value instanceof PDFDict) {
    return Object.fromEntries(
      value.keys().map((key) => [
        key.decodeText(),
        describe(value.lookup(key), depth + 1),
      ]),
    );
  }
  return scalar(value);
}

async function probe(path) {
  const bytes = await readFile(path);
  const pdf = await PDFDocument.load(bytes, { updateMetadata: false });
  const page = pdf.getPage(0);
  const gdal = JSON.parse(
    execFileSync("gdalinfo", ["-json", path], { encoding: "utf8" }),
  );
  return {
    file: basename(path),
    sha256: createHash("sha256").update(bytes).digest("hex"),
    pageCount: pdf.getPageCount(),
    pageKeys: page.node.keys().map((key) => key.decodeText()).sort(),
    vp: describe(page.node.lookup(PDFName.of("VP"))),
    lgiDict: describe(page.node.lookup(PDFName.of("LGIDict"))),
    gdal: {
      size: gdal.size,
      geoTransform: gdal.geoTransform ?? null,
      gcps: gdal.gcps ?? null,
      coordinateSystem: gdal.coordinateSystem?.wkt ?? null,
    },
  };
}

const paths = process.argv.slice(2);
if (paths.length === 0) {
  throw new Error("usage: node scripts/probeGeoPdf.mjs <file.pdf> [...]");
}
console.log(JSON.stringify(await Promise.all(paths.map(probe)), null, 2));
```

Add:

```json
"probe:geopdf": "node scripts/probeGeoPdf.mjs"
```

to `web/package.json`.

- [ ] **Step 6: Probe independent real files**

Use official USGS TopoView or The National Map to select:

- two current/open GeoPDFs from different publication runs;
- two pre-June-2017/TerraGo GeoPDFs from different publication runs; and
- one real file with multiple map frames or insets.

Keep the PDFs outside Git. For each, record authoritative URL, retrieval date,
SHA-256, byte size, publication/producer, page count, dictionary family,
`gdalinfo -json`, probe output, licence/public-domain basis, and whether its
coordinates match GDAL.

Run:

```bash
cd web
npm run probe:geopdf -- /absolute/path/current-1.pdf /absolute/path/current-2.pdf
npm run probe:geopdf -- /absolute/path/legacy-1.pdf /absolute/path/legacy-2.pdf
```

Expected: pdf-lib resolves the relevant objects without PDF.js internals.

Create `docs/research/2026-07-27-geopdf-external-corpus.json` after probing. It
contains no PDF bytes and uses this schema for every untracked real file:

```ts
type ExternalGeoPdfReceipt = {
  authoritativeUrl: string;
  retrievedAt: string;
  sha256: string;
  byteSize: number;
  producer: string;
  publicationDate: string | null;
  pageCount: number;
  registrationFamily: "measure" | "lgidict" | "multiple";
  gdalVersion: string;
  gdalResult: {
    crs: string;
    geoTransform: number[] | null;
    gcps: Array<{ pixel: number; line: number; x: number; y: number }>;
  };
  expected: "automatic" | "manual-ambiguous" | "manual-unsupported";
  rightsNote: string;
};
```

Validate that each family proposed for automatic support has two receipts from
independent publication runs.

- [ ] **Step 7: Test worker topology and raster responsiveness**

Build two disposable spike paths in the browser:

1. unified feature worker with PDF.js + pdf-lib + `OffscreenCanvas`;
2. pdf-lib feature worker returning the transferred buffer, then PDF.js's
   supported worker-backed display path and a main-thread canvas.

For small, 10–20 MB, and large real files record:

- whether page 1 renders;
- 4,096-pixel output dimensions;
- password callback behavior;
- total duration;
- longest import-caused main-thread task;
- observed peak/retained memory; and
- Chrome, Firefox, Safari, and mobile-Safari result.

Accept topology 1 if it passes all browsers. Otherwise accept topology 2 only
when no import-caused main-thread task exceeds 200 ms on the reference desktop
browser. Delete disposable spike UI before committing.

- [ ] **Step 8: Write the compatibility report and apply the stop rule**

Create `docs/research/2026-07-27-geopdf-compatibility.md` with:

```markdown
# GeoPDF Compatibility Spike

## Environment
## Dependency API verification
## Corpus and hashes
## `/Measure` results
## `/LGIDict` results
## GDAL coordinate comparison
## Worker topology and responsiveness
## Bundle experiment
## Supported matrix
## Stop-rule decision
```

The supported matrix has one row per exact producer/structure. Mark each family
automatic only if two independent real files agree with GDAL and the tiny
fixture. Freeze the maximum observed disagreement and the accepted threshold in
both canonical-raster pixels and ground metres before implementing the
extractor; the accepted threshold must be tighter than a visibly meaningful
placement error and cannot be raised after a failed fixture. If neither family
qualifies, stop here and do not execute Tasks 2–9.

- [ ] **Step 9: Verify and commit the spike**

Run:

```bash
cd web
npm test
npm run lint
npm run build
git diff --check
git status --short
```

Expected: all gates pass; only Task 1 files are changed.

Commit:

```bash
git add web/package.json web/package-lock.json web/scripts/probeGeoPdf.mjs \
  web/scripts/generateGeoPdfFixtures.mjs web/src/test/fixtures/geopdf \
  docs/research/2026-07-27-geopdf-compatibility.md \
  docs/research/2026-07-27-geopdf-external-corpus.json
git commit -m "research(web): prove GeoPDF compatibility matrix"
```

---

### Task 2: Add PDF data contracts, password error, and projection helper

**Files:**
- Modify: `web/src/userMaps/types.ts:1-35`
- Modify: `web/src/userMaps/errors.ts:1-8`
- Modify: `web/src/userMaps/errors.test.ts`
- Modify: `web/src/userMaps/transform/projection.ts:67-143`
- Modify: `web/src/userMaps/transform/projection.test.ts`

**Interfaces:**
- Consumes: Existing `Gcp`, `GcpGeoref`, `PixelSize`, and proj4 converter cache.
- Produces: `PdfRegistrationFlavor`, `PdfManualReason`, `ParsedPdfRegistration`, `PdfImportMetadata`, `projectToLatLng(crs, x, y)`, and `"password-protected"`.

- [ ] **Step 1: Write failing type/runtime tests**

Add projection tests:

```ts
it("projects a UTM 20N coordinate to finite WGS84", () => {
  const point = projectToLatLng("EPSG:26920", 500000, 5000000);
  expect(point.lat).toBeCloseTo(45.153477, 5);
  expect(point.lng).toBeCloseTo(-63, 5);
});

it("rejects non-finite projected coordinates", () => {
  expect(() => projectToLatLng("EPSG:26920", Number.NaN, 5000000))
    .toThrowError(UserMapImportError);
});
```

Add an error round-trip:

```ts
it("keeps password-protected distinct from corrupt-file", () => {
  const error = new UserMapImportError(
    "password-protected",
    "Unlock this PDF and try again.",
  );
  expect(error.code).toBe("password-protected");
  expect(error.code).not.toBe("corrupt-file");
});
```

- [ ] **Step 2: Run the focused tests and confirm failure**

Run:

```bash
cd web
npx vitest run src/userMaps/errors.test.ts src/userMaps/transform/projection.test.ts
```

Expected: compile/test failure because the new code and helper do not exist.

- [ ] **Step 3: Add the exact contracts**

Add to `types.ts`:

```ts
export type PdfRegistrationFlavor = "measure" | "lgidict";

export type PdfManualReason =
  | "absent"
  | "unsupported"
  | "unsupported-crs"
  | "invalid"
  | "ambiguous";

export type ParsedPdfRegistration =
  | {
      status: "automatic";
      flavor: PdfRegistrationFlavor;
      gcps: Gcp[];
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
        status: "automatic";
        flavor: PdfRegistrationFlavor;
        adjusted: boolean;
      }
    | {
        status: "manual";
        reason: PdfManualReason;
        adjusted: boolean;
      };
};
```

Add `pdf?: PdfImportMetadata` to `UserMapRecord`. Add
`"password-protected"` to `UserMapImportErrorCode`.

- [ ] **Step 4: Extract the existing coordinate conversion**

In `projection.ts`, keep `converterFor` private and add:

```ts
export function projectToLatLng(
  crs: string,
  x: number,
  y: number,
): LatLngPoint {
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    throw new UserMapImportError(
      "invalid-georeferencing",
      "This file's georeferencing contains non-finite coordinates.",
    );
  }
  const [lng, lat] = converterFor(crs).forward([x, y]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    throw new UserMapImportError(
      "invalid-georeferencing",
      "This file's georeferencing produced coordinates outside the " +
        "coordinate system's valid area. Check the file's CRS and re-export it.",
    );
  }
  return { lat, lng };
}
```

Change `pixelToLatLng` to calculate `projX/projY` and return
`projectToLatLng(georef.crs, projX, projY)`. This preserves existing messages
and centralizes conversion without changing the GeoTIFF contract.

- [ ] **Step 5: Run focused and neighboring tests**

Run:

```bash
cd web
npx vitest run src/userMaps/errors.test.ts \
  src/userMaps/transform/projection.test.ts \
  src/userMaps/parsers/geoTiffSource.test.ts
```

Expected: pass.

- [ ] **Step 6: Commit**

```bash
git add web/src/userMaps/types.ts web/src/userMaps/errors.ts \
  web/src/userMaps/errors.test.ts web/src/userMaps/transform/projection.ts \
  web/src/userMaps/transform/projection.test.ts
git commit -m "feat(web): define GeoPDF import contracts"
```

---

### Task 3: Implement evidence-gated `/Measure` extraction

**Files:**
- Create: `web/src/userMaps/parsers/geoPdfMetadata.ts`
- Create: `web/src/userMaps/parsers/geoPdfMetadata.test.ts`
- Test: `web/src/test/fixtures/geopdf/test_iso32000.pdf`
- Test: `web/src/test/fixtures/geopdf/ns-utm20-iso.pdf`
- Test: `web/src/test/fixtures/geopdf/rotated-cropped.pdf`
- Test: `web/src/test/fixtures/geopdf/registration-page-2.pdf`
- Test: `web/src/test/fixtures/geopdf/unsupported-crs.pdf`
- Test: `web/src/test/fixtures/geopdf/malformed-measure.pdf`
- Test: `web/src/test/fixtures/geopdf/adobe_style_geospatial.pdf`

**Interfaces:**
- Consumes: pdf-lib public object classes, `ParsedPdfRegistration`,
  `PixelSize`, `solveAffineFromGcps`, and the Task 1 measure support decision.
- Produces:

```ts
export type PdfViewportGeometry = {
  width: number;
  height: number;
  transform: [number, number, number, number, number, number];
  viewBox: [number, number, number, number];
};

export function applyPdfViewport(
  transform: PdfViewportGeometry["transform"],
  x: number,
  y: number,
): { x: number; y: number };

export async function extractGeoPdfRegistration(
  bytes: Uint8Array,
  viewport: PdfViewportGeometry,
): Promise<ParsedPdfRegistration>;
```

- [ ] **Step 1: Write failing `/Measure` fixture tests**

Read fixture bytes with `readFileSync`. Assert:

```ts
it("extracts the ISO fixture as four WGS84 GCPs when measure is supported", async () => {
  const result = await extractGeoPdfRegistration(
    fixture("test_iso32000.pdf"),
    {
      width: 4096,
      height: 4096,
      transform: [204.8, 0, 0, -204.8, 0, 4096],
      viewBox: [0, 0, 20, 20],
    },
  );
  expect(result).toEqual({
    status: "automatic",
    flavor: "measure",
    gcps: [
      { id: "pdf-measure-0", pixel: { x: 0, y: 0 }, map: { lat: 49, lng: 2 } },
      { id: "pdf-measure-1", pixel: { x: 0, y: 4096 }, map: { lat: 48, lng: 2 } },
      { id: "pdf-measure-2", pixel: { x: 4096, y: 4096 }, map: { lat: 48, lng: 3 } },
      { id: "pdf-measure-3", pixel: { x: 4096, y: 0 }, map: { lat: 49, lng: 3 } },
    ],
  });
});

it("refuses to select between two GEO viewports", async () => {
  const result = await extractGeoPdfRegistration(
    fixture("adobe_style_geospatial.pdf"),
    adobeViewport,
  );
  expect(result).toEqual({ status: "manual", reason: "ambiguous" });
});
```

If Task 1 marks measure `manual-unsupported`, change only the first expected
result to `{ status: "manual", reason: "unsupported" }`; retain every
structural/malformed test below.

- [ ] **Step 2: Add malformed and discrimination tests**

Construct tiny in-memory PDFs with pdf-lib and inject page dictionaries. Cover:

- no `VP` and no `LGIDict` → `absent`;
- `VP` not an array → `invalid`;
- one non-`GEO` viewport → `unsupported`;
- `BBox` not four finite scalars → `invalid`;
- missing/mismatched/odd/short `LPTS` and `GPTS` → `invalid`;
- numeric strings accepted only with `/^[+-]?(?:\d+\.?\d*|\.\d+)(?:[Ee][+-]?\d+)?$/`;
- `NaN`, `Infinity`, trailing units, and blank strings rejected;
- unsupported or unproven `GCS` → `unsupported-crs`;
- three collinear or duplicate points → `invalid`; and
- rotation/crop uses the supplied viewport transform rather than a hand-coded
  y-axis flip.

Use the generated binary fixtures for the crop/rotation, page-2-only,
unsupported-CRS, and mismatched-array cases. Keep the in-memory PDFs for
single-key discrimination tests so failures identify the exact dictionary
rule.

- [ ] **Step 3: Run tests and confirm failure**

```bash
cd web
npx vitest run src/userMaps/parsers/geoPdfMetadata.test.ts
```

Expected: module-not-found failure.

- [ ] **Step 4: Implement strict scalar and array readers**

Use pdf-lib only:

```ts
function pdfScalar(value: PDFObject | undefined): number | null {
  if (value instanceof PDFNumber) return value.asNumber();
  if (value instanceof PDFString || value instanceof PDFHexString) {
    const text = value.decodeText().trim();
    if (!PDF_NUMBER_PATTERN.test(text)) return null;
    const number = Number(text);
    return Number.isFinite(number) ? number : null;
  }
  return null;
}

function numberArray(value: PDFObject | undefined): number[] | null {
  if (!(value instanceof PDFArray)) return null;
  const numbers = Array.from({ length: value.size() }, (_, index) =>
    pdfScalar(value.lookup(index)),
  );
  return numbers.every((number): number is number => number !== null)
    ? numbers
    : null;
}

export function applyPdfViewport(transform, x, y) {
  const [a, b, c, d, e, f] = transform;
  return { x: a * x + c * y + e, y: b * x + d * y + f };
}
```

- [ ] **Step 5: Implement `/Measure` candidate parsing**

For each page-1 `VP` element:

1. require `PDFDict`;
2. require `Measure` `PDFDict`;
3. require `/Subtype /GEO`;
4. require `BBox` length 4;
5. require equal `LPTS/GPTS` arrays with at least six values;
6. require the exact CRS/axis variant approved in Task 1;
7. interpolate each local point into page coordinates:

```ts
const pageX = bbox[0] + (bbox[2] - bbox[0]) * localX;
const pageY = bbox[1] + (bbox[3] - bbox[1]) * localY;
const pixel = applyPdfViewport(viewport.transform, pageX, pageY);
const map = { lat: gpts[index * 2], lng: gpts[index * 2 + 1] };
```

8. clamp only floating-point noise within `1e-7` px of an edge; reject real
   off-page pixels;
9. assign deterministic IDs `pdf-measure-0`, etc.; and
10. accept automatic only when `solveAffineFromGcps(gcps)` is non-null.

Count structurally geospatial viewports before validation. More than one is
`manual/ambiguous`, even if only one would solve.

- [ ] **Step 6: Run focused tests**

```bash
cd web
npx vitest run src/userMaps/parsers/geoPdfMetadata.test.ts \
  src/userMaps/transform/affine.test.ts
```

Expected: pass.

- [ ] **Step 7: Commit**

```bash
git add web/src/userMaps/parsers/geoPdfMetadata.ts \
  web/src/userMaps/parsers/geoPdfMetadata.test.ts
git commit -m "feat(web): extract proven Measure GeoPDF registration"
```

---

### Task 4: Implement evidence-gated `/LGIDict` extraction

**Files:**
- Modify: `web/src/userMaps/parsers/geoPdfMetadata.ts`
- Modify: `web/src/userMaps/parsers/geoPdfMetadata.test.ts`
- Test: `web/src/test/fixtures/geopdf/test_ogc_bp.pdf`
- Test: `web/src/test/fixtures/geopdf/ns-utm20-lgidict.pdf`

**Interfaces:**
- Consumes: `applyPdfViewport`, `projectToLatLng`, Task 1 LGIDict support
  decision, and the Task 3 `extractGeoPdfRegistration` entry point.
- Produces: `automatic/lgidict` GCPs for proven structures, or the exact manual
  reason without weakening `/Measure`.

- [ ] **Step 1: Write the failing fixture test**

When Task 1 proves the fixture's CTM/Projection structure:

```ts
it("extracts the proven LGIDict CTM as four affine GCPs", async () => {
  const result = await extractGeoPdfRegistration(
    fixture("test_ogc_bp.pdf"),
    {
      width: 4096,
      height: 4096,
      transform: [204.8, 0, 0, -204.8, 0, 4096],
      viewBox: [0, 0, 20, 20],
    },
  );
  expect(result).toEqual({
    status: "automatic",
    flavor: "lgidict",
    gcps: [
      { id: "pdf-lgidict-0", pixel: { x: 0, y: 4096 }, map: { lat: 48, lng: 2 } },
      { id: "pdf-lgidict-1", pixel: { x: 4096, y: 4096 }, map: { lat: 48, lng: 3 } },
      { id: "pdf-lgidict-2", pixel: { x: 4096, y: 0 }, map: { lat: 49, lng: 3 } },
      { id: "pdf-lgidict-3", pixel: { x: 0, y: 0 }, map: { lat: 49, lng: 2 } },
    ],
  });
});
```

If Task 1 does not prove `/LGIDict`, assert
`{ status: "manual", reason: "unsupported" }` instead and do not add automatic
CTM/Registration code.

- [ ] **Step 2: Add strict `/LGIDict` tests**

Cover:

- dictionary and single-element-array container;
- array with more than one geospatial dictionary → `ambiguous`;
- `/Type` other than `/LGIDict` → `unsupported`;
- version other than a proven `2`/`2.1` representation → `unsupported`;
- CTM length other than six → `invalid`;
- Registration element not `[userX,userY,groundX,groundY]` → `invalid`;
- fewer than three Registration points without CTM → `invalid`;
- both CTM and Registration present without a proven reconciliation rule →
  `unsupported`;
- supported geographic WGS84 projection → automatic when the family is proven;
- unknown datum/projection/WKT → `unsupported-crs`; and
- valid projected coordinates use `projectToLatLng` before becoming GCPs.

- [ ] **Step 3: Run and confirm failure**

```bash
cd web
npx vitest run src/userMaps/parsers/geoPdfMetadata.test.ts
```

Expected: the new LGIDict expectations fail.

- [ ] **Step 4: Implement the proven CTM path**

For a six-value `[a,b,c,d,e,f]` CTM, generate page-space corners from
`viewport.viewBox` in this order:

```ts
const [xMin, yMin, xMax, yMax] = viewport.viewBox;
const pageCorners = [
  [xMin, yMin],
  [xMax, yMin],
  [xMax, yMax],
  [xMin, yMax],
] as const;
```

Then:

```ts
function applyCtm(ctm: number[], x: number, y: number) {
  const [a, b, c, d, e, f] = ctm;
  return { x: a * x + c * y + e, y: b * x + d * y + f };
}
```

Transform page points to canonical pixels with `applyPdfViewport`; transform
ground points to WGS84 with `projectToLatLng`; assign deterministic
`pdf-lgidict-N` IDs; and pass the same affine conditioning gate as `/Measure`.

- [ ] **Step 5: Implement the proven Registration path**

For every `[userX,userY,groundX,groundY]` tuple:

```ts
const pixel = applyPdfViewport(viewport.transform, userX, userY);
const map = projectToLatLng(crs, groundX, groundY);
```

Do not use `Neatline` as a cutline or choose among array candidates.

- [ ] **Step 6: Run metadata and projection tests**

```bash
cd web
npx vitest run src/userMaps/parsers/geoPdfMetadata.test.ts \
  src/userMaps/transform/projection.test.ts
```

Expected: pass for the Task 1 support matrix; unsupported families remain
explicitly manual.

- [ ] **Step 7: Commit**

```bash
git add web/src/userMaps/parsers/geoPdfMetadata.ts \
  web/src/userMaps/parsers/geoPdfMetadata.test.ts
git commit -m "feat(web): extract proven LGIDict registration"
```

---

### Task 5: Rasterize page 1 and implement the worker lifecycle

**Files:**
- Create: `web/scripts/preparePdfAssets.mjs`
- Create: `web/scripts/preparePdfAssets.test.mjs`
- Create: `web/src/userMaps/parsers/geoPdfSource.ts`
- Create: `web/src/userMaps/parsers/geoPdfSource.test.ts`
- Create: `web/src/userMaps/parsers/geoPdfWorker.ts`
- Create: `web/src/userMaps/parsers/parseGeoPdfAuto.ts`
- Create: `web/src/userMaps/parsers/parseGeoPdfAuto.test.ts`
- Test: `web/src/test/fixtures/geopdf/ns-utm20-iso.pdf`
- Test: `web/src/test/fixtures/geopdf/plain.pdf`
- Test: `web/src/test/fixtures/geopdf/registration-page-2.pdf`
- Test: `web/src/test/fixtures/geopdf/byte_enc.pdf`
- Test: `web/src/test/fixtures/geopdf/corrupt.pdf`
- Modify: `.gitignore`
- Modify: `web/package.json`

**Interfaces:**
- Consumes: `extractGeoPdfRegistration`, PDF.js public `getDocument`,
  `PDFDocumentLoadingTask`, `PDFPageProxy`, `PasswordResponses`, and Task 1's
  selected topology.
- Produces:

```ts
export type ParsedGeoPdf = {
  pixelSize: PixelSize;
  previewSize: PixelSize;
  preview: Blob;
  pageCount: number;
  registration: ParsedPdfRegistration;
};

export function parseGeoPdf(
  buffer: ArrayBuffer,
  options?: GeoPdfParseOptions,
): Promise<ParsedGeoPdf>;

export function parseGeoPdfAuto(buffer: ArrayBuffer): Promise<ParsedGeoPdf>;
```

- [ ] **Step 1: Write the asset-preparation test**

The test creates temporary fake `pdfjs-dist/{cmaps,standard_fonts,iccs,wasm}`
directories, runs the exported copy function, and asserts:

- all four directories exist at the destination;
- a stale destination file is removed;
- files are copied byte-for-byte; and
- no source outside those four directories is copied.

Run:

```bash
cd web
node --test scripts/preparePdfAssets.test.mjs
```

Expected: module-not-found failure.

- [ ] **Step 2: Implement deterministic asset preparation**

`preparePdfAssets.mjs` exports `preparePdfAssets({ packageRoot, publicRoot })`.
It removes only the exact `public/vendor/pdfjs` target, recreates it, and copies:

```js
const ASSET_DIRS = ["cmaps", "standard_fonts", "iccs", "wasm"];
```

The CLI invocation resolves `node_modules/pdfjs-dist` and `public` from `web/`.
Add:

```json
"prepare:pdf-assets": "node scripts/preparePdfAssets.mjs",
"predev": "npm run prepare:pdf-assets",
"prebuild": "npm run prepare:pdf-assets"
```

Do not commit the copied `web/public/vendor/pdfjs` tree. Add this exact entry to
the repository-root `.gitignore`:

```gitignore
web/public/vendor/pdfjs/
```

- [ ] **Step 3: Write failing source lifecycle tests**

Inject a fake PDF.js loader, page, canvas, metadata extractor, and PNG encoder.
Assert:

- `getPage(1)` is the only page request;
- page count is returned;
- scale makes the longest edge 4,096;
- the first paint is opaque white;
- page render completes before PNG encoding;
- `loadingTask.destroy()` and `document.destroy()` run on success and failure;
- a password callback rejects with `"password-protected"`;
- unreadable page/render/PNG paths reject as `"corrupt-file"`; and
- metadata manual outcomes do not reject a rendered page.

Add real-binary regressions proving the generated Nova Scotia fixture renders
at the canonical dimensions, `plain.pdf` renders with a manual/absent result,
`registration-page-2.pdf` requests only page 1 and returns manual/absent while
retaining `pageCount:2`, `byte_enc.pdf` maps to password-protected, and
`corrupt.pdf` maps to corrupt-file.

- [ ] **Step 4: Run and confirm failure**

```bash
cd web
npx vitest run src/userMaps/parsers/geoPdfSource.test.ts
```

Expected: module-not-found failure.

- [ ] **Step 5: Implement page-1 rasterization**

`parseGeoPdf` must:

```ts
type PdfAssetDirectory = "cmaps/" | "standard_fonts/" | "iccs/" | "wasm/";

function assetUrl(directory: PdfAssetDirectory): string {
  return new URL(`../vendor/pdfjs/${directory}`, import.meta.url).href;
}

const loadingTask = getDocument({
  data: new Uint8Array(buffer),
  cMapUrl: assetUrl("cmaps/"),
  cMapPacked: true,
  standardFontDataUrl: assetUrl("standard_fonts/"),
  iccUrl: assetUrl("iccs/"),
  wasmUrl: assetUrl("wasm/"),
  enableXfa: false,
  stopAtErrors: true,
  useWorkerFetch: false,
  maxImageSize: 50_000_000,
  canvasMaxAreaInBytes: 64 * 1024 * 1024,
});
```

Set `loadingTask.onPassword = (_update, reason) => rejectPassword(reason)`.
After `document = await loadingTask.promise`:

```ts
const page = await document.getPage(1);
const base = page.getViewport({ scale: 1 });
const scale = 4096 / Math.max(base.width, base.height);
const viewport = page.getViewport({ scale });
const pixelSize = {
  width: Math.max(1, Math.round(viewport.width)),
  height: Math.max(1, Math.round(viewport.height)),
};
```

Fill white, render, encode PNG, and call `extractGeoPdfRegistration` with:

```ts
const geometry: PdfViewportGeometry = {
  width: pixelSize.width,
  height: pixelSize.height,
  transform: [...viewport.transform] as PdfViewportGeometry["transform"],
  viewBox: [...viewport.viewBox] as PdfViewportGeometry["viewBox"],
};
```

Pass `bytesForMetadata` and `geometry`. Follow the Task 1 topology to avoid
retaining a second buffer. Always destroy the page/document/loading task in
`finally`.

- [ ] **Step 6: Write failing worker-wrapper tests**

Mock `Worker` and `OffscreenCanvas`. Assert:

- the buffer is posted with `[buffer]`;
- success resolves the exact parsed value;
- typed worker error reconstructs `UserMapImportError`;
- `onerror` becomes corrupt-file;
- worker terminates after every terminal event; and
- the Task 1-approved fallback is called only when required capabilities are
  unavailable.

- [ ] **Step 7: Implement `geoPdfWorker` and `parseGeoPdfAuto`**

Use a reply union:

```ts
export type GeoPdfWorkerReply =
  | { ok: true; parsed: ParsedGeoPdf }
  | {
      ok: false;
      code: UserMapImportError["code"];
      userMessage: string;
    };
```

Mirror `parseInWorker.ts`'s terminate-on-message/error behavior. Keep worker
imports static inside the worker chunk; `useUserMaps` must dynamically import
`parseGeoPdfAuto` only after sniffing `pdf`.

- [ ] **Step 8: Run focused tests and build**

```bash
cd web
node --test scripts/preparePdfAssets.test.mjs
npx vitest run src/userMaps/parsers/geoPdfSource.test.ts \
  src/userMaps/parsers/parseGeoPdfAuto.test.ts
npm run build
```

Expected: pass; build emits separate PDF/worker chunks and local PDF assets.

- [ ] **Step 9: Commit**

```bash
git add web/package.json web/package-lock.json web/scripts/preparePdfAssets.mjs \
  web/scripts/preparePdfAssets.test.mjs web/src/userMaps/parsers/geoPdfSource.ts \
  web/src/userMaps/parsers/geoPdfSource.test.ts \
  web/src/userMaps/parsers/geoPdfWorker.ts \
  web/src/userMaps/parsers/parseGeoPdfAuto.ts \
  web/src/userMaps/parsers/parseGeoPdfAuto.test.ts .gitignore
git commit -m "feat(web): rasterize GeoPDF page one off main thread"
```

---

### Task 6: Integrate PDF import, persistence, fallback, and adjustment provenance

**Files:**
- Modify: `web/src/userMaps/useUserMaps.ts:9-39,175-394,457-513`
- Modify: `web/src/userMaps/useUserMaps.test.ts`
- Modify: `web/src/userMaps/store/userMapStore.test.ts`

**Interfaces:**
- Consumes: `parseGeoPdfAuto`, `ParsedGeoPdf`, `PdfImportMetadata`, existing
  store, `needsGeoreferencing`, and `meshForRecord`.
- Produces: PDF `UserMapRecord`s, truthful `ImportOutcome.note`, automatic or
  manual editor entry, and persistent `adjusted` state.

- [ ] **Step 1: Add a fake PDF parser and PDF file helper**

In `useUserMaps.test.ts`:

```ts
function pdfFile(name = "map.pdf"): File {
  return new File(
    [new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d])],
    name,
    { type: "application/pdf" },
  );
}

function testParsePdf(overrides: Partial<ParsedGeoPdf> = {}) {
  return async (): Promise<ParsedGeoPdf> => ({
    pixelSize: { width: 4096, height: 3072 },
    previewSize: { width: 4096, height: 3072 },
    preview: new Blob(["pdf-preview"], { type: "image/png" }),
    pageCount: 1,
    registration: { status: "manual", reason: "absent" },
    ...overrides,
  });
}
```

Add `parsePdf: testParsePdf()` to the shared test options.

- [ ] **Step 2: Replace the old PDF rejection test with failing import tests**

Cover:

- automatic measure record is `source:"geopdf"`, drawable, and not opened in
  the editor;
- manual absent/unsupported/unsupported-crs/invalid/ambiguous records import
  successfully and the first opens in the editor;
- `pageCount > 1` note says only page 1 was imported;
- password error remains a failed outcome with no record;
- original PDF and preview are passed to `saveUserMap`;
- storage failure keeps the PDF session-only;
- reload preserves `pdf` metadata;
- automatic points begin `adjusted:false`;
- automatic records make `needsGeoreferencing(record)` false and
  `meshForRecord(record)` non-null;
- opening/closing without point change keeps false;
- adding/moving/deleting a point sets true and persists; and
- switching affine/TPS alone does not set adjusted.

- [ ] **Step 3: Run and confirm failure**

```bash
cd web
npx vitest run src/userMaps/useUserMaps.test.ts
```

Expected: old rejection behavior and missing `parsePdf` option fail.

- [ ] **Step 4: Add PDF parsing as a third explicit branch**

Extend `useUserMaps` options:

```ts
parsePdf?: (buffer: ArrayBuffer) => Promise<ParsedGeoPdf>;
```

Store it in `parsePdfRef`, defaulting to a lazy function:

```ts
async (buffer) => {
  const { parseGeoPdfAuto } = await import("./parsers/parseGeoPdfAuto");
  return parseGeoPdfAuto(buffer);
}
```

Remove `PDF_MESSAGE`. Replace the current image/TIFF binary branch with an
explicit three-way branch so no unsafe union cast decides PDF behavior.

For PDF:

```ts
const parsedPdf = await parsePdfRef.current(buffer);
const georef: GcpGeoref =
  parsedPdf.registration.status === "automatic"
    ? { kind: "gcp", method: "affine", gcps: parsedPdf.registration.gcps }
    : EMPTY_GCP_GEOREF;
const pdf: PdfImportMetadata =
  parsedPdf.registration.status === "automatic"
    ? {
        pageNumber: 1,
        pageCount: parsedPdf.pageCount,
        registration: {
          status: "automatic",
          flavor: parsedPdf.registration.flavor,
          adjusted: false,
        },
      }
    : {
        pageNumber: 1,
        pageCount: parsedPdf.pageCount,
        registration: {
          status: "manual",
          reason: parsedPdf.registration.reason,
          adjusted: false,
        },
      };
```

Build `record` with `source:"geopdf"` and `pdf`.

- [ ] **Step 5: Add deterministic PDF outcome copy**

Add a pure helper returning exact notes:

```ts
function pdfImportNote(pdf: PdfImportMetadata): string {
  const pages =
    pdf.pageCount > 1
      ? `Page 1 of ${pdf.pageCount} imported; later pages were not imported.`
      : "Page 1 imported.";
  const registration = pdf.registration;
  if (registration.status === "automatic") {
    return `${pages} Placed from embedded GeoPDF metadata.`;
  }
  const reason = {
    absent: "No supported geospatial registration was found.",
    unsupported: "This GeoPDF registration variant is not supported.",
    "unsupported-crs": "This GeoPDF uses an unsupported coordinate system.",
    invalid: "The embedded positioning could not be validated.",
    ambiguous:
      "Page 1 contains multiple geospatial map frames, so none was selected automatically.",
  }[registration.reason];
  return `${pages} ${reason} Add matching points to place it.`;
}
```

Storage/large-file notes must append rather than overwrite the PDF note.

- [ ] **Step 6: Mark only real point changes as adjusted**

Before creating `saved` in `saveGcps`, compare point values and IDs:

```ts
function sameGcps(left: Gcp[], right: Gcp[]): boolean {
  return left.length === right.length && left.every((point, index) => {
    const other = right[index];
    return point.id === other.id &&
      point.pixel.x === other.pixel.x &&
      point.pixel.y === other.pixel.y &&
      point.map.lat === other.map.lat &&
      point.map.lng === other.map.lng;
  });
}
```

If an existing PDF record's GCP values changed, copy its `pdf.registration`
with `adjusted:true`. Preserve object identity on a no-op save. Do not change
`adjusted` in `setGeorefMethod`.

- [ ] **Step 7: Add store round-trip proof**

Persist an automatic PDF record plus PDF/preview blobs, close the store, reopen
it against the same fake IndexedDB, and assert `pdf`, original PDF bytes, and
preview bytes survive exactly.

- [ ] **Step 8: Run integration tests**

```bash
cd web
npx vitest run src/userMaps/useUserMaps.test.ts \
  src/userMaps/store/userMapStore.test.ts \
  src/App.test.tsx
```

Expected: pass; existing GeoTIFF/image behavior remains unchanged.

- [ ] **Step 9: Commit**

```bash
git add web/src/userMaps/useUserMaps.ts web/src/userMaps/useUserMaps.test.ts \
  web/src/userMaps/store/userMapStore.test.ts
git commit -m "feat(web): import GeoPDF records with safe fallback"
```

---

### Task 7: Surface PDF page and registration provenance in the layer list

**Files:**
- Modify: `web/src/userMaps/components/UserMapRows.tsx:15-99`
- Modify: `web/src/userMaps/components/UserMapRows.test.tsx`
- Modify: `web/src/userMaps/components/ImportDialog.tsx:46-61`
- Modify: `web/src/userMaps/errors.test.ts`

**Interfaces:**
- Consumes: `record.source`, `record.pdf`, and existing
  `needsGeoreferencing(record)`.
- Produces: Compact visible provenance and exact accessible copy without new
  controls.

- [ ] **Step 1: Write failing row tests**

Create records for:

- automatic `/Measure`, unadjusted;
- automatic `/LGIDict`, adjusted;
- manual absent, still needing points;
- manual invalid, now solved by user points; and
- two-page PDF.

Assert exact secondary text:

```text
GeoPDF page 1 · Embedded Measure positioning
GeoPDF page 1 · Embedded LGIDict positioning · adjusted
GeoPDF page 1 · Needs georeferencing
GeoPDF page 1 · Positioned manually
GeoPDF page 1 of 2 · Embedded Measure positioning
```

Also assert automatic PDFs have **Adjust points**, manual drafts have
**Georeference**, and existing image/GeoTIFF text remains unchanged.

- [ ] **Step 2: Run and confirm failure**

```bash
cd web
npx vitest run src/userMaps/components/UserMapRows.test.tsx
```

Expected: current generic “Your file” text fails.

- [ ] **Step 3: Add a pure PDF status formatter**

Inside `UserMapRows.tsx` or a sibling pure helper if the component becomes
unwieldy:

```ts
function pdfStatus(record: UserMapRecord, needsWork: boolean): string {
  const pdf = record.pdf;
  if (!pdf) return "";
  const page =
    pdf.pageCount > 1 ? `GeoPDF page 1 of ${pdf.pageCount}` : "GeoPDF page 1";
  if (needsWork) return `${page} · Needs georeferencing`;
  const registration = pdf.registration;
  if (registration.status === "manual") {
    return `${page} · Positioned manually`;
  }
  const flavor = registration.flavor === "measure" ? "Measure" : "LGIDict";
  return `${page} · Embedded ${flavor} positioning${
    registration.adjusted ? " · adjusted" : ""
  }`;
}
```

Use the formatter only when `source === "geopdf"`; preserve existing text for
other sources.

- [ ] **Step 4: Update import affordance copy**

Change the empty summary from “Load your own GeoTIFF” to:

```text
Load GeoTIFF, PDF, PNG, or JPEG
```

Keep the existing local-privacy line and `.pdf` accept entry. Do not add a
modal or page selector.

- [ ] **Step 5: Run UI tests**

```bash
cd web
npx vitest run src/userMaps/components/UserMapRows.test.tsx \
  src/userMaps/components/ScanPane.realMount.test.tsx \
  src/App.test.tsx
```

Expected: pass.

- [ ] **Step 6: Commit**

```bash
git add web/src/userMaps/components/UserMapRows.tsx \
  web/src/userMaps/components/UserMapRows.test.tsx \
  web/src/userMaps/components/ImportDialog.tsx web/src/userMaps/errors.test.ts
git commit -m "feat(web): show GeoPDF import provenance"
```

---

### Task 8: Prove lazy loading, cleanup, and real-browser behavior

**Files:**
- Modify: `web/vite.config.ts`
- Modify: `web/package.json`
- Create: `web/scripts/checkGeoPdfBundle.mjs`
- Create: `docs/real-world-testing/2026-07-27-web-geopdf-import-test-plan.md`
- Modify: `web/src/userMaps/parsers/geoPdfSource.test.ts`
- Modify: `web/src/userMaps/parsers/parseGeoPdfAuto.test.ts`

**Interfaces:**
- Consumes: Vite production manifest, Task 1 corpus/report, completed parser
  lifecycle.
- Produces: Automated lazy-chunk gate and filled browser/device acceptance
  receipt.

- [ ] **Step 1: Emit and inspect the Vite manifest**

Set:

```ts
build: {
  manifest: true,
},
```

in `vite.config.ts`. Run `npm run build` and inspect
`dist/.vite/manifest.json`.

- [ ] **Step 2: Write the bundle checker**

`checkGeoPdfBundle.mjs` reads the manifest, finds the app entry and every entry
whose source or filename contains `geoPdf`, `pdf.worker`, or `pdf-lib`, then
asserts:

- the app entry does not statically import a PDF chunk;
- each PDF chunk is reachable through `dynamicImports` or a worker asset;
- PDF.js supporting assets exist under `dist/vendor/pdfjs`;
- no PDF chunk is absent from the build; and
- the script prints initial JS bytes and total lazy PDF bytes.

Add:

```json
"check:geopdf-bundle": "node scripts/checkGeoPdfBundle.mjs"
```

- [ ] **Step 3: Write failing cleanup regressions**

Add tests for:

- password callback before document resolution;
- render rejection after page creation;
- metadata extraction rejection after PNG creation;
- worker `onerror`;
- component unmount/removal after PDF import; and
- three sequential import/remove cycles.

Each asserts exact `destroy`, `terminate`, canvas release, and URL revocation
counts. Do not assert garbage collection from jsdom.

- [ ] **Step 4: Run automated lifecycle and bundle gates**

```bash
cd web
npx vitest run src/userMaps/parsers/geoPdfSource.test.ts \
  src/userMaps/parsers/parseGeoPdfAuto.test.ts \
  src/userMaps/useUserMaps.test.ts
npm run build
npm run check:geopdf-bundle
```

Expected: all pass; initial entry has no static PDF dependency.

- [ ] **Step 5: Write and execute the real-browser checklist**

Create the acceptance document with exact environment fields and these cases:

1. repository-generated Nova Scotia UTM 20N ISO fixture;
2. repository-generated Nova Scotia UTM 20N LGIDict fixture if supported;
3. ordinary PDF manual fallback;
4. multiple-frame ambiguity;
5. multipage page-1-only result;
6. password rejection;
7. normal 10–20 MB current/open USGS file;
8. normal 10–20 MB pre-2017 file;
9. large stress file;
10. three import/remove cycles.

For desktop Chrome, Firefox, Safari, and mobile Safari record:

- build SHA;
- browser/OS/device;
- source file SHA-256;
- outcome copy;
- rendered location;
- adjustment/reload persistence;
- longest main-thread task;
- observed peak/retained memory;
- cleanup/removal;
- console result; and
- PASS/FAIL.

Also record that the import progress label paints before parsing begins, map
input remains responsive during import, and the network log contains no
PDF-triggered remote requests. Do not invoke or expose document JavaScript,
actions, forms, annotation links, or attachments during the test.

Any failed automatic-placement case moves that exact variant to manual fallback;
do not loosen numeric tolerances.

- [ ] **Step 6: Commit verification machinery and receipts**

```bash
git add web/vite.config.ts web/package.json \
  web/scripts/checkGeoPdfBundle.mjs \
  web/src/userMaps/parsers/geoPdfSource.test.ts \
  web/src/userMaps/parsers/parseGeoPdfAuto.test.ts \
  docs/real-world-testing/2026-07-27-web-geopdf-import-test-plan.md
git commit -m "test(web): verify GeoPDF bundle and browser lifecycle"
```

---

### Task 9: Update documentation, run the final gates, and publish the feature PR

**Files:**
- Modify: `README.md`
- Modify: `ARCHITECTURE.md:490-565`
- Modify: `plan.md:92`

**Interfaces:**
- Consumes: Final supported matrix and completed browser receipt.
- Produces: Truthful repository documentation and a ready PR to `nightly`.

- [ ] **Step 1: Update README with only proven behavior**

Document:

- page 1 only;
- fixed 4,096-pixel raster;
- supported automatic registration families/variants from the spike;
- manual fallback for readable unsupported PDFs;
- **Adjust points** and provenance;
- local-only privacy; and
- no page selection/password/layer controls.

- [ ] **Step 2: Update architecture**

Add:

- PDF.js/pdf-lib boundary;
- dynamic chunks and local supporting assets;
- worker topology actually shipped;
- `/Measure` and `/LGIDict` support matrix;
- ambiguity/manual states;
- canonical PDF pixel space;
- optional PDF record provenance; and
- cleanup/memory boundary.

Do not leave the design's candidate topology in the architecture; document the
one proven by Task 1.

- [ ] **Step 3: Mark `plan.md` complete only after acceptance**

Change:

```markdown
- [ ] GeoPDF import (PR 4)
```

to:

```markdown
- [x] GeoPDF page-1 import with evidence-gated automatic registration and manual fallback (PR 4)
```

If browser/device acceptance is incomplete, leave it unchecked and name the
remaining gate instead.

- [ ] **Step 4: Run the complete final gate on the exact head**

```bash
cd web
npm ci
npm test
npm run lint
npm run build
npm run check:geopdf-bundle
cd ..
git diff --check
git status --short --branch
```

Expected:

- all tests pass with only intentional documented skips;
- lint/build/bundle check pass;
- no generated PDF.js assets are tracked;
- no corpus files outside the approved fixture manifest are tracked; and
- only coherent task changes remain.

- [ ] **Step 5: Commit documentation**

```bash
git add README.md ARCHITECTURE.md plan.md
git commit -m "docs(web): record GeoPDF import support"
```

- [ ] **Step 6: Review the complete diff against the approved spec**

Run:

```bash
git diff --stat origin/nightly...HEAD
git diff --name-status origin/nightly...HEAD
git log --oneline origin/nightly..HEAD
git status --short --branch
```

Check every design requirement has code/test evidence and no adjacent cleanup
entered the branch.

- [ ] **Step 7: Push and open a ready PR**

```bash
git push -u origin feature/web-geopdf-import
gh pr create \
  --base nightly \
  --head feature/web-geopdf-import \
  --title "feat(web): import GeoPDF maps locally" \
  --body-file /absolute/path/to/reviewed-pr-body.md
```

The PR body must separate:

- spike support matrix;
- automated gates;
- real-browser/device acceptance;
- known manual-fallback variants;
- privacy/dependency/bundle impact; and
- states not yet proven (merge, deployment, production acceptance).

- [ ] **Step 8: Wait for fresh hosted checks on the pushed head**

Confirm the required `Build gate + tests` check belongs to the current pushed
SHA. Do not claim merge or deployment. Keep the task worktree clean while the
PR is open.
