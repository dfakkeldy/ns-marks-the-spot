# A.F. Church County Map Layers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Register the four Cape Breton Island A.F. Church county maps (David Rumsey scans) as historical map layers in both the web companion and the iOS app, mirroring the existing Fletcher layer, without producing or committing any tile artifacts.

**Architecture:** Church layers are *catalogued but not rendered*. On the web they are added to `nativeLayerCatalog` with `licence: "rumsey-reference"`, which the existing `provinceLayerCatalog` filter already excludes from the map, and are displayed as disabled rows (the same treatment Fletcher gets). On iOS they are added to `LayerCatalog.all` with `sourceURL: nil`, and `AppContainer.makeLayer` returns `nil` for them, so they carry attribution and metadata without issuing any network requests. Tile production is a deliberate later step; the seam is a single field on each side.

**Tech Stack:** TypeScript + React + Vite + Vitest (web); Swift + Swift Testing + Xcode (iOS).

## Global Constraints

- **Attribution string (exact):** `David Rumsey Map Collection, David Rumsey Map Center, Stanford Libraries`
- **Licence URL (exact):** `https://www.davidrumsey.com/about/copyright-and-permissions`
- **Do not hardcode a Creative Commons version number in code.** Rumsey's page states CC BY-NC-SA 3.0; the brief said 4.0. The version nuance belongs in `docs/CHURCH_MAPS.md` only. This mirrors Fletcher's Swift attribution, which sets `licenseTitle: nil`.
- **No tile artifacts.** Do not create `Tiles/Church*`, do not download JP2/MrSID scans, do not add binaries. The repo has an open roadmap item to stop bundling tiles.
- **`nativeLayerCatalog[0]` must remain the Fletcher entry.** `web/src/App.tsx` reads it by index four times. Append Church entries at the **end** of the array.
- **The Fletcher row must remain the last `.layer-row` in the rail.** `web/src/App.test.tsx` asserts `layerNames.at(-1) === "Fletcher historical map"`, and `plan.md` records this as a shipped product decision. The Church group renders **before** it.
- **Xcode builds are memory-gated.** Every `xcodebuild` invocation must be prefixed with `"$HOME/.claude/bin/xcode-build-gate.sh" --wait &&`.
- **Conventional Commits** for every commit message.
- **Promotion ladder:** feature branch → PR into `nightly`. Never target `main`.

---

## File Structure

**Create:**
- `web/src/licensing/rumseyLicense.ts` — Rumsey attribution + licence URL constants (mirrors `provinceLicense.ts`).
- `web/src/licensing/rumseyLicense.test.ts` — pins those constants.
- `docs/CHURCH_MAPS.md` — reference doc: all eight Rumsey IDs, dates, scales, licensing, the Annapolis gap, deferred tile recipe.

**Modify:**
- `web/src/layers/layerCatalog.ts` — `ChurchCountyLayerId` + `RumseyReferenceLayerId` types, four catalog entries, `churchLayerCatalog` selector, exclusion refactor (lines 16 and 480).
- `web/src/layers/layerCatalog.test.ts` — extend the ordering test, add a Church describe block.
- `web/src/App.tsx` — Church `<details>` group rendered immediately before the Fletcher row.
- `web/src/App.test.tsx` — assert Church rows render and Fletcher stays last.
- `ns-marks-the-spot/Layers/LayerDescriptor.swift` — four `LayerID` cases.
- `ns-marks-the-spot/Layers/LayerCatalog.swift` — shared Rumsey attribution + four descriptors.
- `ns-marks-the-spot/App/AppContainer.swift` — `makeLayer` arm for the Church ids.
- `ns-marks-the-spotTests/Layers/LayerCatalogTests.swift` — update the exact-id-set assertion, add Church tests.
- `ARCHITECTURE.md`, `README.md`, `web/README.md`, `plan.md` — documentation sync.

---

### Task 0: Rebase onto nightly

**Files:** none (git only)

**Interfaces:**
- Consumes: nothing
- Produces: a working tree based on `origin/nightly` for all later tasks

- [ ] **Step 1: Fetch and inspect**

```bash
cd /Users/dfakkeldy/Developer/ns-marks-the-spot/.claude/worktrees/fervent-mendel-110714
git fetch origin nightly
git log --oneline -1 origin/nightly
```

- [ ] **Step 2: Rebase this branch onto nightly**

