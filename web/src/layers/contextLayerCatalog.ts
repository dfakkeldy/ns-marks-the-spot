import { electoralLayers } from "./electoralLayers";
import { sentinel2Layer } from "./sentinel2";
import { openSourceMetadata } from "./openDataSources";
import { infrastructureLayers } from "./infrastructureLayers";
import { landContextLayers } from "./landContextLayers";
import type { ContextLayerDescriptor } from "./contextLayerTypes";

export type ContextLayerId =
  | (typeof electoralLayers)[number]["id"]
  | typeof sentinel2Layer.id
  | (typeof infrastructureLayers)[number]["id"]
  | (typeof landContextLayers)[number]["id"];

export type ContextMapLayer = ContextLayerDescriptor & { id: ContextLayerId };

/** Web sources retain their own delivery and licensing contracts. */
export const contextLayerCatalog: readonly ContextMapLayer[] = [
  ...infrastructureLayers.map((layer) => openSourceMetadata(layer, "openData" in layer ? layer.openData : undefined)),
  ...landContextLayers,
  ...electoralLayers,
  sentinel2Layer,
];

export const hiddenContextLayers = Object.fromEntries(
  contextLayerCatalog.map(({ id }) => [id, false]),
) as Record<ContextLayerId, boolean>;

export const contextLayerCategories = Object.fromEntries(
  contextLayerCatalog.map(({ id, category }) => [id, category]),
) as Record<ContextLayerId, ContextLayerDescriptor["category"]>;
