import {
  isLayerCategoryId,
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
