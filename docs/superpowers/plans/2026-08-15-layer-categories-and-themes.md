# Layer Categories and Themes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the web map a general-purpose Nova Scotia map with categorized layer controls, five editable built-in setups, browser-local custom themes, and all tax-sale behavior behind an explicit default-off master control.

**Architecture:** Keep the existing catalogues, renderers, services, share links, licence gate, and imported-map stores authoritative. Add small pure registries for categories and themes, a validated local theme repository, and one App-level orchestration callback that computes a complete target state before synchronously setting existing visibility records. The first implementation changes only `web/`; generated JSON fixtures provide stable IDs for a later native implementation without touching the active iPhone port.

**Tech Stack:** React 19, TypeScript 5.9, Vite 8, Vitest 4, Testing Library, browser `localStorage`, existing IndexedDB user-map stores, and existing CSS.

## Global Constraints

- Begin implementation in a dedicated worktree based on the then-current `origin/nightly`; do not edit the canonical checkout or Claude's active iPhone worktree.
- Limit product changes to `web/` plus this repository's documentation and generated parity fixture. Do not modify native Swift/Xcode files.
- Do not add third-party dependencies.
- Preserve all existing stable layer IDs, source metadata, render order, licence semantics, GeoPDF privacy, and imported-map IndexedDB records.
- Use `taxSale=on|off` as the new explicit query parameter. Legacy URLs containing `mode` or `event` without `taxSale` remain tax-sale enabled.
- Treat a URL with none of `taxSale`, `mode`, `event`, `pid`, `layers`, or `position` as a first visit and apply Explore Nova Scotia.
- Apply a theme from one event callback after calculating its full result. Do not use a sequence of effects to converge on the target theme.
- Run the focused test after every red/green step. Run the full web suite before every task commit whose changes touch `App.tsx`.
- Keep all user-facing controls text-only; do not add generated imagery, theme thumbnails, or decorative icons.

---

## File Map

### New files

- `web/src/layers/layerCategories.ts` — ordered category registry and the single category assignment for every catalogue layer.
- `web/src/layers/layerCategories.test.ts` — exhaustiveness, uniqueness, and category-contract tests.
- `web/src/themes/mapThemes.ts` — immutable built-in themes, shared theme types, validation, and the generated-fixture model.
- `web/src/themes/mapThemes.test.ts` — exact built-in compositions, identifier validation, opaque-background rule, and fixture test.
- `web/src/themes/themeState.ts` — pure theme resolution, exact/modified matching, partial-result reporting, and visibility-record helpers.
- `web/src/themes/themeState.test.ts` — theme application, restricted/unavailable layers, matching, and atomic-target tests.
- `web/src/themes/themeStorage.ts` — versioned custom-theme parsing, validation, CRUD transformations, and persistence.
- `web/src/themes/themeStorage.test.ts` — valid, obsolete, corrupt, read-failure, write-failure, and CRUD tests.
- `web/src/themes/fixtures/map-presentation.json` — generated category and built-in-theme portability fixture.
- `web/src/components/MapThemePicker.tsx` — Map setup selector, current status, reset/save/manage actions, and live announcement.
- `web/src/components/MapThemePicker.test.tsx` — keyboard/label/action tests.
- `web/src/components/ThemeManagerDialog.tsx` — save, rename, update, duplicate, and delete UI for custom themes.
- `web/src/components/ThemeManagerDialog.test.tsx` — dialog and action tests.
- `web/src/components/LayerCategorySection.tsx` — reusable accessible desktop/mobile category disclosure.
- `web/src/components/LayerCategorySection.test.tsx` — disclosure, status-summary, and focus tests.

### Existing files to modify

- `web/src/services/mapShareState.ts` and `web/src/services/mapShareState.test.ts` — explicit Tax Sale enabled state and legacy compatibility.
- `web/src/services/printSnapshot.ts` and `web/src/services/printSnapshot.test.ts` — preserve Tax Sale enabled state in print/share captures.
- `web/src/App.tsx` and `web/src/App.test.tsx` — startup precedence, coherent theme application, category layout, licence continuation, Tax Sale shutdown, imported-map preservation, and share URL integration.
- `web/src/userMaps/components/UserMapRows.tsx` and `web/src/userMaps/components/UserMapRows.test.tsx` — expose user-raster controls without owning a second category disclosure.
- `web/src/userMaps/vector/components/UserVectorRows.tsx` and `web/src/userMaps/vector/components/UserVectorRows.test.tsx` — expose user-vector controls without owning a second category disclosure.
- `web/src/styles.css` and `web/src/styles.test.ts` — text-only setup controls, category presentation, phone focus mode, visible focus, and 44-pixel touch targets.
- `web/README.md` — describe the new first-visit, category, theme, storage, and sharing behavior.

---

## Task 1: Establish the Exhaustive Category Contract

**Files:**

- Create: `web/src/layers/layerCategories.ts`
- Create: `web/src/layers/layerCategories.test.ts`
- Read only for identifiers: `web/src/layers/layerCatalog.ts`
- Read only for shareable type: `web/src/services/mapShareState.ts`

- [ ] **Step 1: Write the failing category-contract tests**

  Build the expected catalogue ID set from the existing catalogue exports rather than copying their metadata. Assert that the category registry has the approved order, that every current catalogue ID appears exactly once, and that the representative assignments below are fixed.

  ```ts
  import { describe, expect, it } from "vitest";
  import {
    churchLayerCatalog,
    environmentalHealthLayerCatalog,
    fletcherLayerCatalog,
    floodHazardLayerCatalog,
    forestryLayerCatalog,
    hydroPilotLayerCatalog,
    provinceLayerCatalog,
    allResourceLayerCatalog,
    wellLogLayerCatalog,
    zoningLayerCatalog,
  } from "./layerCatalog";
  import {
    layerCategories,
    layerCategoryByLayerId,
  } from "./layerCategories";

  const catalogueIds = [
    "modern",
    fletcherLayerCatalog.id,
    ...provinceLayerCatalog.map((layer) => layer.id),
    ...allResourceLayerCatalog.map((layer) => layer.id),
    ...hydroPilotLayerCatalog.map((layer) => layer.id),
    ...floodHazardLayerCatalog.map((layer) => layer.id),
    ...environmentalHealthLayerCatalog.map((layer) => layer.id),
    ...forestryLayerCatalog.map((layer) => layer.id),
    ...zoningLayerCatalog.map((layer) => layer.id),
    ...wellLogLayerCatalog.map((layer) => layer.id),
    ...churchLayerCatalog.map((layer) => layer.id),
  ];

  it("assigns every supported catalogue layer exactly once", () => {
    expect(Object.keys(layerCategoryByLayerId).sort()).toEqual(
      [...new Set(catalogueIds)].sort(),
    );
    expect(catalogueIds).toHaveLength(new Set(catalogueIds).size);
  });

  it("uses the approved category order", () => {
    expect(layerCategories.map(({ id }) => id)).toEqual([
      "background-maps",
      "land-property",
      "roads-places",
      "water-terrain",
      "environment-hazards",
      "forestry-ecology",
      "geology-resources",
      "historical-maps",
      "tax-sale",
      "my-maps",
    ]);
  });

  it("keeps category identity independent of themes", () => {
    expect(layerCategoryByLayerId["modern"]).toBe("background-maps");
    expect(layerCategoryByLayerId["nsprd"]).toBe("land-property");
    expect(layerCategoryByLayerId["roads"]).toBe("roads-places");
    expect(layerCategoryByLayerId["water-features"]).toBe("water-terrain");
    expect(layerCategoryByLayerId["old-growth-policy"]).toBe("forestry-ecology");
    expect(layerCategoryByLayerId["fletcher"]).toBe("historical-maps");
  });
  ```

- [ ] **Step 2: Run the focused test and confirm the missing module failure**

  Run from `web/`:

  ```bash
  npx vitest run src/layers/layerCategories.test.ts
  ```

  Expected: FAIL because `./layerCategories` does not exist.

