import {
  FLETCHER_LAYER_Z_INDEX,
  PROVINCE_LAYER_Z_INDEXES,
} from "../../components/mapPanes";
import { arcGISExportUrlForBox } from "../../layers/arcGISExport";
import { fletcherSheets, fletcherTileUrl } from "../../layers/fletcherLayer";
import type { ArcGISExportOptions } from "../../layers/layerCatalog";
import type { PrintMapBounds } from "../../services/printSnapshot";
import type { LatLngPoint } from "../../userMaps/transform/projection";
import { toMercator } from "../../userMaps/transform/webMercator";
import type { PixelRect } from "../../userMaps/types";
import type {
  CompositorImageLayer,
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
  // No `maxNativeZoom`: a single bbox render has no tile pyramid to clamp to.
  // The service renders the frame at the size asked for.
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
function arcGisLayer(layer: ExportArcGisLayerInput): CompositorImageLayer {
  return {
    kind: "image",
    id: layer.id,
    name: layer.name,
    opacity: layer.opacity,
    url: ({ bounds, widthPx, heightPx }) => {
      const nw = toMercator({ lat: bounds.north, lng: bounds.west });
      const se = toMercator({ lat: bounds.south, lng: bounds.east });
      return arcGISExportUrlForBox(
        { serviceUrl: layer.serviceUrl, ...layer.exportOptions },
        { minX: nw.x, minY: se.y, maxX: se.x, maxY: nw.y },
        { widthPx, heightPx },
      );
    },
  };
}

/**
 * On-screen z-index for an ArcGIS layer, per `PROVINCE_LAYER_Z_INDEXES`.
 * Unknown ids (not part of that record) default to a z-index above every
 * known one, which is where every layer *besides* `ns-aerial` (150) already
 * sits — `ns-aerial` is the one entry below Fletcher (155) and user maps
 * (160), and it is opaque, so it is the only one that must be pinned below
 * them rather than defaulting into the common "above" bucket.
 */
function arcGisLayerZIndex(id: string): number {
  return PROVINCE_LAYER_Z_INDEXES[id as keyof typeof PROVINCE_LAYER_Z_INDEXES]
    ?? Number.POSITIVE_INFINITY;
}

/** App state → compositor layers, bottom-to-top in on-screen pane order. */
export function buildExportLayers(
  inputs: ExportLayerInputs,
): CompositorLayer[] {
  const layers: CompositorLayer[] = [];
  if (inputs.showModernMap) {
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
  // (155): the "sub-basemap" bucket (currently only ns-aerial, at 150) sits
  // below Fletcher/user maps and must render first, or an opaque aerial
  // layer would paint over both of them in the exported image. Everything
  // else sorts after, matching the ascending order MapCanvas assigns via
  // PROVINCE_LAYER_Z_INDEXES.
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
