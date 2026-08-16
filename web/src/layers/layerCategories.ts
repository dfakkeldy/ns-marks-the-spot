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