- [ ] **Step 3: Implement the ordered registry and one-to-one map**

  Export closed ID unions so theme storage and fixtures cannot invent category IDs. Assign every ID from `layerCatalog.ts`; `tax-sale` and `my-maps` are UI categories and therefore intentionally have no catalogue-layer assignment.

  ```ts
  import type { ChurchCountyLayerId } from "./layerCatalog";
  import type { ShareLayerId } from "../services/mapShareState";

  export type LayerCategoryId =
    | "background-maps"
    | "land-property"
    | "roads-places"
    | "water-terrain"
    | "environment-hazards"
    | "forestry-ecology"
    | "geology-resources"
    | "historical-maps"
    | "tax-sale"
    | "my-maps";

  export type CatalogueLayerCategoryId = Exclude<
    LayerCategoryId,
    "tax-sale" | "my-maps"
  >;

  export type CategorizedLayerId = ShareLayerId | ChurchCountyLayerId;

  export interface LayerCategoryDefinition {
    id: LayerCategoryId;
    name: string;
    description: string;
  }

  export const layerCategories = [
    { id: "background-maps", name: "Background Maps", description: "Choose the map beneath your overlays." },
    { id: "land-property", name: "Land & Property", description: "Property, Crown land, buildings, and zoning." },
    { id: "roads-places", name: "Roads & Places", description: "Roads, trails, place names, and reference routes." },
    { id: "water-terrain", name: "Water & Terrain", description: "Water, watersheds, waterfalls, contours, and terrain projects." },
    { id: "environment-hazards", name: "Environment & Hazards", description: "Flood, health, aquifer, and well information." },
    { id: "forestry-ecology", name: "Forestry & Ecology", description: "Forestry policy and ecological information." },
    { id: "geology-resources", name: "Geology & Resources", description: "Minerals, tenure, mines, and resource context." },
    { id: "historical-maps", name: "Historical Maps", description: "Fletcher and Church historical map collections." },
    { id: "tax-sale", name: "Tax Sale", description: "Optional current and historical tax-sale research." },
    { id: "my-maps", name: "My Maps", description: "Import, register, and control your own maps and data." },
  ] as const satisfies readonly LayerCategoryDefinition[];

  export const layerCategoryByLayerId = {
    modern: "background-maps",
    "ns-aerial": "background-maps",
    nsprd: "land-property",
    "crown-lands": "land-property",
    buildings: "land-property",
    "zoning-inverness": "land-property",
    "zoning-victoria": "land-property",
    "zoning-richmond": "land-property",
    "zoning-cumberland": "land-property",
    "zoning-halifax": "land-property",
    roads: "roads-places",
    "main-roads": "roads-places",
    "place-names": "roads-places",
    waterfalls: "water-terrain",
    "water-features": "water-terrain",
    contours: "water-terrain",
    "inverness-hydro-potential": "water-terrain",
    "flood-risk": "environment-hazards",
    "published-river-flood-zones": "environment-hazards",
    "coastal-flood-current": "environment-hazards",
    "coastal-flood-2050": "environment-hazards",
    "coastal-flood-2100": "environment-hazards",
    "arsenic-risk-wells": "environment-hazards",
    "uranium-risk-wells": "environment-hazards",
    "manganese-risk-wells": "environment-hazards",
    "surficial-aquifers": "environment-hazards",
    "ns-well-logs": "environment-hazards",
    "old-growth-policy": "forestry-ecology",
    "mineral-occurrences": "geology-resources",
    "mineral-tenure": "geology-resources",
    "abandoned-mines": "geology-resources",
    "mineral-proximity-parcels": "geology-resources",
    fletcher: "historical-maps",
    "church-inverness": "historical-maps",
    "church-victoria": "historical-maps",
    "church-richmond": "historical-maps",
    "church-cape-breton": "historical-maps",
  } as const satisfies Readonly<Record<CategorizedLayerId, CatalogueLayerCategoryId>>;
  ```

- [ ] **Step 4: Add query helpers and validate IDs**

  ```ts
  const categoryIdSet = new Set(layerCategories.map(({ id }) => id));

  export function isLayerCategoryId(value: unknown): value is LayerCategoryId {
    return typeof value === "string" && categoryIdSet.has(value as LayerCategoryId);
  }

  export function layerIdsForCategory(
    categoryId: CatalogueLayerCategoryId,
  ): CategorizedLayerId[] {
    return (Object.entries(layerCategoryByLayerId) as Array<
      [CategorizedLayerId, CatalogueLayerCategoryId]
    >)
      .filter(([, assignedCategoryId]) => assignedCategoryId === categoryId)
      .map(([layerId]) => layerId);
  }
  ```

- [ ] **Step 5: Run focused and full tests**

  ```bash
  npx vitest run src/layers/layerCategories.test.ts
  npm test
  ```

  Expected: PASS.

- [ ] **Step 6: Commit the category contract**

  ```bash
  git add web/src/layers/layerCategories.ts web/src/layers/layerCategories.test.ts
  git commit -m "feat(web): categorize map layers"
  ```

---

## Task 2: Define and Resolve Built-in Themes

**Files:**

- Create: `web/src/themes/mapThemes.ts`
- Create: `web/src/themes/mapThemes.test.ts`
- Create: `web/src/themes/themeState.ts`
- Create: `web/src/themes/themeState.test.ts`
- Modify: `web/src/services/mapShareState.ts`
- Read: `web/src/layers/layerCatalog.ts`
- Read: `web/src/layers/layerCategories.ts`

- [ ] **Step 1: Export the existing share-layer validator**

  Rename the private valid-layer set in `mapShareState.ts` to `shareLayerIdSet` and export this guard without changing parsing behavior yet:

  ```ts
  export function isShareLayerId(value: unknown): value is ShareLayerId {
    return typeof value === "string" && shareLayerIdSet.has(value as ShareLayerId);
  }
  ```

- [ ] **Step 2: Write failing tests for exact built-in definitions**

  ```ts
  import { describe, expect, it } from "vitest";
  import { builtInMapThemes, validateMapTheme } from "./mapThemes";

  it("defines the approved Explore setup", () => {
    expect(builtInMapThemes[0]).toMatchObject({
      id: "explore-nova-scotia",
      name: "Explore Nova Scotia",
      layerIds: ["modern"],
      preferredCategoryIds: ["background-maps"],
      taxSaleEnabled: false,
      mapMode: "current",
    });
  });

  it("defines Tax Sale Research as an explicit current-notice opt-in", () => {
    const theme = builtInMapThemes.find(({ id }) => id === "tax-sale-research");
    expect(theme).toMatchObject({
      layerIds: ["ns-aerial", "nsprd", "roads", "water-features", "buildings"],
      preferredCategoryIds: ["tax-sale", "land-property"],
      taxSaleEnabled: true,
      mapMode: "current",
    });
  });

  it("rejects more than one opaque background", () => {
    expect(
      validateMapTheme({
        ...builtInMapThemes[0],
        layerIds: ["modern", "ns-aerial"],
      }),
    ).toContain("opaque background");
  });

  it("validates every built-in theme", () => {
    for (const theme of builtInMapThemes) {
      expect(validateMapTheme(theme)).toEqual([]);
    }
  });
  ```

  Add exact expectations for Forestry & Field Access, Historical Maps, and Georeferencing using the compositions in the approved design.

- [ ] **Step 3: Write failing pure-resolution and matching tests**

  ```ts
  import { describe, expect, it } from "vitest";
  import { builtInMapThemes } from "./mapThemes";
  import { matchTheme, resolveTheme } from "./themeState";

  it("resolves one complete target before UI state changes", () => {
    const theme = builtInMapThemes.find(({ id }) => id === "forestry-field-access")!;
    expect(
      resolveTheme(theme, {
        licenceAccepted: true,
        availableLayerIds: new Set(theme.layerIds),
        restrictedLayerIds: new Set(theme.layerIds),
      }),
    ).toEqual({
      target: {
        layerIds: theme.layerIds,
        opacityOverrides: {},
        preferredCategoryIds: theme.preferredCategoryIds,
        taxSaleEnabled: false,
        mapMode: "current",
      },
      blockedLayerIds: [],
      unavailableLayerIds: [],
      status: "exact",
    });
  });

  it("applies unrestricted layers and explains restricted and unavailable ones", () => {
    const theme = builtInMapThemes.find(({ id }) => id === "historical-maps")!;
    expect(
      resolveTheme(theme, {
        licenceAccepted: false,
        availableLayerIds: new Set(["modern", "place-names", "main-roads"]),
        restrictedLayerIds: new Set(["place-names", "main-roads"]),
      }),
    ).toMatchObject({
      target: { layerIds: ["modern"] },
      blockedLayerIds: ["place-names", "main-roads"],
      unavailableLayerIds: ["fletcher"],
      status: "partial",
    });
  });

  it("matches only map-affecting fields", () => {
    const explore = builtInMapThemes[0];
    expect(matchTheme({
      layerIds: ["modern"],
      opacityOverrides: {},
      taxSaleEnabled: false,
      mapMode: "historical",
    }, builtInMapThemes)?.id).toBe("explore-nova-scotia");
  });
  ```

  The last expectation encodes that tax-sale mode is irrelevant while Tax Sale is off. Add assertions that visible IDs, supported opacity, enabled Tax Sale, and enabled Tax Sale mode do mark a setup modified.

- [ ] **Step 4: Run both focused files and confirm missing-module failures**

  ```bash
  npx vitest run src/themes/mapThemes.test.ts src/themes/themeState.test.ts
  ```

  Expected: FAIL because the new theme modules do not exist.

