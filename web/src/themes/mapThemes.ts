import { contextLayerCatalog } from "../layers/contextLayerCatalog";
import {
  isLayerCategoryId,
  layerCategories,
  layerIdsForCategory,
  type CategorizedLayerId,
  type LayerCategoryId,
} from "../layers/layerCategories";
import { liveConditionsLayerCatalog } from "../layers/layerCatalog";
import {
  isShareLayerId,
  type MapMode,
  type ShareLayerId,
} from "../services/mapShareState";

export type BuiltInMapThemeId =
  | "rhodena"
  | "electoral-districts"
  | "explore-nova-scotia"
  | "tax-sale-research"
  | "forestry-field-access"
  | "historical-maps"
  | "georeferencing"
  | "poker"
  | "fishing"
  | "point-tupper";

export interface MapThemeState {
  readonly layerIds: readonly ShareLayerId[];
  readonly opacityOverrides: Readonly<Partial<Record<ShareLayerId, number>>>;
  readonly taxSaleEnabled: boolean;
  readonly mapMode: MapMode;
}

export interface MapThemeDefinition extends MapThemeState {
  readonly id: string;
  readonly kind: "built-in" | "custom";
  readonly name: string;
  readonly description: string;
  readonly preferredCategoryIds: readonly LayerCategoryId[];
}

export interface CustomMapThemeDefinition extends MapThemeDefinition {
  readonly kind: "custom";
}

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
    description: string;
    layerIds: ShareLayerId[];
    opacityOverrides: Partial<Record<ShareLayerId, number>>;
    preferredCategoryIds: LayerCategoryId[];
    taxSaleEnabled: boolean;
    mapMode: MapMode;
  }>;
}

export const builtInMapThemes = [
  {
    id: "explore-nova-scotia",
    kind: "built-in",
    name: "Explore Nova Scotia",
    description: "The modern map. Search a PID or address, or choose a setup for a task.",
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
    description: "Crown land, old-growth policy and property lines over aerial, with roads, water and contours.",
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
    description: "Hugh Fletcher's 1882–1884 sheets of Cape Breton, with today's towns and main roads.",
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
    description: "Load your scan under My maps, then match its points to these roads and places.",
    layerIds: ["modern", "place-names", "main-roads"],
    opacityOverrides: {},
    preferredCategoryIds: ["my-maps", "background-maps", "roads-places"],
    taxSaleEnabled: false,
    mapMode: "current",
  },
  {
    id: "poker",
    kind: "built-in",
    name: "Poker",
    description: "Civic addresses and driveway distances for your mail route.",
    layerIds: ["ns-aerial", "roads"],
    opacityOverrides: {},
    preferredCategoryIds: ["background-maps", "roads-places"],
    taxSaleEnabled: false,
    mapMode: "current",
  },
  { id: "rhodena", kind: "built-in", name: "Rhodena", description: "ABO Energy's 2024 six-turbine proposal (EA), with land, water and community context.", layerIds: ["modern", "rhodena-turbines", "rhodena-infrastructure", "rhodena-study", "protected-conservation-areas", "water-features", "crown-lands", "roads", "old-growth-policy"], opacityOverrides: {}, preferredCategoryIds: ["rhodena-project"], taxSaleEnabled: false, mapMode: "current" },
  { id: "electoral-districts", kind: "built-in", name: "Electoral Districts", description: "Dated boundaries and election results, with each source on its own geometry.", layerIds: ["modern", "provincial-districts-2026", "federal-ridings-2025"], opacityOverrides: {}, preferredCategoryIds: ["elections-districts", "background-maps"], taxSaleEnabled: false, mapMode: "current" },
  {
    // Web-only, and fully open: `modern` is the only background, and no layer
    // here needs the Province licence, so `?theme=fishing` never raises it.
    // The DFO aquatic species-at-risk layers stay in the catalogue but out of
    // this setup, so they never sit beside the spots by default. Waterfalls is
    // left out too: turning it on fits the whole province (LayerZoomController
    // in MapCanvas.tsx), which would move the map away from every spot. So is
    // the Crown land overlay: it draws from zoom 12, and an opening layer that
    // needs zoom 12 makes the same controller zoom in to a few kilometres,
    // away from the spot overview. The Atlas background already shades Crown
    // land, and the overlay stays one tap away on /fishing and the full map.
    // Place names are left out as well: the GeoNAMES layer draws thousands of
    // dark dots from zoom 8 that bury the spot and harbour markers at the
    // opening zoom, the background already labels places, and the layer stays
    // one tap away in Roads & Places.
    id: "fishing",
    kind: "built-in",
    name: "Fishing",
    description: "Curated spots, stocked waters and harbours, with water, land and road context.",
    layerIds: [
      "modern",
      "fishing-spots",
      "stocked-waters",
      "dfo-small-craft-harbours-core",
      "dfo-small-craft-harbours-non-core",
      "water-features",
      "nshn-spines",
      "wsc-hydrometric-stations",
      "wharves-coastal-structures",
      "protected-conservation-areas",
      "roads",
      "campgrounds",
    ],
    // The publisher's park colours (a pure-yellow National Park) would
    // outshout the spot pins; at a quarter they stay legible as areas.
    opacityOverrides: { "protected-conservation-areas": 0.25 },
    preferredCategoryIds: ["water-terrain", "roads-places", "land-property"],
    taxSaleEnabled: false,
    mapMode: "current",
  },
  {
    // Web-only and fully open, like fishing: every layer here is the Province's
    // open data or the project's own places, so `?theme=point-tupper` never
    // raises the Province licence. Place names stay off for the same reason as
    // on fishing (thousands of dots that bury the key places); the background
    // labels the towns. Everything opens at zoom 11 or closer, so turning the
    // setup on never moves the camera off the Strait. The turbines and tanks
    // need no licence either (NRCan, OGL-Canada; EA-filing coordinates as
    // public facts, like Rhodena's; NSTDB, OGL-NS); tanks wait for
    // zoom 13 like the substations, which only context layers may do without
    // moving the camera (LayerZoomController acts on province layers alone).
    // Property boundaries stay one tap away: they need the licence.
    id: "point-tupper",
    kind: "built-in",
    name: "Point Tupper",
    description: "The announced data-centre campus, with installed and planned turbines, the grid, pipelines and wharves.",
    layerIds: [
      "modern",
      "point-tupper-sites",
      "canadian-wind-turbines",
      "planned-wind-turbines",
      "transmission-lines",
      "substations",
      "pipelines",
      "tanks",
      "wharves-coastal-structures",
      "water-features",
      "roads",
    ],
    opacityOverrides: {},
    // The map key switches the setup's layers, so the panel opens only the site's own list.
    preferredCategoryIds: ["point-tupper-site"],
    taxSaleEnabled: false,
    mapMode: "current",
  },
] as const satisfies readonly MapThemeDefinition[];

