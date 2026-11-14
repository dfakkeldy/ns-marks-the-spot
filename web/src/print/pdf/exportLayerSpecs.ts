import { textWithoutAddresses } from "./attributionLines";
import type { PrintLayerSource } from "../../services/printSnapshot";
import { userLayerUse } from "../../userLayers/sourceMatch";
import { imageUrlForBox, tileUrl } from "../../userLayers/tileUrls";
import type { VisibleUserLayer } from "../../userLayers/components/UserTileLayers";
import { assertReproductionAllowed } from "../../licensing/layerUse";
import type { OpenDataSource } from "../../layers/openDataSources";
import type { BasemapStyle } from "../../atlas/basemap";
import {
  FLETCHER_LAYER_Z_INDEX,
  USER_LAYER_BASE_Z_INDEX,
  USER_LAYER_OVERLAY_Z_INDEX,
  PROVINCE_LAYER_Z_INDEXES,
} from "../../components/mapPanes";
import { arcGISExportUrlForBox } from "../../layers/arcGISExport";
import { fletcherTileRegions, FLETCHER_MAX_NATIVE_ZOOM, fletcherTileUrl } from "../../layers/fletcherLayer";
import { contextLayerCatalog } from "../../layers/contextLayerCatalog";
import type { ContextLayerDescriptor } from "../../layers/contextLayerTypes";
import { forestryExclusionReason } from "../../layers/forestryExclusions";
import type { ArcGISExportOptions } from "../../layers/layerCatalog";
import type { PrintMapBounds } from "../../services/printSnapshot";
import type { LatLngPoint } from "../../userMaps/transform/projection";
import { toMercator } from "../../userMaps/transform/webMercator";
import type { PixelRect } from "../../userMaps/types";
import type {
  CompositorLayer,
  CompositorTileLayer,
} from "./mapCompositor";
import { tileMercatorBounds, type TileCoords } from "./tileMath";

export type ExportArcGisLayerInput = {
  id: string;
  name: string;
  serviceUrl: string;
  exportOptions: ArcGISExportOptions;
  opacity: number;
  openData?: OpenDataSource;
  tileUrl?: string;
  maxNativeZoom?: number;
  // Source-specific display limits are resolved from the context catalogue.
};

export type ExportUserMapInput = {
  id: string;
  name: string;
  image: CanvasImageSource;
  imageWidth: number;
  imageHeight: number;
  latLngMesh: LatLngPoint[][];
  sourceRect?: PixelRect;
  opacity: number;
};

export type ExportLayerInputs = {
  basemapStyle?: BasemapStyle;
  bounds: PrintMapBounds;
  showModernMap: boolean;
  fletcher: {
    visible: boolean;
    opacity: number;
    tileBaseUrl: string | null;
    maxNativeZoom: number;
  };
  arcgisLayers: ExportArcGisLayerInput[];
  userMaps: ExportUserMapInput[];
  userLayers?: VisibleUserLayer[];
  selectedParcelRings: LatLngPoint[][];
};

const OSM_TILE_URL = "https://tile.openstreetmap.org";

/** Mirror visible source scale before requesting or crediting a context export. */
export function contextExportOmission(layer: ContextLayerDescriptor, zoom: number): string | null {
  const exclusion = forestryExclusionReason(layer.id);
  if (exclusion) return exclusion;
  if (zoom < layer.minZoom) return `below display scale (zoom ${layer.minZoom} required)`;
  if (zoom > layer.maxZoom) return `above display scale (maximum zoom ${layer.maxZoom})`;
  if (layer.delivery !== undefined && layer.delivery !== "tile") return "PDF export does not support this source format";
  return null;
}

function boundsIntersect(
  a: PrintMapBounds,
  b: PrintMapBounds,
): boolean {
  return a.west < b.east && b.west < a.east && a.south < b.north && b.south < a.north;
}

function tileIntersectsBounds(tile: TileCoords, bounds: PrintMapBounds): boolean {
  const merc = tileMercatorBounds(tile);
  const nw = toMercator({ lat: bounds.north, lng: bounds.west });
  const se = toMercator({ lat: bounds.south, lng: bounds.east });
  return merc.minX < se.x && nw.x < merc.maxX && merc.minY < nw.y && se.y < merc.maxY;
}

function fletcherLayers(
  inputs: ExportLayerInputs,
): CompositorTileLayer[] {
  const { fletcher, bounds } = inputs;
  if (!fletcher.visible || !fletcher.tileBaseUrl) return [];
  return fletcherTileRegions
    .filter(({ bounds: [[south, west], [north, east]] }) =>
      boundsIntersect(bounds, { north, south, east, west }))
    .map(({ id, bounds: [[south, west], [north, east]] }) => {
      const template = fletcherTileUrl(fletcher.tileBaseUrl);
      const sheetBounds = { north, south, east, west };
      return {
        kind: "tile" as const,
        id: `fletcher-${id}`,
        name: "Fletcher historical mosaic",
        opacity: fletcher.opacity,
        maxNativeZoom: Math.min(fletcher.maxNativeZoom, FLETCHER_MAX_NATIVE_ZOOM),
        url: (tile: TileCoords) => {
          if (!template || !tileIntersectsBounds(tile, sheetBounds)) return null;
          return template
            .replace("{z}", String(tile.z))
            .replace("{x}", String(tile.x))
            .replace("{y}", String(tile.y));
        },
      };
    });
}