- [ ] **Step 5: Implement closed theme types and the five immutable definitions**

  ```ts
  import type { LayerCategoryId } from "../layers/layerCategories";
  import type { MapMode, ShareLayerId } from "../services/mapShareState";

  export type BuiltInMapThemeId =
    | "explore-nova-scotia"
    | "tax-sale-research"
    | "forestry-field-access"
    | "historical-maps"
    | "georeferencing";

  export interface MapThemeDefinition {
    id: string;
    kind: "built-in" | "custom";
    name: string;
    description: string;
    layerIds: readonly ShareLayerId[];
    opacityOverrides: Readonly<Partial<Record<ShareLayerId, number>>>;
    preferredCategoryIds: readonly LayerCategoryId[];
    taxSaleEnabled: boolean;
    mapMode: MapMode;
  }

  export const builtInMapThemes = [
    {
      id: "explore-nova-scotia",
      kind: "built-in",
      name: "Explore Nova Scotia",
      description: "A clean modern map for general exploration.",
      layerIds: ["modern"],
      opacityOverrides: {},
      preferredCategoryIds: ["background-maps"],
      taxSaleEnabled: false,
      mapMode: "current",
    },
    {
      id: "tax-sale-research",
      kind: "built-in",
      name: "Tax Sale Research",
      description: "Current notices with property, road, water, and building context.",
      layerIds: ["ns-aerial", "nsprd", "roads", "water-features", "buildings"],
      opacityOverrides: {},
      preferredCategoryIds: ["tax-sale", "land-property"],
      taxSaleEnabled: true,
      mapMode: "current",
    },
    {
      id: "forestry-field-access",
      kind: "built-in",
      name: "Forestry & Field Access",
      description: "Aerial, land, access, terrain, and old-growth policy context.",
      layerIds: ["ns-aerial", "nsprd", "crown-lands", "roads", "water-features", "contours", "old-growth-policy"],
      opacityOverrides: {},
      preferredCategoryIds: ["forestry-ecology", "land-property", "roads-places", "water-terrain"],
      taxSaleEnabled: false,
      mapMode: "current",
    },
    {
      id: "historical-maps",
      kind: "built-in",
      name: "Historical Maps",
      description: "Fletcher mapping with modern roads and place references.",
      layerIds: ["modern", "fletcher", "place-names", "main-roads"],
      opacityOverrides: {},
      preferredCategoryIds: ["historical-maps", "roads-places"],
      taxSaleEnabled: false,
      mapMode: "current",
    },
    {
      id: "georeferencing",
      kind: "built-in",
      name: "Georeferencing",
      description: "A clean reference setup for positioning your own maps.",
      layerIds: ["modern", "place-names", "main-roads"],
      opacityOverrides: {},
      preferredCategoryIds: ["my-maps", "background-maps", "roads-places"],
      taxSaleEnabled: false,
      mapMode: "current",
    },
  ] as const satisfies readonly MapThemeDefinition[];
  ```

  Implement `validateMapTheme()` to reject duplicate/unknown IDs, invalid opacity outside `0...1`, invalid categories, and both `modern` and `ns-aerial` together.

- [ ] **Step 6: Implement pure resolution and exact matching**

  ```ts
  export interface ThemeComparableState {
    layerIds: readonly ShareLayerId[];
    opacityOverrides: Readonly<Partial<Record<ShareLayerId, number>>>;
    taxSaleEnabled: boolean;
    mapMode: MapMode;
  }

  export interface ThemeCapabilities {
    licenceAccepted: boolean;
    availableLayerIds: ReadonlySet<ShareLayerId>;
    restrictedLayerIds: ReadonlySet<ShareLayerId>;
  }

  export interface ResolvedTheme {
    target: ThemeComparableState & {
      preferredCategoryIds: readonly LayerCategoryId[];
    };
    blockedLayerIds: ShareLayerId[];
    unavailableLayerIds: ShareLayerId[];
    status: "exact" | "partial";
  }

  export function resolveTheme(
    theme: MapThemeDefinition,
    capabilities: ThemeCapabilities,
  ): ResolvedTheme {
    const unavailableLayerIds = theme.layerIds.filter(
      (id) => !capabilities.availableLayerIds.has(id),
    );
    const blockedLayerIds = theme.layerIds.filter(
      (id) => capabilities.availableLayerIds.has(id)
        && capabilities.restrictedLayerIds.has(id)
        && !capabilities.licenceAccepted,
    );
    const excluded = new Set([...unavailableLayerIds, ...blockedLayerIds]);
    const layerIds = theme.layerIds.filter((id) => !excluded.has(id));

    return {
      target: {
        layerIds,
        opacityOverrides: Object.fromEntries(
          Object.entries(theme.opacityOverrides).filter(([id]) => layerIds.includes(id as ShareLayerId)),
        ),
        preferredCategoryIds: theme.preferredCategoryIds,
        taxSaleEnabled: theme.taxSaleEnabled,
        mapMode: theme.mapMode,
      },
      blockedLayerIds,
      unavailableLayerIds,
      status: excluded.size === 0 ? "exact" : "partial",
    };
  }
  ```

  `matchTheme()` must normalize layer order and opacity keys before comparison. It must compare `mapMode` only when `taxSaleEnabled` is true.

- [ ] **Step 7: Run focused and full tests**

  ```bash
  npx vitest run src/themes/mapThemes.test.ts src/themes/themeState.test.ts
  npm test
  ```

  Expected: PASS.

- [ ] **Step 8: Commit the pure theme model**

  ```bash
  git add web/src/services/mapShareState.ts web/src/themes
  git commit -m "feat(web): define built-in map themes"
  ```

---

## Task 3: Add the Versioned Custom-theme Repository

**Files:**

- Create: `web/src/themes/themeStorage.ts`
- Create: `web/src/themes/themeStorage.test.ts`
- Modify: `web/src/themes/mapThemes.ts`

- [ ] **Step 1: Write failing tests for validated reads, preservation, and CRUD**

  ```ts
  import { beforeEach, describe, expect, it } from "vitest";
  import {
    CUSTOM_THEME_STORAGE_KEY,
    createCustomTheme,
    deleteCustomTheme,
    duplicateCustomTheme,
    loadCustomThemes,
    renameCustomTheme,
    saveCustomThemes,
    updateCustomTheme,
  } from "./themeStorage";

  beforeEach(() => localStorage.clear());

  it("loads valid version-one themes and skips obsolete IDs with a warning", () => {
    localStorage.setItem(CUSTOM_THEME_STORAGE_KEY, JSON.stringify({
      version: 1,
      themes: [{
        id: "custom-1",
        name: "Field day",
        layerIds: ["modern", "removed-layer"],
        opacityOverrides: {},
        preferredCategoryIds: ["background-maps", "removed-category"],
        taxSaleEnabled: false,
        mapMode: "current",
      }],
    }));

    expect(loadCustomThemes(localStorage)).toMatchObject({
      themes: [{ id: "custom-1", layerIds: ["modern"], preferredCategoryIds: ["background-maps"] }],
      warning: expect.stringContaining("could not be restored"),
    });
  });

  it("does not overwrite corrupt raw storage", () => {
    localStorage.setItem(CUSTOM_THEME_STORAGE_KEY, "not-json");
    expect(loadCustomThemes(localStorage)).toEqual({
      themes: [],
      warning: "Your custom-theme library could not be loaded. Explore Nova Scotia is being used for this session.",
    });
    expect(localStorage.getItem(CUSTOM_THEME_STORAGE_KEY)).toBe("not-json");
  });

  it("creates, renames, updates, duplicates, and deletes without mutating inputs", () => {
    const created = createCustomTheme("Field day", {
      layerIds: ["modern"], opacityOverrides: {}, taxSaleEnabled: false, mapMode: "current",
    }, ["my-maps"], "custom-1");
    const renamed = renameCustomTheme([created], created.id, "Woodlot");
    const updated = updateCustomTheme(renamed, created.id, {
      layerIds: ["ns-aerial"], opacityOverrides: {}, taxSaleEnabled: false, mapMode: "current",
    }, ["forestry-ecology"]);
    const duplicated = duplicateCustomTheme(updated, created.id, "custom-2");
    expect(deleteCustomTheme(duplicated, created.id)).toHaveLength(1);
    expect(created.name).toBe("Field day");
  });
  ```

  Add tests for duplicate IDs, empty names, invalid modes, opacity bounds, unavailable storage reads, and quota/write failure. A write failure must return an error result and leave the in-memory list usable.

- [ ] **Step 2: Run the focused test and confirm the missing-module failure**

  ```bash
  npx vitest run src/themes/themeStorage.test.ts
  ```

  Expected: FAIL because `themeStorage.ts` does not exist.