/**
 * The five setups the iOS app ports, frozen as the native app ships them.
 * The web setups of the same ids may now differ (copy, layers, opacities):
 * the native app catches up in its own release, and only then is this list
 * updated to match. `buildMapPresentationFixture` reads this list, never
 * `builtInMapThemes`, so a web-only change never edits the Swift fixture.
 */
export const nativeParityThemes = [
  {
    id: "explore-nova-scotia",
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
    name: "Georeferencing",
    description: "A clean reference setup for positioning your own maps.",
    layerIds: ["modern", "place-names", "main-roads"],
    opacityOverrides: {},
    preferredCategoryIds: ["my-maps", "background-maps", "roads-places"],
    taxSaleEnabled: false,
    mapMode: "current",
  },
] as const satisfies readonly MapPresentationFixture["builtInThemes"][number][];

/**
 * Web-only live overlays sit outside the native parity universe (see the
 * matching exclusion in layerParity.ts), so the portability fixture must not
 * list them either — a native panel has no row to reproduce for them.
 */
const nativeExcludedLayerIds = new Set<CategorizedLayerId>(
  [...liveConditionsLayerCatalog, ...contextLayerCatalog].map(({ id }) => id),
);

export function buildMapPresentationFixture(): MapPresentationFixture {
  return {
    version: 1,
    categories: layerCategories.filter(c => c.id !== "elections-districts" && c.id !== "rhodena-project" && c.id !== "point-tupper-site").map(({ id, name }) => ({
      id,
      name,
      layerIds: id === "tax-sale" || id === "my-maps"
        ? []
        : layerIdsForCategory(id).filter(
            (layerId) => !nativeExcludedLayerIds.has(layerId),
          ),
    })),
    // Only the frozen native list: Poker, Electoral, Rhodena, Fishing and
    // Point Tupper are web-only, and the web copies of the other five may
    // run ahead of the iOS release.
    builtInThemes: nativeParityThemes.map((theme) => ({
      id: theme.id,
      name: theme.name,
      description: theme.description,
      layerIds: [...theme.layerIds],
      opacityOverrides: { ...theme.opacityOverrides },
      preferredCategoryIds: [...theme.preferredCategoryIds],
      taxSaleEnabled: theme.taxSaleEnabled,
      mapMode: theme.mapMode,
    })),
  };
}

export function validateMapTheme(theme: MapThemeDefinition): string[] {
  const errors: string[] = [];
  const layerIds = new Set<ShareLayerId>();
  const categoryIds = new Set<LayerCategoryId>();

  for (const layerId of theme.layerIds) {
    if (!isShareLayerId(layerId)) {
      errors.push(`unknown layer ID: ${layerId}`);
    } else if (layerIds.has(layerId)) {
      errors.push(`duplicate layer ID: ${layerId}`);
    } else {
      layerIds.add(layerId);
    }
  }

  for (const [layerId, opacity] of Object.entries(theme.opacityOverrides)) {
    if (!isShareLayerId(layerId)) {
      errors.push(`unknown opacity layer ID: ${layerId}`);
    }
    if (!Number.isFinite(opacity) || opacity < 0 || opacity > 1) {
      errors.push(`invalid opacity: ${layerId}`);
    }
  }

  for (const categoryId of theme.preferredCategoryIds) {
    if (!isLayerCategoryId(categoryId)) {
      errors.push(`unknown category ID: ${categoryId}`);
    } else if (categoryIds.has(categoryId)) {
      errors.push(`duplicate category ID: ${categoryId}`);
    } else {
      categoryIds.add(categoryId);
    }
  }

  if (["modern", "ns-aerial", "ns-topographic", "sentinel-2"].filter((id) => layerIds.has(id as ShareLayerId)).length > 1) {
    errors.push("opaque background");
  }

  return errors;
}