The branch currently predates `origin/nightly` (which contains PR #139). The only local commit is the design spec, which is a new file and replays cleanly.

```bash
git rebase origin/nightly
```

Expected: `Successfully rebased and updated refs/heads/claude/fervent-burnell-185acc.`
If conflicts appear, stop and report — do not force through.

- [ ] **Step 3: Verify**

```bash
git merge-base --is-ancestor origin/nightly HEAD && echo "OK: based on nightly"
```

Expected: `OK: based on nightly`

---

### Task 1: Rumsey licence constants (web)

**Files:**
- Create: `web/src/licensing/rumseyLicense.ts`
- Test: `web/src/licensing/rumseyLicense.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces: `RUMSEY_ATTRIBUTION: string`, `RUMSEY_LICENCE_URL: string` — imported by Task 3 (`App.tsx`) and asserted in Task 2's catalog tests.

- [ ] **Step 1: Write the failing test**

Create `web/src/licensing/rumseyLicense.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { RUMSEY_ATTRIBUTION, RUMSEY_LICENCE_URL } from "./rumseyLicense";

describe("David Rumsey Map Collection licence", () => {
  it("uses the credit line the collection requires", () => {
    expect(RUMSEY_ATTRIBUTION).toBe(
      "David Rumsey Map Collection, David Rumsey Map Center, Stanford Libraries",
    );
  });

  it("links the collection's copyright and permissions page", () => {
    expect(RUMSEY_LICENCE_URL).toBe(
      "https://www.davidrumsey.com/about/copyright-and-permissions",
    );
  });

  it("does not pin a Creative Commons version in code", () => {
    expect(RUMSEY_ATTRIBUTION).not.toMatch(/BY-NC-SA/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd web && npx vitest run src/licensing/rumseyLicense.test.ts
```

Expected: FAIL — `Failed to resolve import "./rumseyLicense"`.

- [ ] **Step 3: Write minimal implementation**

Create `web/src/licensing/rumseyLicense.ts`:

```ts
// The David Rumsey Map Collection asks for this exact credit line on any
// reproduction. The originals (1864-1885) are public domain by age; the
// scans are shared under a Creative Commons NonCommercial ShareAlike licence.
// The version is intentionally not encoded here - see docs/CHURCH_MAPS.md.
export const RUMSEY_ATTRIBUTION =
  "David Rumsey Map Collection, David Rumsey Map Center, Stanford Libraries";

export const RUMSEY_LICENCE_URL =
  "https://www.davidrumsey.com/about/copyright-and-permissions";
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd web && npx vitest run src/licensing/rumseyLicense.test.ts
```

Expected: PASS — 3 tests.

- [ ] **Step 5: Commit**

```bash
git add web/src/licensing/rumseyLicense.ts web/src/licensing/rumseyLicense.test.ts
git commit -m "feat(web): add David Rumsey attribution and licence constants"
```

---

### Task 2: Church catalog entries and types (web)

**Files:**
- Modify: `web/src/layers/layerCatalog.ts:1-19` (types), `:256` (catalog array), `:475-484` (province filter)
- Test: `web/src/layers/layerCatalog.test.ts`

**Interfaces:**
- Consumes: nothing from Task 1 (the catalog does not import the licence constants; `App.tsx` in Task 3 imports both)
- Produces:
  - `type ChurchCountyLayerId = "church-inverness" | "church-victoria" | "church-richmond" | "church-cape-breton"`
  - `type RumseyReferenceLayerId = "fletcher" | ChurchCountyLayerId`
  - `churchLayerCatalog: readonly (WebLayerDescriptor & { id: ChurchCountyLayerId })[]` — consumed by Task 3's `App.tsx` group.

- [ ] **Step 1: Write the failing test**

Append to `web/src/layers/layerCatalog.test.ts` (and add `churchLayerCatalog` to the import block at the top of the file):

```ts
describe("A.F. Church county map series", () => {
  it("catalogues the four Cape Breton Island counties with publication dates", () => {
    expect(
      churchLayerCatalog.map(({ id, name, sourceDate, scale, coverage }) => ({
        id,
        name,
        sourceDate,
        scale,
        coverage,
      })),
    ).toEqual([
      {
        id: "church-inverness",
        name: "Church — Inverness County",
        sourceDate: "A.F. Church · published 1884",
        scale: "1:63,360 township map sheet",
        coverage: "Inverness County, Cape Breton Island",
      },
      {
        id: "church-victoria",
        name: "Church — Victoria County",
        sourceDate: "A.F. Church · published 1884",
        scale: "1:63,360 township map sheet",
        coverage: "Victoria County, Cape Breton Island",
      },
      {
        id: "church-richmond",
        name: "Church — Richmond County",
        sourceDate: "A.F. Church · published 1885",
        scale: "1:84,269 township map sheet",
        coverage: "Richmond County, Cape Breton Island",
      },
      {
        id: "church-cape-breton",
        name: "Church — Cape Breton County",
        sourceDate: "A.F. Church · published 1884",
        scale: "1:63,360 township map sheet",
        coverage: "Cape Breton County, Cape Breton Island",
      },
    ]);
  });

  it("keeps every Church sheet off the web map until tiles exist", () => {
    for (const layer of churchLayerCatalog) {
      expect(layer.licence).toBe("rumsey-reference");
      expect(layer.webAvailability).toBe("rights-pending");
      expect(layer.webCaveat).toContain("tiles");
      expect(layer.nativeDefaultVisibility).toBe(false);
      expect(
        provinceLayerCatalog.some((province) => province.id === layer.id),
      ).toBe(false);
    }
  });

  it("cites each sheet's David Rumsey item as its source", () => {
    expect(churchLayerCatalog.map(({ serviceUrl }) => serviceUrl)).toEqual([
      "https://www.davidrumsey.com/luna/servlet/detail/RUMSEY~8~1~353591~90120835",
      "https://www.davidrumsey.com/luna/servlet/detail/RUMSEY~8~1~374820~90141224",
      "https://www.davidrumsey.com/luna/servlet/detail/RUMSEY~8~1~373669~90140407",
      "https://www.davidrumsey.com/luna/servlet/detail/RUMSEY~8~1~374821~90141223",
    ]);
  });

  it("leaves Fletcher first so the rail can read it by index", () => {
    expect(nativeLayerCatalog[0].id).toBe("fletcher");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd web && npx vitest run src/layers/layerCatalog.test.ts
```

Expected: FAIL — `churchLayerCatalog` is not exported.

- [ ] **Step 3: Add the types**

In `web/src/layers/layerCatalog.ts`, replace lines 1-17 with:

```ts
export type ChurchCountyLayerId =
  | "church-inverness"
  | "church-victoria"
  | "church-richmond"
  | "church-cape-breton";

export type NativeLayerId =
  | "fletcher"
  | ChurchCountyLayerId
  | "ns-aerial"
  | "nsprd"
  | "crown-lands"
  | "flood-risk"
  | "waterfalls"
  | "water-features"
  | "roads";

// Historical scans from the David Rumsey collection. They are catalogued for
// attribution and metadata, but never render on the web: they carry no
// Province licence and no hosted tiles.
export type RumseyReferenceLayerId = "fletcher" | ChurchCountyLayerId;

export type TopographyLayerId = "contours";

export type WebOnlyProvinceLayerId = "buildings" | TopographyLayerId;

export type ProvinceLayerId =
  | Exclude<NativeLayerId, RumseyReferenceLayerId>
  | WebOnlyProvinceLayerId;
```

- [ ] **Step 4: Update the province filter's type predicate**

In `web/src/layers/layerCatalog.ts`, in `provinceLayerCatalog` (around line 480), change the predicate type from `Exclude<NativeLayerId, "fletcher">` to:

```ts
export const provinceLayerCatalog: readonly (
  WebLayerDescriptor & { id: ProvinceLayerId }
)[] = [
  ...nativeLayerCatalog.filter(
    (layer): layer is WebLayerDescriptor & {
      id: Exclude<NativeLayerId, RumseyReferenceLayerId>;
    } => layer.licence === "province-restricted",
  ),
  ...webOnlyProvinceLayerCatalog,
];
```

- [ ] **Step 5: Append the four Church entries**

In `web/src/layers/layerCatalog.ts`, inside `nativeLayerCatalog`, add these **after** the `roads` entry (the last one), keeping Fletcher at index 0:

```ts
  {
    id: "church-inverness",
    name: "Church — Inverness County",
    serviceUrl:
      "https://www.davidrumsey.com/luna/servlet/detail/RUMSEY~8~1~353591~90120835",
    nativeDefaultVisibility: false,
    minZoom: 0,
    maxZoom: 24,
    opacity: 1,
    licence: "rumsey-reference",
    webAvailability: "rights-pending",
    webCaveat: "Published 1884 · web view pending tiles",
    sourceDate: "A.F. Church · published 1884",
    scale: "1:63,360 township map sheet",
    coverage: "Inverness County, Cape Breton Island",
  },
  {
    id: "church-victoria",
    name: "Church — Victoria County",
    serviceUrl:
      "https://www.davidrumsey.com/luna/servlet/detail/RUMSEY~8~1~374820~90141224",
    nativeDefaultVisibility: false,
    minZoom: 0,
    maxZoom: 24,
    opacity: 1,
    licence: "rumsey-reference",
    webAvailability: "rights-pending",
    webCaveat: "Published 1884 · web view pending tiles",
    sourceDate: "A.F. Church · published 1884",
    scale: "1:63,360 township map sheet",
    coverage: "Victoria County, Cape Breton Island",
  },
  {
    id: "church-richmond",
    name: "Church — Richmond County",
    serviceUrl:
      "https://www.davidrumsey.com/luna/servlet/detail/RUMSEY~8~1~373669~90140407",
    nativeDefaultVisibility: false,
    minZoom: 0,
    maxZoom: 24,
    opacity: 1,
    licence: "rumsey-reference",
    webAvailability: "rights-pending",
    webCaveat: "Published 1885 · web view pending tiles",
    sourceDate: "A.F. Church · published 1885",
    scale: "1:84,269 township map sheet",
    coverage: "Richmond County, Cape Breton Island",
  },
  {
    id: "church-cape-breton",
    name: "Church — Cape Breton County",
    serviceUrl:
      "https://www.davidrumsey.com/luna/servlet/detail/RUMSEY~8~1~374821~90141223",
    nativeDefaultVisibility: false,
    minZoom: 0,
    maxZoom: 24,
    opacity: 1,
    licence: "rumsey-reference",
    webAvailability: "rights-pending",
    webCaveat: "Published 1884 · web view pending tiles",
    sourceDate: "A.F. Church · published 1884",
    scale: "1:63,360 township map sheet",
    coverage: "Cape Breton County, Cape Breton Island",
  },
] as const;
```

- [ ] **Step 6: Export the Church selector**

In `web/src/layers/layerCatalog.ts`, add immediately after `provinceLayerCatalog`:

```ts
const CHURCH_COUNTY_LAYER_IDS: readonly ChurchCountyLayerId[] = [
  "church-inverness",
  "church-victoria",
  "church-richmond",
  "church-cape-breton",
];

export const churchLayerCatalog: readonly (
  WebLayerDescriptor & { id: ChurchCountyLayerId }
)[] = nativeLayerCatalog.filter(
  (layer): layer is WebLayerDescriptor & { id: ChurchCountyLayerId } =>
    (CHURCH_COUNTY_LAYER_IDS as readonly string[]).includes(layer.id),
);
```

- [ ] **Step 7: Update the existing native-order test**

In `web/src/layers/layerCatalog.test.ts`, the `"mirrors the native catalog order, names, and service URLs"` test uses an exact `toEqual`. Append these four objects to the end of its expected array (after the `roads` object):

```ts
      {
        id: "church-inverness",
        name: "Church — Inverness County",
        serviceUrl:
          "https://www.davidrumsey.com/luna/servlet/detail/RUMSEY~8~1~353591~90120835",
      },
      {
        id: "church-victoria",
        name: "Church — Victoria County",
        serviceUrl:
          "https://www.davidrumsey.com/luna/servlet/detail/RUMSEY~8~1~374820~90141224",
      },
      {
        id: "church-richmond",
        name: "Church — Richmond County",
        serviceUrl:
          "https://www.davidrumsey.com/luna/servlet/detail/RUMSEY~8~1~373669~90140407",
      },
      {
        id: "church-cape-breton",
        name: "Church — Cape Breton County",
        serviceUrl:
          "https://www.davidrumsey.com/luna/servlet/detail/RUMSEY~8~1~374821~90141223",
      },
```

- [ ] **Step 8: Run the full catalog suite and typecheck**

```bash
cd web && npx vitest run src/layers/layerCatalog.test.ts && npx tsc -b
```

Expected: PASS for all catalog tests (including the pre-existing `provinceLayerIds` and default-visibility tests, which must be unchanged), and a clean typecheck. The `"publishes source date, scale, coverage, and zoom metadata for every layer"` loop now covers the Church entries and must still pass.

- [ ] **Step 9: Commit**

```bash
git add web/src/layers/layerCatalog.ts web/src/layers/layerCatalog.test.ts
git commit -m "feat(web): catalogue the four Cape Breton A.F. Church county maps"
```

---

### Task 3: Church disabled rows in the layer rail (web)

**Files:**
- Modify: `web/src/App.tsx` (imports; the layer rail, immediately before the Fletcher row at ~line 2159)
- Test: `web/src/App.test.tsx`

**Interfaces:**
- Consumes: `churchLayerCatalog` (Task 2); `RUMSEY_ATTRIBUTION`, `RUMSEY_LICENCE_URL` (Task 1); the existing `LayerMetadata` component from `./components/LayerRows`.
- Produces: no new exports.

- [ ] **Step 1: Write the failing test**

Add to `web/src/App.test.tsx`, inside the same top-level `describe` that holds the `"uses the parcel-first map defaults and keeps unavailable Fletcher last"` test:

```ts
  it("lists the Church county sheets as unavailable rows above Fletcher", () => {
    localStorage.setItem("ns-marks-the-spot:province-license:v1", "accepted");

    render(<App />);

    const layerSection = screen.getByRole("region", { name: "Map layers" });
    const layerNames = Array.from(
      layerSection.querySelectorAll(".layer-row strong"),
      (element) => element.textContent,
    );

    expect(layerNames).toContain("Church — Inverness County");
    expect(layerNames).toContain("Church — Victoria County");
    expect(layerNames).toContain("Church — Richmond County");
    expect(layerNames).toContain("Church — Cape Breton County");

    // Fletcher stays the final row in the rail.
    expect(layerNames.at(-1)).toBe("Fletcher historical map");

    // The sheets are not togglable, because there are no tiles to show.
    expect(
      screen.queryByLabelText("Church — Inverness County"),
    ).not.toBeInTheDocument();

    expect(
      screen.getByText(/Published 1885 · web view pending tiles/),
    ).toBeInTheDocument();
  });
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd web && npx vitest run src/App.test.tsx -t "Church county sheets"
```

Expected: FAIL — `expect(layerNames).toContain("Church — Inverness County")` finds no such row.

- [ ] **Step 3: Add the imports**

In `web/src/App.tsx`, add `churchLayerCatalog` to the existing import from `./layers/layerCatalog`, and add a new import:

```ts
import { RUMSEY_ATTRIBUTION, RUMSEY_LICENCE_URL } from "./licensing/rumseyLicense";
```

- [ ] **Step 4: Render the Church group before the Fletcher row**

In `web/src/App.tsx`, insert this immediately **before** the existing `<div className="layer-row unavailable">` Fletcher block:

```tsx
            <details className="resource-layer-group church-layer-group">
              <summary>
                <span>Church (1860s–80s)</span>
                <small>4 Cape Breton counties · tiles pending</small>
              </summary>
              <div className="resource-layer-controls">
                {churchLayerCatalog.map((layer) => (
                  <div className="layer-row unavailable" key={layer.id}>
                    <span className="switch" aria-hidden="true" />
                    <span>
                      <strong>{layer.name}</strong>
                      <small>{layer.webCaveat}</small>
                      <LayerMetadata
                        sourceDate={layer.sourceDate}
                        scale={layer.scale}
                        coverage={layer.coverage}
                        minZoom={layer.minZoom}
                        maxZoom={layer.maxZoom}
                        checked={false}
                        status={{ status: "idle" }}
                      />
                    </span>
                  </div>
                ))}
                <p className="resource-source-note">
                  A.F. Church topographical township maps name the residents of
                  each building, and the occupations of prominent townsfolk.
                  Scans courtesy of the{" "}
                  <a href={RUMSEY_LICENCE_URL} target="_blank" rel="noreferrer">
                    David Rumsey Map Collection
                  </a>
                  . {RUMSEY_ATTRIBUTION}. Web tiles are not produced yet.
                </p>
              </div>
            </details>
```

- [ ] **Step 5: Run the web suite**

```bash
cd web && npx vitest run && npx tsc -b && npm run lint
```

Expected: PASS. In particular the pre-existing `"uses the parcel-first map defaults and keeps unavailable Fletcher last"` test must still pass unchanged — the Church rows sit above Fletcher, so `layerNames.at(-1)` is still `"Fletcher historical map"`.

- [ ] **Step 6: Commit**

```bash
git add web/src/App.tsx web/src/App.test.tsx
git commit -m "feat(web): show the Church county sheets as pending layer rows"
```

---

### Task 4: Church layers in the iOS catalog

**Files:**
- Modify: `ns-marks-the-spot/Layers/LayerDescriptor.swift:3-10`
- Modify: `ns-marks-the-spot/Layers/LayerCatalog.swift` (attribution helper + four descriptors)
- Modify: `ns-marks-the-spot/App/AppContainer.swift:46-103` (`makeLayer`)
- Test: `ns-marks-the-spotTests/Layers/LayerCatalogTests.swift`

**Interfaces:**
- Consumes: nothing from Tasks 1-3 (the iOS app shares no code with `web/`).
- Produces: `LayerID.churchInverness`, `.churchVictoria`, `.churchRichmond`, `.churchCapeBreton` with raw values `"church-inverness"`, `"church-victoria"`, `"church-richmond"`, `"church-cape-breton"`.

- [ ] **Step 1: Write the failing test**

In `ns-marks-the-spotTests/Layers/LayerCatalogTests.swift`, update `containsExpectedV1Layers` and add two new tests:

```swift
    @Test func containsExpectedV1Layers() {
        let ids = Set(LayerCatalog.all.map(\.id))

        #expect(ids == [
            .fletcher,
            .nsAerial,
            .nsPropertyBoundaries,
            .crownLands,
            .floodRisk,
            .waterfalls,
            .churchInverness,
            .churchVictoria,
            .churchRichmond,
            .churchCapeBreton
        ])
    }

    @Test func churchSheetsAreCataloguedWithoutASource() {
        let churchIDs: [LayerID] = [
            .churchInverness, .churchVictoria, .churchRichmond, .churchCapeBreton
        ]

        for id in churchIDs {
            let descriptor = LayerCatalog.descriptor(for: id)

            // Catalogued for attribution and metadata only; no tiles exist yet,
            // so there is deliberately nothing to fetch.
            #expect(descriptor?.sourceURL == nil)
            #expect(descriptor?.offlinePolicy == .onlineOnly)
            #expect(descriptor?.defaultVisibility == false)
            #expect(descriptor?.renderingRole == .overlay)
        }
    }

    @Test func churchSheetsCreditTheRumseyCollection() throws {
        let descriptor = try #require(LayerCatalog.descriptor(for: .churchRichmond))

        #expect(descriptor.attribution.provider == "David Rumsey Map Collection, David Rumsey Map Center, Stanford Libraries")
        #expect(descriptor.userCaveat?.contains("1885") == true)
        #expect(descriptor.attribution.licenseURL?.absoluteString == "https://www.davidrumsey.com/about/copyright-and-permissions")
    }
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /Users/dfakkeldy/Developer/ns-marks-the-spot/.claude/worktrees/fervent-mendel-110714
"$HOME/.claude/bin/xcode-build-gate.sh" --wait && xcodebuild test \
  -project ns-marks-the-spot.xcodeproj \
  -scheme ns-marks-the-spot \
  -destination 'platform=iOS Simulator,name=iPhone 16' \
  -only-testing:ns-marks-the-spotTests/LayerCatalogTests 2>&1 | tail -30
```

Expected: FAIL to compile — `type 'LayerID' has no member 'churchInverness'`.

- [ ] **Step 3: Add the LayerID cases**

In `ns-marks-the-spot/Layers/LayerDescriptor.swift`, replace the `LayerID` enum:

```swift
nonisolated enum LayerID: String, CaseIterable, Sendable {
    case fletcher
    case nsAerial = "ns-aerial"
    case nsPropertyBoundaries = "nsprd"
    case crownLands = "crown-lands"
    case floodRisk = "flood-risk"
    case waterfalls
    case churchInverness = "church-inverness"
    case churchVictoria = "church-victoria"
    case churchRichmond = "church-richmond"
    case churchCapeBreton = "church-cape-breton"
}
```

- [ ] **Step 4: Add the shared Rumsey attribution**

In `ns-marks-the-spot/Layers/LayerCatalog.swift`, add near the other private constants at the top of the enum (beside `provinceDisclaimer`):

```swift
    private static let rumseyAttribution = LayerAttribution(
        provider: "David Rumsey Map Collection, David Rumsey Map Center, Stanford Libraries",
        copyright: nil,
        disclaimer: "Historical maps are provided for reference and historical interest only.",
        licenseTitle: nil,
        licenseURL: URL(string: "https://www.davidrumsey.com/about/copyright-and-permissions")
    )
```

- [ ] **Step 5: Add the four descriptors**

In `ns-marks-the-spot/Layers/LayerCatalog.swift`, append these to the end of the `all` array (after the `waterfalls` descriptor, inside the closing `]`):

```swift
        ,
        LayerDescriptor(
            id: .churchInverness,
            name: "Church — Inverness County",
            sourceKind: .remoteXYZTemplate,
            sourceURL: nil,
            defaultOpacity: 1.0,
            defaultVisibility: false,
            minZoom: 0,
            maxZoom: 24,
            renderingRole: .overlay,
            offlinePolicy: .onlineOnly,
            cacheKey: "church-inverness",
            attribution: rumseyAttribution,
            userCaveat: "A.F. Church county map (published 1884); historical reference, not for navigation."
        ),
        LayerDescriptor(
            id: .churchVictoria,
            name: "Church — Victoria County",
            sourceKind: .remoteXYZTemplate,
            sourceURL: nil,
            defaultOpacity: 1.0,
            defaultVisibility: false,
            minZoom: 0,
            maxZoom: 24,
            renderingRole: .overlay,
            offlinePolicy: .onlineOnly,
            cacheKey: "church-victoria",
            attribution: rumseyAttribution,
            userCaveat: "A.F. Church county map (published 1884); historical reference, not for navigation."
        ),
        LayerDescriptor(
            id: .churchRichmond,
            name: "Church — Richmond County",
            sourceKind: .remoteXYZTemplate,
            sourceURL: nil,
            defaultOpacity: 1.0,
            defaultVisibility: false,
            minZoom: 0,
            maxZoom: 24,
            renderingRole: .overlay,
            offlinePolicy: .onlineOnly,
            cacheKey: "church-richmond",
            attribution: rumseyAttribution,
            userCaveat: "A.F. Church county map (published 1885); historical reference, not for navigation."
        ),
        LayerDescriptor(
            id: .churchCapeBreton,
            name: "Church — Cape Breton County",
            sourceKind: .remoteXYZTemplate,
            sourceURL: nil,
            defaultOpacity: 1.0,
            defaultVisibility: false,
            minZoom: 0,
            maxZoom: 24,
            renderingRole: .overlay,
            offlinePolicy: .onlineOnly,
            cacheKey: "church-cape-breton",
            attribution: rumseyAttribution,
            userCaveat: "A.F. Church county map (published 1884); historical reference, not for navigation."
        )
```

Note: the existing array's last element (`waterfalls`) has no trailing comma, hence the leading `,` above. Adjust to match the file's actual formatting — the result must be a valid comma-separated array.

- [ ] **Step 6: Handle the Church ids in makeLayer**

`AppContainer.makeLayer(from:)` is an exhaustive `switch descriptor.id`, so it will not compile until the new cases are handled. In `ns-marks-the-spot/App/AppContainer.swift`, add before the closing brace of the switch:

```swift
        case .churchInverness, .churchVictoria, .churchRichmond, .churchCapeBreton:
            // Catalogued for attribution and metadata only. No tiles have been
            // produced for the Church series yet, so there is no renderable
            // source to install. Give these a source URL and a tile type when
            // the pyramids exist.
            return nil
```

- [ ] **Step 7: Run the tests**

```bash
"$HOME/.claude/bin/xcode-build-gate.sh" --wait && xcodebuild test \
  -project ns-marks-the-spot.xcodeproj \
  -scheme ns-marks-the-spot \
  -destination 'platform=iOS Simulator,name=iPhone 16' \
  -only-testing:ns-marks-the-spotTests 2>&1 | tail -30
```

Expected: PASS. Watch three pre-existing tests in particular, all of which must stay green:
- `AttributionTests.everyLayerHasUserVisibleAttribution` — iterates every layer; Church has a non-empty provider and disclaimer.
- `AttributionTests.everyProvinceLayerHasRestrictedLicenseText` — filters on `provider == "Province of Nova Scotia"`, so Church is correctly excluded.
- `LayerInstallationTests.appContainerInstallsCatalogLayers` — uses `.contains()`, so it is unaffected by Church not being installed.

- [ ] **Step 8: Commit**

```bash
git add ns-marks-the-spot/Layers/LayerDescriptor.swift \
        ns-marks-the-spot/Layers/LayerCatalog.swift \
        ns-marks-the-spot/App/AppContainer.swift \
        ns-marks-the-spotTests/Layers/LayerCatalogTests.swift
git commit -m "feat(ios): catalogue the four Cape Breton A.F. Church county maps"
```

---

### Task 5: Documentation

**Files:**
- Create: `docs/CHURCH_MAPS.md`
- Modify: `ARCHITECTURE.md`, `README.md`, `web/README.md`, `plan.md`

**Interfaces:**
- Consumes: the layer names and ids from Tasks 2 and 4.
- Produces: nothing consumed by code.

- [ ] **Step 1: Create the reference doc**

Create `docs/CHURCH_MAPS.md`:

````markdown
# A.F. Church County Maps

Ambrose F. Church was commissioned by the Nova Scotia legislature in 1864 to
produce a topographical township map for each of the province's 18 counties.
The sheets name the resident of each building and, for prominent townsfolk,
their occupation — which makes them unusually useful for historical property
research. Publication of many sheets slipped into the 1870s and 1880s for
financial reasons, so the survey date and the publication date differ.

## Status in this project

Four Cape Breton Island counties are **catalogued but not rendered**. They
appear in `web/src/layers/layerCatalog.ts` and
`ns-marks-the-spot/Layers/LayerCatalog.swift` with full metadata and
attribution, but no tiles have been produced, so:

- the web rail shows them as disabled rows under "Church (1860s–80s)";
- the iOS catalog carries `sourceURL: nil` and installs no layer.

## Wired counties

| County | Layer id | Published | Scale | Rumsey item |
|---|---|---|---|---|
| Inverness | `church-inverness` | 1884 | 1:63,360 | `RUMSEY~8~1~353591~90120835` |
| Victoria | `church-victoria` | 1884 | 1:63,360 | `RUMSEY~8~1~374820~90141224` |
| Richmond | `church-richmond` | 1885 | 1:84,269 | `RUMSEY~8~1~373669~90140407` |
| Cape Breton | `church-cape-breton` | 1884 | 1:63,360 | `RUMSEY~8~1~374821~90141223` |

Rumsey's "Date" field on these items reads 1864 — that is the copyright and
survey date. The publication dates above come from each item's Note field.

## Also in Rumsey, not yet wired

| County | Published | Scale | Rumsey item | Note |
|---|---|---|---|---|
| Cumberland | 1873 | 1:42,240 | `RUMSEY~8~1~372500~90139420` | |
| Kings | 1872 | 1:63,360 | `RUMSEY~8~1~372851~90139591` | |
| Lunenburg | 1883 | 1:63,360 | `RUMSEY~8~1~200267~3000165` | Georeferenced upstream (79% adequate control points) |
| Halifax | 1865 | 1:99,000 | `RUMSEY~8~1~351990~90119171` | Drawn by H.F. Walling, who originated the series |

These are outside the Cape Breton tax-sale focus area. Adding one is a
catalog entry plus a `LayerID` case — the same shape as the four above.

## Counties missing from Rumsey

Rumsey holds 8 of the 18 sheets. Absent: Pictou, Antigonish, Guysborough,
Colchester, Hants, **Annapolis**, Digby, Yarmouth, Shelburne, Queens.

**Annapolis** was requested for a tax sale and specifically checked on
2026-07-24: Rumsey returns no Church Annapolis sheet. The only Rumsey map of
the county is Roe Brothers 1878 "Counties of Annapolis and Queens"
(`RUMSEY~8~1~33063~1170426`), a 1:443,520 general atlas sheet with no
parcel or owner detail — not a substitute. Non-Rumsey sources are dead ends
for now: NS Archives has only an Annapolis fragment online (the old
`/churchmaps/` exhibit is a dead soft-404) and DNR sells paper
reproductions only. Those carry Crown copyright rather than the Rumsey
licence, so sourcing one is tracked as separate work.

## Licensing

- **Credit line (required):** David Rumsey Map Collection, David Rumsey Map
  Center, Stanford Libraries
- **Terms:** https://www.davidrumsey.com/about/copyright-and-permissions
- Rumsey's copyright page currently states **CC BY-NC-SA 3.0**. (An earlier
  brief for this work said 4.0; the live page is authoritative.) The version
  is deliberately not hardcoded in either codebase — only the credit line and
  the URL are, mirroring how the Fletcher layer is attributed.
- The original maps (1864–1885) are public domain by age. The *scans* are what
  the Creative Commons terms cover.
- This project is non-commercial and MIT-licensed, which fits BY-NC-SA.

## Producing tiles (deferred)

No tiles exist yet. When producing them:

1. Rumsey serves full public-domain scans without a key: a JP2/MrSID download
   per item, plus a IIIF Level-2 endpoint
   (`.../luna/servlet/iiif/<id>/info.json`). These are large — Inverness is
   34,427 × 34,543 px.
2. IIIF returns image-space tiles, not Web Mercator. Georeference to
   EPSG:3857 and slice with GDAL, per `docs/FLETCHER_GEOREFERENCING.md`
   (`gdal_translate` GCPs → `gdalwarp` → `gdal2tiles --xyz`). Note
   `gdal2tiles` is not installed by default here, and the georeferencing
   script in that document has two bugs called out in its own notes.
3. The Fletcher scrape shortcut (`docs/tile_downloader.py`) is **not**
   available: `wmts.oldmapsonline.org` now requires `OLDMAPSONLINE_API_KEY`,
   which is not in this repo, CI, or the environment.
4. Write a `metadata.json` beside any tile tree recording source URL, Rumsey
   id, bbox, zoom range, tile size, retrieval date, and licence. The existing
   `Tiles/Fletcher` tree has no such record, which is why its provenance
   survives only in a script's constants.
5. Decide storage deliberately before adding binaries. `Tiles/Fletcher` is
   ~311 MB of plain git blobs (no LFS), and there is an open roadmap item to
   stop bundling tiles.
6. To light a county up, set its `serviceUrl` / `sourceURL` to the tile
   template and flip `webAvailability` to `"available"`.
````

- [ ] **Step 2: Update ARCHITECTURE.md**

In the "Layer Catalog And Offline Storage" section, append:

```markdown
The A.F. Church county maps (four Cape Breton Island sheets from the David
Rumsey collection) are catalogued in both the native and web catalogs but do
not render: no tiles have been produced for them. On the web they follow the
Fletcher precedent as disabled rows; on iOS they carry `sourceURL: nil` and
install no layer. See `docs/CHURCH_MAPS.md`.
```

- [ ] **Step 3: Update plan.md**

Under "Deferred For v1.1", replace the `Additional historical map collections beyond Fletcher` line with:

```markdown
- [ ] Additional historical map collections beyond Fletcher (A.F. Church Cape Breton sheets are catalogued; tiles still pending — see `docs/CHURCH_MAPS.md`)
```

- [ ] **Step 4: Update the READMEs**

In `README.md` and `web/README.md`, add the Church series to the layer list, describing it as catalogued with tiles pending and crediting the David Rumsey Map Collection. Match each file's existing list formatting.

- [ ] **Step 5: Verify no stray tile artifacts**

```bash
git status --short
find . -path ./web/node_modules -prune -o -type d -name "Church*" -print
```

Expected: only the intended documentation edits; no `Tiles/Church*` directory.

- [ ] **Step 6: Commit**

```bash
git add docs/CHURCH_MAPS.md ARCHITECTURE.md README.md web/README.md plan.md
git commit -m "docs: document the A.F. Church county map series"
```

---

### Task 6: Full verification and PR

**Files:** none (verification only)

**Interfaces:**
- Consumes: everything from Tasks 1-5.

- [ ] **Step 1: Run the whole web suite**

```bash
cd web && npx vitest run && npx tsc -b && npm run lint
```

Expected: all tests pass, clean typecheck, no lint errors.

- [ ] **Step 2: Run the whole iOS suite**

```bash
cd /Users/dfakkeldy/Developer/ns-marks-the-spot/.claude/worktrees/fervent-mendel-110714
"$HOME/.claude/bin/xcode-build-gate.sh" --wait && xcodebuild test \
  -project ns-marks-the-spot.xcodeproj \
  -scheme ns-marks-the-spot \
  -destination 'platform=iOS Simulator,name=iPhone 16' 2>&1 | tail -30
```

Expected: `TEST SUCCEEDED`.

- [ ] **Step 3: Confirm the working tree is clean**

```bash
git status --short --branch
```

Expected: no uncommitted changes.

- [ ] **Step 4: Push and open the PR into nightly**

```bash
git push -u origin HEAD
gh pr create --base nightly \
  --title "feat: catalogue the A.F. Church Cape Breton county maps" \
  --body "$(cat <<'EOF'
## Summary

Registers the four Cape Breton Island A.F. Church county maps (Inverness 1884,
Victoria 1884, Richmond 1885, Cape Breton 1884) from the David Rumsey
collection in both the web and iOS layer catalogs, mirroring the existing
Fletcher layer.

The layers are **catalogued but not rendered** — no tiles have been produced.
On the web they appear as disabled rows under a "Church (1860s–80s)" group,
above the existing Fletcher row. On iOS they carry `sourceURL: nil` and install
no layer, so they add attribution and metadata without any network traffic.

No tile artifacts are added.

## Notes

- Rumsey's "Date" field on these items is the 1864 copyright date; the
  publication dates used here come from each item's Note field.
- Attribution follows the collection's required credit line. The Creative
  Commons version is documented in `docs/CHURCH_MAPS.md` rather than hardcoded
  (Rumsey's page states 3.0).
- Annapolis was requested but is not in Rumsey; the gap and its sourcing
  options are recorded in `docs/CHURCH_MAPS.md` and tracked separately.

## Test plan

- `cd web && npx vitest run && npx tsc -b && npm run lint`
- Full `xcodebuild test` suite on the iOS target

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Self-Review

**1. Spec coverage.** Every section of the design spec maps to a task: web types/catalog/exclusion → Task 2; `rumseyLicense.ts` → Task 1; the grouped disabled rows → Task 3; iOS `LayerID`/descriptors/`makeLayer` → Task 4; the Annapolis gap, licensing nuance, deferred tile recipe, and all four doc updates → Task 5; branch rebase → Task 0; PR into `nightly` → Task 6. The spec's "untouched on purpose" items (`bundledNativeZoomRange`, `TileDownloadManager.fletcherLayerID`) are respected — no task modifies them.

**2. Placeholder scan.** No TBD/TODO, no "add error handling", no "similar to Task N". Every code step contains the literal code to write. The one judgement call left to the implementer — matching the existing comma formatting when appending to the Swift `all` array (Task 4, Step 5) — is called out explicitly with the reason.

**3. Type consistency.** `ChurchCountyLayerId` and `RumseyReferenceLayerId` are defined in Task 2 Step 3 and used consistently in Steps 4 and 6. `churchLayerCatalog` is exported in Task 2 Step 6 and consumed in Task 3 Step 4. The four web ids, the four Swift `LayerID` raw values, and the four `cacheKey`s are the same strings throughout. Layer display names (`Church — Inverness County`, etc., em dash) are identical in the web catalog, the web tests, the Swift catalog, and `docs/CHURCH_MAPS.md`.

**4. Ordering invariants.** Two are load-bearing and each is protected by an explicit assertion: Fletcher stays at `nativeLayerCatalog[0]` (Task 2 Step 1 test) and the Fletcher row stays last in the rail (Task 3 Step 1 test re-asserts `layerNames.at(-1)`).