- [ ] **Step 3: Implement the version-one schema and non-destructive loader**

  ```ts
  export const CUSTOM_THEME_STORAGE_KEY = "ns-marks-the-spot:custom-themes";

  interface StoredThemeLibraryV1 {
    version: 1;
    themes: StoredCustomThemeV1[];
  }

  export interface CustomThemeLoadResult {
    themes: MapThemeDefinition[];
    warning: string | null;
  }

  export function loadCustomThemes(storage: Storage): CustomThemeLoadResult {
    let raw: string | null;
    try {
      raw = storage.getItem(CUSTOM_THEME_STORAGE_KEY);
    } catch {
      return { themes: [], warning: THEME_LIBRARY_LOAD_WARNING };
    }
    if (raw === null) return { themes: [], warning: null };

    try {
      return parseStoredThemeLibrary(JSON.parse(raw));
    } catch {
      return { themes: [], warning: THEME_LIBRARY_LOAD_WARNING };
    }
  }
  ```

  Validation must use `isShareLayerId()` and `isLayerCategoryId()`. Keep valid fields when an ID has been removed, report the skipped names, and never call `removeItem()` or `setItem()` during a read.

- [ ] **Step 4: Implement pure CRUD and explicit writes**

  ```ts
  export type ThemeSaveResult =
    | { ok: true }
    | { ok: false; message: string };

  export function saveCustomThemes(
    themes: readonly MapThemeDefinition[],
    storage: Storage,
  ): ThemeSaveResult {
    const document: StoredThemeLibraryV1 = {
      version: 1,
      themes: themes.map(toStoredTheme),
    };
    try {
      storage.setItem(CUSTOM_THEME_STORAGE_KEY, JSON.stringify(document));
      return { ok: true };
    } catch {
      return { ok: false, message: "Your custom themes could not be saved in this browser." };
    }
  }
  ```

  All CRUD functions return new arrays. Built-in themes are never accepted by the repository functions. `createCustomTheme()` uses `crypto.randomUUID()` in production and accepts an injected ID in tests.

- [ ] **Step 5: Run focused and full tests**

  ```bash
  npx vitest run src/themes/themeStorage.test.ts
  npm test
  ```

  Expected: PASS.

- [ ] **Step 6: Commit browser-local custom themes**

  ```bash
  git add web/src/themes/mapThemes.ts web/src/themes/themeStorage.ts web/src/themes/themeStorage.test.ts
  git commit -m "feat(web): persist custom map themes"
  ```

---

## Task 4: Make Tax Sale Explicit in Shared and Startup State

**Files:**

- Modify: `web/src/services/mapShareState.ts`
- Modify: `web/src/services/mapShareState.test.ts`
- Modify: `web/src/services/printSnapshot.ts`
- Modify: `web/src/services/printSnapshot.test.ts`
- Modify: `web/src/App.tsx`
- Modify: `web/src/App.test.tsx`

- [ ] **Step 1: Write parser tests for first visits, new links, and legacy links**

  ```ts
  it("keeps Tax Sale off on a first visit", () => {
    expect(parseMapShareState("https://example.test/").taxSaleEnabled).toBe(false);
  });

  it("restores the explicit Tax Sale field", () => {
    expect(parseMapShareState("https://example.test/?taxSale=on").taxSaleEnabled).toBe(true);
    expect(parseMapShareState("https://example.test/?taxSale=off&mode=historical").taxSaleEnabled).toBe(false);
  });

  it("enables Tax Sale for legacy mode and event links", () => {
    expect(parseMapShareState("https://example.test/?mode=current").taxSaleEnabled).toBe(true);
    expect(parseMapShareState("https://example.test/?event=event-1").taxSaleEnabled).toBe(true);
  });

  it("writes the explicit field for every new link", () => {
    expect(buildMapShareUrl("https://example.test/", {
      taxSaleEnabled: false,
      mode: "current",
      pid: null,
      eventIds: [],
      layerIds: ["modern"],
      position: DEFAULT_MAP_POSITION,
    })).toContain("taxSale=off");
  });

  it("distinguishes a first visit from recognized shared state", () => {
    expect(hasRecognizedMapShareState("https://example.test/")).toBe(false);
    expect(hasRecognizedMapShareState("https://example.test/?layers=modern")).toBe(true);
    expect(hasRecognizedMapShareState("https://example.test/?taxSale=off")).toBe(true);
  });
  ```

- [ ] **Step 2: Run the share-state tests and confirm the new assertions fail**

  ```bash
  npx vitest run src/services/mapShareState.test.ts src/services/printSnapshot.test.ts
  ```

  Expected: FAIL because `MapShareState` has no `taxSaleEnabled` field.

- [ ] **Step 3: Add the explicit field and compatibility parser**

  ```ts
  export interface MapShareState {
    taxSaleEnabled: boolean;
    mode: MapMode;
    pid: string | null;
    eventIds: string[];
    layerIds: ShareLayerId[];
    position: MapPosition | null;
  }

  const explicitTaxSale = url.searchParams.get("taxSale");
  const taxSaleEnabled = explicitTaxSale === "on"
    ? true
    : explicitTaxSale === "off"
      ? false
      : url.searchParams.has("mode") || url.searchParams.has("event");

  const recognizedShareKeys = [
    "taxSale", "mode", "event", "pid", "layers", "position",
  ] as const;

  export function hasRecognizedMapShareState(value: string): boolean {
    const parsed = new URL(value, "https://example.invalid");
    return recognizedShareKeys.some((key) => parsed.searchParams.has(key));
  }
  ```

  `buildMapShareUrl()` must always write `taxSale=on` or `taxSale=off`. Add `taxSaleEnabled` to print capture types and `buildPrintMapShareUrl()` so print receipts preserve the same state.

- [ ] **Step 4: Write an App integration test for default-off requests**

  ```tsx
  it("starts with Explore Nova Scotia and performs no tax-sale geometry request", async () => {
    localStorage.setItem(PROVINCE_LICENSE_ACCEPTANCE_KEY, "accepted");
    window.history.replaceState(null, "", "/");
    render(<App />);

    await waitFor(() => expect(fetchParcels).not.toHaveBeenCalled());
    expect(screen.getByTestId("map-canvas")).toHaveTextContent("Map PID count: 0");
    expect(screen.getByTestId("map-canvas")).toHaveTextContent("tax-sale layer: off");
  });
  ```

  Extend the existing `MapCanvas` test mock to destructure `showTaxSale` and print `tax-sale layer: on|off`. The explicit shutdown and selected-PID preservation test belongs in Task 8, when the master control exists.

  During this task, set the existing broad `App.test.tsx` `beforeEach` URL to the legacy `/?mode=current` where an old test intentionally exercises tax-sale behavior. Set `/` explicitly in every new first-visit test. This preserves old coverage while the remaining UI is migrated task by task.

- [ ] **Step 5: Gate request effects, renderer props, and serialized event state**

  Add App state from the parser:

  ```ts
  const [taxSaleEnabled, setTaxSaleEnabled] = useState(
    initialShareState.taxSaleEnabled,
  );

  const disableTaxSale = useCallback(() => {
    setTaxSaleEnabled(false);
    setSelectedEventIds(new Set());
    setTaxSaleFilter("all");
    setHistoricalMunicipality("all");
    setHistoricalYear("all");
    setHistoricalOutcome("all");
    setHistoricalParcelMessage(null);
  }, []);
  ```

  Gate both current and historical tax PID fetch effects on `taxSaleEnabled`. Pass false/empty tax-sale collections to `MapCanvas` when off. Do not clear `selectedPid`. Include `taxSaleEnabled` in `buildMapShareUrl()` and omit event IDs from the URL while off. `disableTaxSale()` is wired to the master control in Task 8; until then, theme application can call it through the App-level theme commit added in Task 5.

- [ ] **Step 6: Run focused, full, lint, and build checks**

  ```bash
  npx vitest run src/services/mapShareState.test.ts src/services/printSnapshot.test.ts src/App.test.tsx
  npm test
  npm run lint
  npm run build
  ```

  Expected: PASS. The build must contain no TypeScript call site missing `taxSaleEnabled`.

- [ ] **Step 7: Commit the explicit Tax Sale state**

  ```bash
  git add web/src/services/mapShareState.ts web/src/services/mapShareState.test.ts web/src/services/printSnapshot.ts web/src/services/printSnapshot.test.ts web/src/App.tsx web/src/App.test.tsx
  git commit -m "feat(web): make tax sale opt in"
  ```

---

## Task 5: Orchestrate Atomic Theme Application and Licence Continuation

**Files:**

- Create: `web/src/components/MapThemePicker.tsx`
- Create: `web/src/components/MapThemePicker.test.tsx`
- Modify: `web/src/themes/themeState.ts`
- Modify: `web/src/themes/themeState.test.ts`
- Modify: `web/src/App.tsx`
- Modify: `web/src/App.test.tsx`
- Modify: `web/src/styles.css`

