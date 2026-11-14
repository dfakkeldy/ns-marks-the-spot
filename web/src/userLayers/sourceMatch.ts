import { contextLayerCatalog } from "../layers/contextLayerCatalog";
import { lidarCanopyLayer } from "../layers/lidarCanopy";
import type { OpenDataSource } from "../layers/openDataSources";
import { infrastructureLayers } from "../layers/infrastructureLayers";
import { landContextLayers } from "../layers/landContextLayers";
import { fletcherTileUrl } from "../layers/fletcherLayer";
import { forestryExclusionReason } from "../layers/forestryExclusions";
import { nativeLayerCatalog, nativeProvinceLayerCatalog, provinceLayerCatalog, floodHazardLayerCatalog, environmentalHealthLayerCatalog, forestryLayerCatalog, resourceLayerCatalog, hydroPilotLayerCatalog, zoningLayerCatalog, wellLogLayerCatalog, liveConditionsLayerCatalog } from "../layers/layerCatalog";
import { queryLockReason, reproductionLockReason } from "../licensing/layerUse";
import type { UserLayerRecord } from "./types";

export type MatchPolicy = "same-lock" | "user-responsibility" | "owner-build";
export const USER_LAYER_MATCH_POLICY: MatchPolicy = "same-lock";
export type SourceMatch = { layerId: string; name: string; licence: string; licenceUrl?: string; attribution?: string; unavailableReason?: string; requiresProvinceLicence?: boolean; openData?: OpenDataSource };
type Descriptor = { id: string; name: string; licence: string; licenceUrl?: string | null; serviceUrl?: string; tileUrl?: string; attribution?: string; unavailableReason?: string; requiresProvinceLicence?: boolean; openData?: OpenDataSource };

export function sourceKey(value: string): string | null {
  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase().replace(/\.$/, "");
    const host = ["nsgiwa.novascotia.ca", "nsgiwa2.novascotia.ca"].includes(hostname) ? "nsgiwa.novascotia.ca" : `${hostname}${url.port ? `:${url.port}` : ""}`;
    const path = decodeURIComponent(url.pathname).toLowerCase().replace(/\/{2,}/g, "/");
    const arcgis = path.match(/^(.*?)(?:\/arcgis)?\/(?:rest\/)?services\/(.+?\/(?:mapserver|imageserver))(?:\/|$)/);
    if (arcgis) return `${host}${arcgis[1]}/services/${arcgis[2]}`;
    return `${host}${path.replace(/\/(?:\{z\}|\d+)\/[^/]+\/[^/]+$/, "").replace(/\/+$/, "")}`;
  } catch { return null; }
}

export function catalogueSourceIndex(): Map<string, SourceMatch[]> {
  const index = new Map<string, SourceMatch[]>();
  const layers: readonly Descriptor[] = [...nativeLayerCatalog, ...nativeProvinceLayerCatalog, ...provinceLayerCatalog, ...infrastructureLayers, ...contextLayerCatalog.filter(layer => layer.id !== "lidar-canopy-height"), ...landContextLayers, ...floodHazardLayerCatalog, ...environmentalHealthLayerCatalog, ...forestryLayerCatalog, ...resourceLayerCatalog, ...hydroPilotLayerCatalog, ...zoningLayerCatalog, ...wellLogLayerCatalog, ...liveConditionsLayerCatalog];
  const add = (layer: Descriptor, address: string | null | undefined) => {
    if (!address) return;
    const key = sourceKey(address); if (!key) return;
    const match: SourceMatch = { layerId: layer.id, name: layer.name, licence: layer.licence, licenceUrl: layer.licenceUrl ?? undefined, attribution: layer.attribution, unavailableReason: layer.unavailableReason, requiresProvinceLicence: layer.requiresProvinceLicence, openData: layer.licence === "province-open" && address === layer.serviceUrl ? layer.openData : undefined };
    const previous = index.get(key) ?? [];
    if (!previous.some(entry => entry.layerId === match.layerId && entry.unavailableReason === match.unavailableReason)) index.set(key, [...previous, match]);
  };
  for (const layer of layers) { add(layer, layer.serviceUrl); add(layer, layer.tileUrl); }
  add(nativeLayerCatalog[0], fletcherTileUrl());
  add(lidarCanopyLayer, lidarCanopyLayer.tileUrl);
  return index;
}

let cachedIndex: Map<string, SourceMatch[]> | undefined;
export function matchCatalogueSource(url: string): SourceMatch[] {
  const key = sourceKey(url);
  return key ? (cachedIndex ??= catalogueSourceIndex()).get(key) ?? [] : [];
}

export function userLayerUse(record: UserLayerRecord, policy: MatchPolicy = USER_LAYER_MATCH_POLICY, provinceLicenceAccepted = false): { view: "allowed" | "refused" | "needs-acceptance"; export: "allowed" | "held"; reason: string | null; matched: SourceMatch[] } {
  const matched = matchCatalogueSource(record.url);
  if (!sourceKey(record.url)) return { view: "refused", export: "held", reason: "Invalid source address.", matched };
  // Alternative policies remain fail-closed until their behaviour is approved and implemented.
  if (policy !== "same-lock") return { view: "refused", export: "held", reason: "This source policy is not enabled.", matched };
  for (const entry of matched) {
    const reason = forestryExclusionReason(entry.layerId) ?? queryLockReason(entry.layerId);
    if (reason) return { view: "refused", export: "held", reason, matched };
  }
  const restricted = matched.some(entry => entry.licence === "province-restricted" || entry.requiresProvinceLicence);
  const reason = matched.map(entry => entry.licence === "province-restricted" || entry.requiresProvinceLicence
    ? reproductionLockReason(entry.layerId) ?? reproductionLockReason("ns-aerial")
    : reproductionLockReason(entry.layerId, entry.openData)).find(Boolean) ?? null;
  return { view: restricted && !provinceLicenceAccepted ? "needs-acceptance" : "allowed", export: reason ? "held" : "allowed", reason, matched };
}
