import type { OpenDataSource } from "../../layers/openDataSources";
import type { BasemapStyle } from "../../atlas/basemap";
import {
  FLETCHER_LAYER_Z_INDEX,
  PROVINCE_LAYER_Z_INDEXES,
} from "../../components/mapPanes";
import { arcGISExportUrlForBox } from "../../layers/arcGISExport";
import { fletcherSheets, fletcherTileUrl } from "../../layers/fletcherLayer";
import { contextLayerCatalog } from "../../layers/contextLayerCatalog";
import type { ContextLayerDescriptor } from "../../layers/contextLayerTypes";
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
  selectedParcelRings: LatLngPoint[][];
};

const OSM_TILE_URL = "https://tile.openstreetmap.org";

/** Mirror visible source scale before requesting or crediting a context export. */
export function contextExportOmission(layer: ContextLayerDescriptor, zoom: number): string | null {
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
  return fletcherSheets
    .filter(({ bounds: [[south, west], [north, east]] }) =>
      boundsIntersect(bounds, { north, south, east, west }))
    .map(({ sheet, bounds: [[south, west], [north, east]] }) => {
      const template = fletcherTileUrl(sheet, fletcher.tileBaseUrl);
      const sheetBounds = { north, south, east, west };
      return {
        kind: "tile" as const,
        id: `fletcher-${String(sheet).padStart(2, "0")}`,
        name: `Fletcher sheet ${sheet}`,
        opacity: fletcher.opacity,
        maxNativeZoom: fletcher.maxNativeZoom,
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

/** App state → compositor layers, bottom-to-top in on-screen pane order. */
export function buildExportLayers(
  inputs: ExportLayerInputs,
): CompositorLayer[] {
  const layers: CompositorLayer[] = [];
  if (inputs.showModernMap && inputs.basemapStyle && inputs.basemapStyle !== "osm") {
    layers.push({ kind: "atlas", id: "modern", name: `Atlas ${inputs.basemapStyle} base map`, mode: inputs.basemapStyle });
  } else if (inputs.showModernMap) {
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
  const sortedArcgis = [...inputs.arcgisLayers].sort(
    (a, b) => arcGisLayerZIndex(a.id) - arcGisLayerZIndex(b.id),
  );
  const belowFletcher = sortedArcgis.filter(
    (layer) => arcGisLayerZIndex(layer.id) < FLETCHER_LAYER_Z_INDEX,
  );
  const aboveFletcher = sortedArcgis.filter(
    (layer) => arcGisLayerZIndex(layer.id) >= FLETCHER_LAYER_Z_INDEX,
  );

  layers.push(...belowFletcher.map(arcGisLayer));
  layers.push(...fletcherLayers(inputs));
  for (const userMap of inputs.userMaps) {
    layers.push({ kind: "warped", ...userMap });
  }
  layers.push(...aboveFletcher.map(arcGisLayer));

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