- [ ] **Step 1: Add tests for converting one theme target into every visibility record**

  Add one generic helper to `themeState.ts` and test it against each existing catalogue record:

  ```ts
  export function visibilityRecordFor<T extends string>(
    ids: readonly T[],
    visibleLayerIds: ReadonlySet<string>,
  ): Record<T, boolean> {
    return Object.fromEntries(ids.map((id) => [id, visibleLayerIds.has(id)])) as Record<T, boolean>;
  }
  ```

  ```ts
  it("builds a complete visibility record instead of patching the old one", () => {
    expect(visibilityRecordFor(["roads", "water-features"], new Set(["roads"]))).toEqual({
      roads: true,
      "water-features": false,
    });
  });
  ```

- [ ] **Step 2: Write a failing test for the built-in Map setup selector**

  ```tsx
  it("selects a built-in setup and announces its status", async () => {
    const onSelect = vi.fn();
    render(<MapThemePicker
      themes={builtInMapThemes}
      activeThemeId="explore-nova-scotia"
      status="exact"
      notice={null}
      onSelect={onSelect}
      onReset={() => {}}
    />);
    await userEvent.selectOptions(screen.getByLabelText("Map setup"), "historical-maps");
    expect(onSelect).toHaveBeenCalledWith("historical-maps");
    expect(screen.getByRole("status")).toHaveTextContent("Explore Nova Scotia");
  });
  ```

  Run `npx vitest run src/components/MapThemePicker.test.tsx`; expect failure because the component does not exist.

- [ ] **Step 3: Implement the text-only built-in selector**

  Implement `MapThemePicker` with a labelled `<select>`, the built-in options, an `aria-live="polite"` status line, the active description, and a Reset button only when status is `modified` or `partial`. Task 6 extends the same component with custom-theme actions; do not create a second setup control.

- [ ] **Step 4: Write App tests for coherent application and the licence branch**

  ```tsx
  it("applies Explore in one committed render", async () => {
    window.history.replaceState(null, "", "/?taxSale=on&mode=current&layers=ns-aerial,nsprd,roads,water-features");
    render(<App />);

    observedInteractiveMapStates.length = 0;
    await userEvent.selectOptions(screen.getByLabelText("Map setup"), "explore-nova-scotia");
    expect(observedInteractiveMapStates).toEqual([
      "modern:on;ns-aerial:off;nsprd:off;roads:off;water:off;tax-sale:off",
    ]);
  });

  it("defers a restricted theme until the one licence decision", async () => {
    window.history.replaceState(null, "", "/");
    render(<App />);
    await userEvent.selectOptions(screen.getByLabelText("Map setup"), "forestry-field-access");
    expect(screen.getByRole("dialog", { name: /province data licence/i })).toBeInTheDocument();
    expect(screen.getByLabelText("Modern map")).toBeChecked();

    await userEvent.click(screen.getByRole("button", { name: /accept/i }));
    expect(screen.getByLabelText("NS Aerial")).toBeChecked();
    expect(screen.getByLabelText("Old-growth policy areas")).toBeChecked();
  });

  it("applies the unrestricted subset and names blocked layers after refusal", async () => {
    render(<App />);
    await userEvent.selectOptions(screen.getByLabelText("Map setup"), "historical-maps");
    await userEvent.click(screen.getByRole("button", { name: /continue without/i }));
    expect(screen.getByLabelText("Modern map")).toBeChecked();
    expect(screen.getByRole("status")).toHaveTextContent(/Place Names.*Main Roads/i);
  });
  ```

  Also assert that the first visit does not open the Province licence dialog.

  Add a `vi.hoisted()` `observedInteractiveMapStates: string[]` to the existing `MapCanvas` mock. Clear it immediately before the user action and append one normalized string during each interactive render. This makes an intermediate mixed theme visible as an extra array entry.

- [ ] **Step 5: Replace startup licence prompting with on-demand intent**

  ```ts
  type LicenceIntent =
    | { kind: "theme"; themeId: string }
    | { kind: "layer" }
    | null;

  const [licenceDialogOpen, setLicenceDialogOpen] = useState(false);
  const [licenceIntent, setLicenceIntent] = useState<LicenceIntent>(null);
  ```

  Direct restricted-layer toggles set `{ kind: "layer" }`. Theme selection sets `{ kind: "theme", themeId }` only when its currently available restricted IDs require acceptance. Accepting a theme intent applies the full theme; refusing applies the resolved unrestricted subset. Both paths close the dialog, clear the intent, and return focus to Map setup.

  Build capabilities from the authoritative catalogues, not a handwritten theme-only list:

  ```ts
  const availableThemeLayerIds = new Set<ShareLayerId>([
    "modern",
    "fletcher",
    ...provinceLayerCatalog.map(({ id }) => id),
    ...allResourceLayerCatalog.map(({ id }) => id),
    ...hydroPilotLayerCatalog.map(({ id }) => id),
    ...floodHazardLayerCatalog.map(({ id }) => id),
    ...environmentalHealthLayerCatalog.map(({ id }) => id),
    ...forestryLayerCatalog.map(({ id }) => id),
    ...zoningLayerCatalog.map(({ id }) => id),
    ...wellLogLayerCatalog.map(({ id }) => id),
  ]);
  if (!fletcherTileConfiguration.baseUrl) availableThemeLayerIds.delete("fletcher");

  const restrictedThemeLayerIds = new Set<ShareLayerId>([
    ...provinceLayerCatalog.map(({ id }) => id),
    ...allResourceLayerCatalog
      .filter((layer) => "requiresProvinceLicence" in layer && layer.requiresProvinceLicence)
      .map(({ id }) => id),
    ...floodHazardLayerCatalog
      .filter(({ licence }) => licence === "province-restricted")
      .map(({ id }) => id),
    ...environmentalHealthLayerCatalog
      .filter(({ licence }) => licence === "province-restricted")
      .map(({ id }) => id),
  ]);
  ```

- [ ] **Step 6: Implement one synchronous App-level theme commit**

  ```ts
  const applyResolvedTheme = useCallback((resolved: ResolvedTheme) => {
    const visible = new Set(resolved.target.layerIds);
    setShowModernMap(visible.has("modern"));
    setFletcherVisible(visible.has("fletcher"));
    setProvinceLayers(visibilityRecordFor(provinceLayerCatalog.map(({ id }) => id), visible));
    setResourceLayers(visibilityRecordFor(allResourceLayerCatalog.map(({ id }) => id), visible));
    setHydroPilotLayers(visibilityRecordFor(hydroPilotLayerCatalog.map(({ id }) => id), visible));
    setFloodHazardLayers(visibilityRecordFor(floodHazardLayerCatalog.map(({ id }) => id), visible));
    setEnvironmentalHealthLayers(visibilityRecordFor(environmentalHealthLayerCatalog.map(({ id }) => id), visible));
    setForestryLayers(visibilityRecordFor(forestryLayerCatalog.map(({ id }) => id), visible));
    setZoningLayers(visibilityRecordFor(zoningLayerCatalog.map(({ id }) => id), visible));
    setWellLogLayers(visibilityRecordFor(wellLogLayerCatalog.map(({ id }) => id), visible));
    setFletcherOpacity(resolved.target.opacityOverrides.fletcher ?? 1);
    setExpandedCategoryIds(new Set(resolved.target.preferredCategoryIds));
    setTaxSaleEnabled(resolved.target.taxSaleEnabled);
    setMapMode(resolved.target.mapMode);
    setSelectedEventIds(
      resolved.target.taxSaleEnabled && resolved.target.mapMode === "current"
        ? new Set(upcomingEvents.map(({ id }) => id))
        : new Set(),
    );
    setThemeResult(resolved);
  }, [upcomingTaxSaleEvents]);
  ```

  Import the eight catalogue arrays already used by App. All setters must remain inside this one callback. Do not introduce an effect that watches selected theme ID.

- [ ] **Step 7: Derive exact, modified, shared, and partial labels**

  Build `ThemeComparableState` from `activeLayerIds`, supported opacity overrides, `taxSaleEnabled`, and `mapMode`. Derive initial intent before creating visibility state:

  ```ts
  const hasRecognizedShareState = hasRecognizedMapShareState(initialUrl.href);
  const initialCatalogueLayerIds = new Set<ShareLayerId>(
    hasRecognizedShareState ? initialShareState.layerIds : ["modern"],
  );
  const initialTaxSaleEnabled = hasRecognizedShareState
    ? initialShareState.taxSaleEnabled
    : false;
  ```

  Use `initialCatalogueLayerIds` in every visibility `useState` initializer, so Explore appears in the first committed render rather than through a mount effect. Match a known theme or label the state Shared setup when recognized URL fields exist; label it Explore Nova Scotia when none exist. A recognized URL containing restricted layers may open the existing licence decision after mount, but an ordinary first visit must not. After a manual map-affecting change, show `<theme name> — Modified`. Event filters, map position, expanded categories, and imported-map visibility are deliberately absent from the comparison.

