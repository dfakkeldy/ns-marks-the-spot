import L from "leaflet";
import type { ArcGISExportOptions } from "./layerCatalog";

const WEB_MERCATOR_WORLD_EXTENT = 20_037_508.342789244;

export type ArcGISTileCoordinates = {
  x: number;
  y: number;
  z: number;
};

export type ArcGISExportLayerOptions = ArcGISExportOptions & {
  serviceUrl: string;
};

export function webMercatorBoundsForTile({
  x,
  y,
  z,
}: ArcGISTileCoordinates) {
  const tileSpan = (2 * WEB_MERCATOR_WORLD_EXTENT) / 2 ** z;
  const minX = -WEB_MERCATOR_WORLD_EXTENT + x * tileSpan;
  const maxX = minX + tileSpan;
  const maxY = WEB_MERCATOR_WORLD_EXTENT - y * tileSpan;
  const minY = maxY - tileSpan;

  return { minX, minY, maxX, maxY };
}

export function arcGISExportUrlForTile(
  options: ArcGISExportLayerOptions,
  coordinates: ArcGISTileCoordinates,
) {
  const bounds = webMercatorBoundsForTile(coordinates);
  const baseUrl = options.serviceUrl.replace(/\/$/, "");
  const url = new URL(`${baseUrl}/export`);

  url.searchParams.set(
    "bbox",
    `${bounds.minX},${bounds.minY},${bounds.maxX},${bounds.maxY}`,
  );
  url.searchParams.set("bboxSR", "3857");
  url.searchParams.set("imageSR", "3857");
  url.searchParams.set("size", "256,256");
  url.searchParams.set("format", "png32");
  url.searchParams.set("transparent", String(options.transparent));
  url.searchParams.set("f", "image");

  if (options.layers) {
    url.searchParams.set("layers", options.layers);
  }

  if (options.dynamicLayers) {
    url.searchParams.set(
      "dynamicLayers",
      JSON.stringify(JSON.parse(options.dynamicLayers)),
    );
  }

  return url.toString();
}

export class ArcGISExportTileLayer extends L.TileLayer {
  readonly exportOptions: ArcGISExportLayerOptions;

  constructor(
    exportOptions: ArcGISExportLayerOptions,
    layerOptions: L.TileLayerOptions,
  ) {
    super(exportOptions.serviceUrl, layerOptions);
    this.exportOptions = exportOptions;
  }

  getTileUrl(coordinates: L.Coords) {
    return arcGISExportUrlForTile(this.exportOptions, coordinates);
  }
}