/**
 * ONE `/export` render per service, at the frame's bbox and output size —
 * what the spec specified. The per-tile URL builder was reused here by
 * mistake, which turned each Province layer into ~200 server-side renders
 * (~800 across the four default layers) in a single burst against
 * nsgiwa.novascotia.ca. These are dynamic map services: there is no cached
 * tile to fetch, only a render to pay for.
 */
function arcGisLayer(layer: ExportArcGisLayerInput): CompositorLayer {
  if (layer.tileUrl) return { kind: "tile", id: layer.id, name: layer.name, opacity: layer.opacity, maxNativeZoom: layer.maxNativeZoom ?? 14, url: ({ z, x, y }) => layer.tileUrl!.replace("{z}", String(z)).replace("{x}", String(x)).replace("{y}", String(y)) };
  if (layer.openData) return { kind: "open-data", id: layer.id, name: layer.name, source: layer.openData, opacity: layer.opacity };
  const maxNativeZoom = contextLayerCatalog.find(({ id }) => id === layer.id)?.maxNativeZoom;
  return {
    kind: "image",
    id: layer.id,
    name: layer.name,
    opacity: layer.opacity,
    url: ({ bounds, widthPx, heightPx }) => {
      const nw = toMercator({ lat: bounds.north, lng: bounds.west });
      const se = toMercator({ lat: bounds.south, lng: bounds.east });
      // Scale-limited context services can return a successful but blank PNG
      // if the requested pixel resolution exceeds their display limit. Ask
      // for a coarser image of the same extent and let the compositor enlarge
      // it; no additional geographic detail is implied by the larger frame.
      if (maxNativeZoom !== undefined) {
        const metresPerPixel = 156_543.033_928_040_97 / 2 ** maxNativeZoom;
        const fit = Math.min(
          1,
          (se.x - nw.x) / (metresPerPixel * widthPx),
          (nw.y - se.y) / (metresPerPixel * heightPx),
        );
        widthPx = Math.max(1, Math.floor(widthPx * fit));
        heightPx = Math.max(1, Math.floor(heightPx * fit));
      }
      return arcGISExportUrlForBox(
        { serviceUrl: layer.serviceUrl, ...layer.exportOptions },
        { minX: nw.x, minY: se.y, maxX: se.x, maxY: nw.y },
        { widthPx, heightPx },
      );
    },
  };
}

/** The same pane order as the live map, including opaque context basemaps. */
function arcGisLayerZIndex(id: string): number {
  return PROVINCE_LAYER_Z_INDEXES[id as keyof typeof PROVINCE_LAYER_Z_INDEXES]
    ?? contextLayerCatalog.find((layer) => layer.id === id)?.zIndex
    ?? Number.POSITIVE_INFINITY;
}

export function coveredByOpaqueUserBase(id: string, opaqueBase: boolean): boolean {
  return opaqueBase && (id === "modern" || arcGisLayerZIndex(id) < USER_LAYER_BASE_Z_INDEX);
}

export function selectUserLayersForExport(layers: readonly VisibleUserLayer[], licenceAccepted: boolean, zoom = Infinity, catalogueSources: ReadonlyMap<string, PrintLayerSource> = new Map()): { included: VisibleUserLayer[]; omitted: string[] } {
  const included: VisibleUserLayer[] = [];
  const omitted: string[] = [];
  for (const layer of layers) {
    const use = userLayerUse(layer.record, undefined, licenceAccepted);
    if (use.view !== "allowed") { omitted.push(`${layer.record.name} — ${use.view === "needs-acceptance" ? "Province licence acceptance is needed" : use.reason ?? "viewing is locked"}`); continue; }
    if (zoom < layer.record.minZoom) { omitted.push(`${layer.record.name} — below display scale (zoom ${layer.record.minZoom} required)`); continue; }
    if (use.export === "held") { omitted.push(`${layer.record.name} — ${use.reason ?? "export locked"}`); continue; }
    if (use.matched.some(match => !catalogueSources.get(match.layerId)?.attribution && !match.attribution)) { omitted.push(`${layer.record.name} — catalogue attribution unavailable`); continue; }
    if (!layer.record.probe) { omitted.push(`${layer.record.name} — not tested`); continue; }
    if (layer.record.probe.corsReadable !== true) { omitted.push(`${layer.record.name} — cannot be read for a PDF`); continue; }
    included.push(layer);
  }
  return { included, omitted };
}

export function isOpaqueUserBase(layer: VisibleUserLayer): boolean {
  return layer.record.role === "base" && layer.record.opaque === true && layer.opacity === 1 && (layer.record.kind !== "wms" || layer.record.wms?.transparent === false);
}