- [ ] **Step 8: Run focused and full checks**

  ```bash
  npx vitest run src/components/MapThemePicker.test.tsx src/themes/themeState.test.ts src/App.test.tsx
  npm test
  npm run lint
  npm run build
  ```

  Expected: PASS, including no first-load licence dialog and one-prompt theme application.

- [ ] **Step 9: Commit theme orchestration**

  ```bash
  git add web/src/components/MapThemePicker.tsx web/src/components/MapThemePicker.test.tsx web/src/themes/themeState.ts web/src/themes/themeState.test.ts web/src/App.tsx web/src/App.test.tsx web/src/styles.css
  git commit -m "feat(web): apply map themes atomically"
  ```

---

## Task 6: Extend Map Setup with Custom-theme Management

**Files:**

- Modify: `web/src/components/MapThemePicker.tsx`
- Modify: `web/src/components/MapThemePicker.test.tsx`
- Create: `web/src/components/ThemeManagerDialog.tsx`
- Create: `web/src/components/ThemeManagerDialog.test.tsx`
- Modify: `web/src/App.tsx`
- Modify: `web/src/App.test.tsx`
- Modify: `web/src/styles.css`
- Modify: `web/src/styles.test.ts`

- [ ] **Step 1: Extend the theme-picker tests for custom themes and management actions**

  ```tsx
  it("renders built-in and custom themes and announces modification", async () => {
    const onSelect = vi.fn();
    render(<MapThemePicker
      themes={[...builtInMapThemes, customTheme]}
      activeThemeId="explore-nova-scotia"
      status="modified"
      notice={null}
      onSelect={onSelect}
      onSave={() => {}}
      onReset={() => {}}
      onManage={() => {}}
    />);

    expect(screen.getByLabelText("Map setup")).toHaveValue("explore-nova-scotia");
    expect(screen.getByRole("status")).toHaveTextContent("Explore Nova Scotia — Modified");
    await userEvent.selectOptions(screen.getByLabelText("Map setup"), customTheme.id);
    expect(onSelect).toHaveBeenCalledWith(customTheme.id);
  });
  ```

  Assert that Reset appears only for modified/partial states, Save is always available, custom themes are grouped separately, and the status is textually announced.

- [ ] **Step 2: Write dialog tests for every custom-theme action**

  Render `ThemeManagerDialog` with one custom theme and assert exact callbacks for save, rename, update from the current state, duplicate, delete confirmation, cancel, Escape, and focus return. Built-in themes must not appear in editable rows.

- [ ] **Step 3: Run the focused component tests and confirm the new assertions fail**

  ```bash
  npx vitest run src/components/MapThemePicker.test.tsx src/components/ThemeManagerDialog.test.tsx
  ```

  Expected: `ThemeManagerDialog` is missing and `MapThemePicker` lacks the new custom-theme actions.

- [ ] **Step 4: Extend the existing text-only Map setup control**

  ```tsx
  export function MapThemePicker(props: MapThemePickerProps) {
    const active = props.themes.find(({ id }) => id === props.activeThemeId);
    const label = props.status === "modified"
      ? `${active?.name ?? "Shared setup"} — Modified`
      : props.status === "partial"
        ? `${active?.name ?? "Shared setup"} — Partially applied`
        : active?.name ?? "Shared setup";

    return (
      <section className="map-theme-picker" aria-labelledby="map-setup-heading">
        <h2 id="map-setup-heading">Map setup</h2>
        <label>
          <span className="sr-only">Map setup</span>
          <select value={props.activeThemeId ?? "shared"} onChange={(event) => props.onSelect(event.target.value)}>
            <optgroup label="Built-in themes">
              {props.themes.filter(({ kind }) => kind === "built-in").map((theme) => (
                <option key={theme.id} value={theme.id}>{theme.name}</option>
              ))}
            </optgroup>
            {props.themes.some(({ kind }) => kind === "custom") ? (
              <optgroup label="My themes">
                {props.themes.filter(({ kind }) => kind === "custom").map((theme) => (
                  <option key={theme.id} value={theme.id}>{theme.name}</option>
                ))}
              </optgroup>
            ) : null}
          </select>
        </label>
        <p aria-live="polite" role="status">{label}</p>
        <div className="map-theme-actions">
          <button type="button" onClick={props.onSave}>Save current setup as…</button>
          <button type="button" onClick={props.onManage}>Manage themes</button>
          {props.status === "modified" || props.status === "partial" ? (
            <button type="button" onClick={props.onReset}>Reset current theme</button>
          ) : null}
        </div>
      </section>
    );
  }
  ```

  Replace Task 5's built-in-only option list with the grouped list above and extend its props with `onSave` and `onManage`. Use words, not theme artwork or icon-only buttons.

- [ ] **Step 5: Implement the custom-theme dialog and connect repository writes**

  The dialog takes the current `ThemeComparableState` and expanded category IDs from App. App calls the pure CRUD function, then calls `saveCustomThemes()`. Only replace in-memory themes when the write succeeds; on failure, retain the current list and show the returned message.

  ```ts
  function persistCustomThemes(nextThemes: MapThemeDefinition[]) {
    const result = saveCustomThemes(nextThemes, window.localStorage);
    if (!result.ok) {
      setThemeNotice(result.message);
      return false;
    }
    setCustomThemes(nextThemes);
    return true;
  }
  ```

  Saving captures only shareable catalogue IDs, supported catalogue opacity, category suggestions, Tax Sale enabled state, and map mode. It must not read user-map objects, position, PID, event IDs, filters, or licence acceptance.

- [ ] **Step 6: Add compact text-only styles and static style tests**

  Add `.map-theme-picker`, `.map-theme-actions`, and `.theme-manager-*` rules. Extend `styles.test.ts` to assert visible `:focus-visible` styling and a minimum `44px` control height on the phone breakpoint. Do not use background images.

- [ ] **Step 7: Add App integration coverage for all custom-theme actions**

  Test save, rename, update, duplicate, delete, reset, page reload, corrupt-library warning, and share URL updates. Assert custom theme JSON contains neither an imported map name nor its blob/object URL.

- [ ] **Step 8: Run focused and full checks**

  ```bash
  npx vitest run src/components/MapThemePicker.test.tsx src/components/ThemeManagerDialog.test.tsx src/styles.test.ts src/App.test.tsx
  npm test
  npm run lint
  npm run build
  ```

  Expected: PASS.

- [ ] **Step 9: Commit Map setup and custom-theme UI**

  ```bash
  git add web/src/components/MapThemePicker.tsx web/src/components/MapThemePicker.test.tsx web/src/components/ThemeManagerDialog.tsx web/src/components/ThemeManagerDialog.test.tsx web/src/App.tsx web/src/App.test.tsx web/src/styles.css web/src/styles.test.ts
  git commit -m "feat(web): add customizable map setup"
  ```

---

## Task 7: Replace the Flat Layer List with Accessible Categories

**Files:**

- Create: `web/src/components/LayerCategorySection.tsx`
- Create: `web/src/components/LayerCategorySection.test.tsx`
- Modify: `web/src/App.tsx`
- Modify: `web/src/App.test.tsx`
- Modify: `web/src/styles.css`
- Modify: `web/src/styles.test.ts`
- Reuse: `web/src/components/LayerRows.tsx`

- [ ] **Step 1: Write category disclosure tests**

  ```tsx
  it("uses a real disclosure button with a textual summary", async () => {
    const onExpandedChange = vi.fn();
    render(<LayerCategorySection
      id="land-property"
      name="Land & Property"
      description="Property, Crown land, buildings, and zoning."
      summary="3 on"
      expanded={false}
      onExpandedChange={onExpandedChange}
    ><div>Property controls</div></LayerCategorySection>);

    const button = screen.getByRole("button", { name: /Land & Property.*3 on/i });
    expect(button).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(button);
    expect(onExpandedChange).toHaveBeenCalledWith(true);
  });
  ```

  Add cases for `Off`, `Add`, and an availability warning. The content region must be labelled by the heading button.

- [ ] **Step 2: Implement the controlled category component**

  ```tsx
  export function LayerCategorySection({
    id, name, description, summary, expanded, onExpandedChange, children,
  }: LayerCategorySectionProps) {
    const buttonId = `layer-category-${id}-button`;
    const panelId = `layer-category-${id}-panel`;
    return (
      <section className="layer-category" data-category-id={id}>
        <h3>
          <button
            id={buttonId}
            type="button"
            aria-expanded={expanded}
            aria-controls={panelId}
            onClick={() => onExpandedChange(!expanded)}
          >
            <span>{name}</span><span>{summary}</span>
          </button>
        </h3>
        {expanded && <div id={panelId} role="region" aria-labelledby={buttonId}>
          <p>{description}</p>{children}
        </div>}
      </section>
    );
  }
  ```

