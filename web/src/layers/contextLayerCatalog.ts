import { infrastructureLayers } from "./infrastructureLayers";
import { landContextLayers } from "./landContextLayers";
import type { ContextLayerDescriptor } from "./contextLayerTypes";

export type ContextLayerId =
  | (typeof infrastructureLayers)[number]["id"]
  | (typeof landContextLayers)[number]["id"];

export type ContextMapLayer = ContextLayerDescriptor & { id: ContextLayerId };

/** Online research layers use the existing ArcGIS image adapter. */
export const contextLayerCatalog: readonly ContextMapLayer[] = [
  ...infrastructureLayers,
  ...landContextLayers,
];

export const hiddenContextLayers = Object.fromEntries(
  contextLayerCatalog.map(({ id }) => [id, false]),
) as Record<ContextLayerId, boolean>;

export const contextLayerCategories = Object.fromEntries(
  contextLayerCatalog.map(({ id, category }) => [id, category]),
) as Record<ContextLayerId, ContextLayerDescriptor["category"]>;
