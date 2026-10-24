import { rhodenaLayers } from "../rhodena/catalog";
import { electoralLayers } from "./electoralLayers";
import { sentinel2Layer } from "./sentinel2";
import { lidarCanopyLayer } from "./lidarCanopy";
import { openSourceMetadata } from "./openDataSources";
import { infrastructureLayers } from "./infrastructureLayers";
import { landContextLayers } from "./landContextLayers";
import { biodiversityLayers } from "./biodiversityLayers";
import { communityResearchLayers } from "./communityResearchLayers";
import { waterResearchLayers } from "./waterResearchLayers";
import { fishingLayers } from "./fishingLayers";
import { pointTupperLayers } from "./pointTupperLayers";
import { plannedWindLayers } from "./plannedWindLayers";
import type { ContextLayerDescriptor } from "./contextLayerTypes";
import { forestryExclusionReason } from "./forestryExclusions";

export type ContextLayerId =
  | (typeof rhodenaLayers)[number]["id"]
  | (typeof electoralLayers)[number]["id"]
  | typeof sentinel2Layer.id
  | typeof lidarCanopyLayer.id
  | (typeof infrastructureLayers)[number]["id"]
  | (typeof landContextLayers)[number]["id"]
  | (typeof biodiversityLayers)[number]["id"]
  | (typeof communityResearchLayers)[number]["id"]
  | (typeof waterResearchLayers)[number]["id"]
  | (typeof fishingLayers)[number]["id"]
  | (typeof pointTupperLayers)[number]["id"]
  | (typeof plannedWindLayers)[number]["id"];

export type ContextMapLayer = ContextLayerDescriptor & { id: ContextLayerId };

/** Web sources retain their own delivery and licensing contracts. */
export const contextLayerCatalog: readonly ContextMapLayer[] = [
  ...infrastructureLayers.map((layer) => openSourceMetadata(layer, "openData" in layer ? layer.openData : undefined)),
  ...landContextLayers,
  ...biodiversityLayers,
  ...communityResearchLayers,
  ...plannedWindLayers,
  ...waterResearchLayers,
  ...fishingLayers,
  ...pointTupperLayers,
  ...electoralLayers,
  ...rhodenaLayers,
  sentinel2Layer,
  lidarCanopyLayer,
].filter(({ id }) => forestryExclusionReason(id) === null);

export const hiddenContextLayers = Object.fromEntries(
  contextLayerCatalog.map(({ id }) => [id, false]),
) as Record<ContextLayerId, boolean>;

export const contextLayerCategories = Object.fromEntries(
  contextLayerCatalog.map(({ id, category }) => [id, category]),
) as Record<ContextLayerId, ContextLayerDescriptor["category"]>;