- [ ] **Step 3: Write App tests that locate every existing control in one category**

  Use `within(screen.getByRole("region", { name: "Land & Property" }))` and the other category regions. Assert that `NS Property Boundaries` appears only in Land & Property, `Roads, Trails & Culverts` only in Roads & Places, `Old-growth policy areas` only in Forestry & Ecology, and Fletcher/Church controls only in Historical Maps. Assert collapsed summaries change from `Off` to `1 on` after a toggle.

- [ ] **Step 4: Regroup existing rows without changing their render order or service logic**

  Keep every existing toggle component and source disclosure. Replace the single long JSX list with one `LayerCategorySection` per registry entry. Category placement must use `layerCategoryByLayerId`; avoid a second category decision inside the JSX.

  ```ts
  function categorySummary(categoryId: LayerCategoryId): string {
    if (categoryId === "my-maps") return userMapCount + userVectorCount === 0 ? "Add" : `${userMapCount + userVectorCount} added`;
    if (categoryId === "tax-sale") return taxSaleEnabled ? "On" : "Off";
    const count = activeLayerIds.filter((id) => layerCategoryByLayerId[id] === categoryId).length;
    return count === 0 ? "Off" : `${count} on`;
  }
  ```

  Preserve the catalogue renderer ordering in `MapCanvas`; only the panel organization changes.

- [ ] **Step 5: Keep provenance compact inside each ordinary row**

  Reuse `LayerToggle`, `FletcherLayerControl`, and the specialized existing controls. Retain their one-line caveat/status and collapsed Source & scale disclosure. Remove only redundant outer `<details>` groupings that conflict with the new category; do not remove metadata or official links.

- [ ] **Step 6: Add desktop category styles and run checks**

  ```bash
  npx vitest run src/components/LayerCategorySection.test.tsx src/styles.test.ts src/App.test.tsx
  npm test
  npm run lint
  npm run build
  ```

  Expected: PASS. Desktop shows a scannable category list, and keyboard focus is visible.

- [ ] **Step 7: Commit categorized layer presentation**

  ```bash
  git add web/src/components/LayerCategorySection.tsx web/src/components/LayerCategorySection.test.tsx web/src/App.tsx web/src/App.test.tsx web/src/styles.css web/src/styles.test.ts
  git commit -m "feat(web): organize layers into categories"
  ```

---

## Task 8: Move Every Tax-sale Surface Behind Its Category Master

**Files:**

- Modify: `web/src/App.tsx`
- Modify: `web/src/App.test.tsx`
- Modify: `web/src/styles.css`
- Reuse: existing Tax Sale components and services

- [ ] **Step 1: Add an exhaustive off-state integration test**

  ```tsx
  it("removes every tax-sale surface when the category master is off", async () => {
    window.history.replaceState(null, "", "/?taxSale=on&mode=current&pid=12345678&event=middleton-2026-08-20");
    render(<App />);
    await screen.findByText(/Current Notices/);
    vi.mocked(fetchParcels).mockClear();
    await userEvent.click(screen.getByLabelText("Show tax-sale information"));
    expect(fetchParcels).not.toHaveBeenCalled();
    expect(screen.getByTestId("map-canvas")).toHaveTextContent("tax-sale layer: off");
    expect(screen.getByTestId("map-canvas")).toHaveTextContent("historical layer: off");
    expect(screen.queryByText(/tax-sale listing/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("group", { name: /current notices or historical records/i })).not.toBeInTheDocument();
    expect(screen.getByTestId("map-canvas")).toHaveTextContent("selected PID: 12345678");
  });
  ```

  Extend the existing `MapCanvas` mock to print its `showTaxSale` and `selectedPid` props. Clear `fetchParcels` immediately before clicking, then assert it was not called.

- [ ] **Step 2: Add a test for enabling Current Notices dynamically**

  Tax Sale Research and the manual master switch must select the currently loaded upcoming event IDs at application time. The theme itself must contain no dated IDs.

  ```tsx
  await userEvent.selectOptions(screen.getByLabelText("Map setup"), "tax-sale-research");
  await acceptProvinceLicence();
  expect(screen.getByLabelText("Show tax-sale information")).toBeChecked();
  expect(window.location.search).toContain("event=middleton-2026-08-20");
  expect(JSON.stringify(builtInMapThemes)).not.toContain("middleton-2026-08-20");
  ```

- [ ] **Step 3: Move the existing mode switch, event controls, lists, filters, and provenance into Tax Sale**

  The category's first control is:

  ```tsx
  <label className="tax-sale-master">
    <input
      type="checkbox"
      checked={taxSaleEnabled}
      aria-controls="tax-sale-dependent-controls"
      onChange={(event) => event.target.checked ? enableTaxSale() : disableTaxSale()}
    />
    <span>Show tax-sale information</span>
  </label>
  ```

  Render the existing Current Notices/Historical Records switcher and all dependent sections only inside `id="tax-sale-dependent-controls"` while enabled. Remove the separate top-level map-mode switcher.

- [ ] **Step 4: Gate all derived tax-sale contexts, not only geometry props**

  Compute empty values while off for current PIDs, historical PIDs, listing context, historical listing contexts, print event IDs, notice AAN lookup, evidence tax-sale context, and tax-sale parcel styling. Preserve `selectedPid` and the ordinary NSPRD parcel inspector.

  ```ts
  const effectiveTaxSalePids = taxSaleEnabled ? upcomingTaxSalePids : new Set<string>();
  const effectiveHistoricalTaxSalePids = taxSaleEnabled ? historicalTaxSalePids : new Set<string>();
  const effectiveListingContext = taxSaleEnabled ? selectedListingContext : undefined;
  const effectiveHistoricalContexts = taxSaleEnabled ? historicalListingContexts : [];
  ```

- [ ] **Step 5: Verify master shutdown and category-only placement**

  ```bash
  npx vitest run src/App.test.tsx
  npm test
  npm run lint
  npm run build
  ```

  Expected: PASS. No test may locate a tax-sale mode/filter control outside the Tax Sale region.

- [ ] **Step 6: Commit the Tax Sale category boundary**

  ```bash
  git add web/src/App.tsx web/src/App.test.tsx web/src/styles.css
  git commit -m "feat(web): contain tax sale tools in one category"
  ```

---

## Task 9: Integrate My Maps and Phone-focused Category Navigation

**Files:**

- Modify: `web/src/userMaps/components/UserMapRows.tsx`
- Modify: `web/src/userMaps/components/UserMapRows.test.tsx`
- Modify: `web/src/userMaps/vector/components/UserVectorRows.tsx`
- Modify: `web/src/userMaps/vector/components/UserVectorRows.test.tsx`
- Modify: `web/src/components/LayerCategorySection.tsx`
- Modify: `web/src/components/LayerCategorySection.test.tsx`
- Modify: `web/src/App.tsx`
- Modify: `web/src/App.test.tsx`
- Modify: `web/src/styles.css`
- Modify: `web/src/styles.test.ts`

- [ ] **Step 1: Refactor user-map components to expose controls without nested category ownership**

  Export inner components while retaining their existing data hooks and row behavior. Cut each current `resource-layer-controls` element, including every child, intact into the corresponding new component; the existing `UserMapRows` and `UserVectorRows` wrappers then call the new component during the transition:

  ```tsx
  export function UserMapControls(props: UserMapRowsProps) {
    return <div className="resource-layer-controls">{renderUserMapControls(props)}</div>;
  }

  export function UserVectorControls(props: UserVectorRowsProps) {
    return <div className="resource-layer-controls">{renderUserVectorControls(props)}</div>;
  }
  ```

  Extract the current inline prop objects as exported `UserMapRowsProps` and `UserVectorRowsProps` types. `renderUserMapControls()` and `renderUserVectorControls()` are private functions containing the unchanged current children; this avoids duplicating the long row implementation. Remove the outer `resource-layer-group` disclosures only after App renders both controls inside the single My Maps category. Update component tests to query their buttons and rows directly.

- [ ] **Step 2: Add an imported-map preservation test**

  Seed the existing IndexedDB test store with a named GeoPDF/raster record, render it in My Maps, apply Forestry & Field Access, then reset to Explore. Assert the record still exists, its registration is unchanged, and its prior visibility/opacity remain unchanged. Assert the saved custom-theme JSON does not contain the record name, bytes, object URL, or file path.

