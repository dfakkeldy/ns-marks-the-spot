import {
  isLayerCategoryId,
  layerCategories,
  layerIdsForCategory,
  type CategorizedLayerId,
  type LayerCategoryId,
} from "../layers/layerCategories";
import {
  isShareLayerId,
  type MapMode,
  type ShareLayerId,
} from "../services/mapShareState";

export type BuiltInMapThemeId =
  | "explore-nova-scotia"
  | "tax-sale-research"
  | "forestry-field-access"
  | "historical-maps"
  | "georeferencing";

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
    layerIds: ShareLayerId[];
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

  if (layerIds.has("modern") && layerIds.has("ns-aerial")) {
    errors.push("opaque background");
  }

  return errors;
}