function userLayer(layer: VisibleUserLayer): CompositorLayer {
  const { record, opacity } = layer;
  const match = userLayerUse(record, undefined, true).matched[0];
  const shared = { id: record.id, name: `Your layer: ${textWithoutAddresses(record.name)}`, opacity, sourceId: match?.layerId, userSource: record };
  if (record.kind === "xyz" || record.kind === "tms") return { ...shared, kind: "tile", maxNativeZoom: record.maxNativeZoom, minZoom: record.minZoom, url: tile => tileUrl(record, tile) };
  return { ...shared, kind: "image", url: ({ bounds, widthPx, heightPx }) => {
    const nw = toMercator({ lat: bounds.north, lng: bounds.west });
    const se = toMercator({ lat: bounds.south, lng: bounds.east });
    return imageUrlForBox(record, { minX: nw.x, minY: se.y, maxX: se.x, maxY: nw.y }, widthPx, heightPx);
  } };
}

/** App state → compositor layers, bottom-to-top in on-screen pane order. */
export function buildExportLayers(
  inputs: ExportLayerInputs,
): CompositorLayer[] {
  const userLayers = inputs.userLayers ?? [];
  for (const layer of userLayers) {
    const use = userLayerUse(layer.record, undefined, true);
    if (use.export !== "allowed") throw new Error(use.reason ?? "User layer export is locked.");
    if (layer.record.probe?.corsReadable !== true) throw new Error("User layer has not been tested as readable for PDF export.");
  }
  const opaqueBase = userLayers.some(isOpaqueUserBase);
  const includedArcgis = inputs.arcgisLayers.filter(layer => !coveredByOpaqueUserBase(layer.id, opaqueBase));
  for (const layer of includedArcgis) {
    const exclusion = forestryExclusionReason(layer.id);
    if (exclusion) throw new Error(exclusion);
  }
  assertReproductionAllowed([
    ...includedArcgis.map(layer => ({ id: layer.id, openData: layer.openData })),
    ...(inputs.fletcher.visible ? ["fletcher"] : []),
    ...(inputs.selectedParcelRings.length ? ["selected-parcel"] : []),
  ]);
  const layers: CompositorLayer[] = [];
  if (!opaqueBase && inputs.showModernMap && inputs.basemapStyle && inputs.basemapStyle !== "osm") {
    layers.push({ kind: "atlas", id: "modern", name: `Atlas ${inputs.basemapStyle} base map`, mode: inputs.basemapStyle });
  } else if (!opaqueBase && inputs.showModernMap) {
    layers.push({
      kind: "tile",
      id: "modern",
      name: "OpenStreetMap base map",
      opacity: 1,
      maxNativeZoom: 19,
      url: ({ z, x, y }) => `${OSM_TILE_URL}/${z}/${x}/${y}.png`,
    });
  }

  // ArcGIS layers are grouped by their on-screen z-index relative to Fletcher
  // (155). Topographic (145) and aerial (150) backgrounds must render first
  // so their opaque images do not cover Fletcher or user maps. Broad context
  // fills remain below parcel lines; detailed infrastructure keeps its pane order.
  const sortedArcgis = [...includedArcgis].sort(
    (a, b) => arcGisLayerZIndex(a.id) - arcGisLayerZIndex(b.id),
  );
  const belowFletcher = sortedArcgis.filter(
    (layer) => arcGisLayerZIndex(layer.id) < FLETCHER_LAYER_Z_INDEX,
  );
  const aboveFletcher = sortedArcgis.filter(
    (layer) => arcGisLayerZIndex(layer.id) >= FLETCHER_LAYER_Z_INDEX,
  );

  layers.push(...belowFletcher.filter(layer => arcGisLayerZIndex(layer.id) < USER_LAYER_BASE_Z_INDEX).map(arcGisLayer));
  layers.push(...userLayers.filter(layer => layer.record.role === "base").map(userLayer));
  layers.push(...belowFletcher.filter(layer => arcGisLayerZIndex(layer.id) >= USER_LAYER_BASE_Z_INDEX).map(arcGisLayer));
  layers.push(...fletcherLayers(inputs));
  layers.push(...aboveFletcher.filter(layer => arcGisLayerZIndex(layer.id) < USER_LAYER_OVERLAY_Z_INDEX).map(arcGisLayer));
  layers.push(...userLayers.filter(layer => layer.record.role === "overlay").map(userLayer));
  for (const userMap of inputs.userMaps) {
    layers.push({ kind: "warped", ...userMap });
  }
  layers.push(...aboveFletcher.filter(layer => arcGisLayerZIndex(layer.id) >= USER_LAYER_OVERLAY_Z_INDEX).map(arcGisLayer));

  if (inputs.selectedParcelRings.length > 0) {
    layers.push({
      kind: "parcel-ring",
      id: "selected-parcel",
      name: "Selected parcel",
      rings: inputs.selectedParcelRings,
      strokeStyle: "#facc15",
      lineWidthPx: 6,
    });
  }
  return layers;
}