- [ ] **Step 3: Write mobile category-focus tests**

  ```tsx
  it("shows one focused category and a Back control in phone mode", async () => {
    setMatchMedia("(max-width: 860px)", true);
    render(<App />);
    await userEvent.click(screen.getByRole("button", { name: /Historical Maps/ }));
    expect(screen.getByRole("button", { name: "Back to categories" })).toHaveFocus();
    expect(screen.getByRole("region", { name: "Historical Maps" })).toBeVisible();
    expect(screen.queryByRole("button", { name: /Land & Property/ })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Back to categories" }));
    expect(screen.getByRole("button", { name: /Historical Maps/ })).toHaveFocus();
  });
  ```

  Use the project's existing media-query mocking convention. Also assert that toggling a layer does not dismiss the bottom sheet or leave focused-category mode.

- [ ] **Step 4: Implement one mobile focus state shared by all categories**

  ```ts
  const [focusedCategoryId, setFocusedCategoryId] = useState<LayerCategoryId | null>(null);
  const categoryButtonRefs = useRef(new Map<LayerCategoryId, HTMLButtonElement>());

  function returnToCategories() {
    const previousId = focusedCategoryId;
    setFocusedCategoryId(null);
    requestAnimationFrame(() => categoryButtonRefs.current.get(previousId!)?.focus());
  }
  ```

  In phone layout, selecting a category renders only that category with a text button labelled `Back to categories`. Focus the Back button on entry and restore focus to the category button on exit. Desktop continues to show independent controlled disclosures.

- [ ] **Step 5: Add responsive styles and accessibility assertions**

  Add `.layer-category-back`, `.layer-category-list--focused`, and phone-only rules under the existing `max-width: 860px` bottom-sheet breakpoint. The map remains visible behind the existing sheet. Category and Back controls have at least a 44-pixel target, status is not colour-only, and `:focus-visible` remains obvious.

- [ ] **Step 6: Run focused and full checks**

  ```bash
  npx vitest run src/userMaps/components/UserMapRows.test.tsx src/userMaps/vector/components/UserVectorRows.test.tsx src/components/LayerCategorySection.test.tsx src/styles.test.ts src/App.test.tsx
  npm test
  npm run lint
  npm run build
  ```

  Expected: PASS.

- [ ] **Step 7: Commit My Maps and phone navigation**

  ```bash
  git add web/src/userMaps/components/UserMapRows.tsx web/src/userMaps/components/UserMapRows.test.tsx web/src/userMaps/vector/components/UserVectorRows.tsx web/src/userMaps/vector/components/UserVectorRows.test.tsx web/src/components/LayerCategorySection.tsx web/src/components/LayerCategorySection.test.tsx web/src/App.tsx web/src/App.test.tsx web/src/styles.css web/src/styles.test.ts
  git commit -m "feat(web): focus layer categories on phones"
  ```

---

## Task 10: Generate the Native-parity Fixture and Complete Acceptance

**Files:**

- Modify: `web/src/themes/mapThemes.ts`
- Modify: `web/src/themes/mapThemes.test.ts`
- Create: `web/src/themes/fixtures/map-presentation.json`
- Modify: `web/src/App.test.tsx`
- Modify: `web/README.md`

- [ ] **Step 1: Define the fixture serializer from the live registries**

  ```ts
  export interface MapPresentationFixture {
    version: 1;
    categories: Array<{
      id: LayerCategoryId;
      name: string;
      layerIds: CategorizedLayerId[];
    }>;
    builtInThemes: Array<{
      id: BuiltInMapThemeId;
      name: string;
      layerIds: ShareLayerId[];
      preferredCategoryIds: LayerCategoryId[];
      taxSaleEnabled: boolean;
      mapMode: MapMode;
    }>;
  }

  export function buildMapPresentationFixture(): MapPresentationFixture {
    return {
      version: 1,
      categories: layerCategories.map(({ id, name }) => ({
        id,
        name,
        layerIds: id === "tax-sale" || id === "my-maps"
          ? []
          : layerIdsForCategory(id),
      })),
      builtInThemes: builtInMapThemes.map((theme) => ({
        id: theme.id,
        name: theme.name,
        layerIds: [...theme.layerIds],
        preferredCategoryIds: [...theme.preferredCategoryIds],
        taxSaleEnabled: theme.taxSaleEnabled,
        mapMode: theme.mapMode,
      })),
    };
  }
  ```

- [ ] **Step 2: Generate and lock the JSON fixture with Vitest**

  ```ts
  it("exports the native portability fixture from the registries", async () => {
    await expect(
      `${JSON.stringify(buildMapPresentationFixture(), null, 2)}\n`,
    ).toMatchFileSnapshot("./fixtures/map-presentation.json");
  });
  ```

  Run once with fixture updating enabled, inspect the resulting JSON, then rerun normally:

  ```bash
  npx vitest run src/themes/mapThemes.test.ts -u
  git diff -- src/themes/fixtures/map-presentation.json
  npx vitest run src/themes/mapThemes.test.ts
  ```

  Expected: the JSON contains all ten category IDs and five built-in theme IDs, and the normal rerun passes without modifying it.

- [ ] **Step 3: Replace transitional legacy-test defaults with explicit intent**

  Remove the temporary suite-wide `/?mode=current` compatibility URL introduced in Task 4. Each tax-sale test must now opt in with `?taxSale=on`; each general map test uses `/`. Keep dedicated tests for legacy `mode` and `event` links. Update old parcel-first default assertions to exact Explore Nova Scotia expectations.

- [ ] **Step 4: Add final integration acceptance cases**

  Ensure `App.test.tsx` covers:

  - first visit: modern only, Tax Sale off, no Province licence prompt, no current/historical tax PID request, and no tax bounds fit;
  - all five built-in themes and Modified/Reset behavior;
  - exact shared setup precedence and legacy share compatibility;
  - full/partial licence theme application with named unavailable layers;
  - custom save/reload/rename/update/duplicate/delete and corrupt fallback;
  - Tax Sale off preserving ordinary PID selection;
  - imported GeoPDF/data unchanged across apply and reset;
  - no more than one opaque background after any built-in apply.

- [ ] **Step 5: Document durable web behavior**

  Update `web/README.md` with:

  - Explore Nova Scotia as the default;
  - the ten category names and five built-in themes;
  - custom themes stored locally and excluded fields;
  - `taxSale=on|off` plus legacy compatibility;
  - the generated fixture path for later Swift parity;
  - explicit statement that the first release does not synchronize themes or modify the iPhone app.

- [ ] **Step 6: Run the complete automated verification**

  From `web/`:

  ```bash
  npm test
  npm run lint
  npm run build
  ```

  Expected: all scripts exit 0. Record test counts and the build output directory in the implementation handoff.

- [ ] **Step 7: Perform rendered desktop and phone acceptance**

  Start the existing Vite server:

  ```bash
  npm run dev -- --host 127.0.0.1
  ```

  Use the `build-web-apps:frontend-testing-debugging` skill and the in-app browser to verify at 1440×1024 and 390×844:

  1. `/` shows modern only, no licence dialog, collapsed categories, Map setup, and Tax Sale Off.
  2. The browser network record contains no tax PID/geometry request before Tax Sale is enabled.
  3. Tax Sale Research prompts once, applies fully after acceptance, and returns to Explore cleanly.
  4. Refusing a restricted historical/forestry theme applies and names the unrestricted/blocked result.
  5. Phone category entry shows one focused section plus Back; a layer toggle leaves the sheet open.
  6. Import a small test GeoPDF through the existing flow, apply two themes, and confirm its visibility, opacity, and registration remain intact.
  7. Reload a saved custom theme and confirm its exact state and URL receipt.

  Capture screenshots and the relevant network evidence in the implementation handoff. Stop the Vite server after acceptance.

- [ ] **Step 8: Inspect the final worktree and commit acceptance artifacts**

  ```bash
  git status --short --branch
  git diff --check
  git add web/src/themes/mapThemes.ts web/src/themes/mapThemes.test.ts web/src/themes/fixtures/map-presentation.json web/src/App.test.tsx web/README.md
  git commit -m "test(web): lock theme and category acceptance"
  git status --short --branch
  ```

  Expected: the task branch is clean and contains only intentional web, fixture, test, and documentation changes.

---

## Final Review and Publication

- [ ] Invoke `superpowers:requesting-code-review` and review the complete diff against the approved design, with particular attention to default-off network behavior, licence bypasses, imported-map mutation, category exhaustiveness, and share compatibility.
- [ ] Fix confirmed review findings with focused regression tests and rerun `npm test`, `npm run lint`, and `npm run build`.
- [ ] Invoke `superpowers:verification-before-completion`; report only commands whose current output was observed.
- [ ] Follow the repository's normal publication workflow: push the task branch and open a ready PR targeting `nightly`. Do not include native changes or claim iPhone parity beyond the checked-in JSON contract.
