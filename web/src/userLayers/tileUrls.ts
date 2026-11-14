import { webMercatorBoundsForTile, type ArcGISTileCoordinates, type WebMercatorBox } from "../layers/arcGISExport";
import type { UserLayerRecord } from "./types";

export function imageUrlForBox(record: UserLayerRecord, box: WebMercatorBox, width: number, height: number): string {
  const url = new URL(record.url);
  const reserved = record.kind === "wms" ? ["service", "request", "version", "layers", "styles", "format", "transparent", "bbox", "width", "height", "srs", "crs"] : ["bbox", "bboxsr", "imagesr", "size", "format", "transparent", "f", "layers"];
  for (const key of [...url.searchParams.keys()]) if (reserved.includes(key.toLowerCase())) url.searchParams.delete(key);
  const bbox = [box.minX, box.minY, box.maxX, box.maxY].join(",");
  if (record.kind === "wms") {
    const wms = record.wms;
    for (const [key, value] of Object.entries({ service: "WMS", request: "GetMap", version: wms?.version ?? "1.3.0", layers: wms?.layers ?? "", styles: wms?.styles ?? "", format: wms?.format ?? "image/png", transparent: String(wms?.transparent ?? true), bbox, width: String(width), height: String(height), [(wms?.version ?? "1.3.0") === "1.3.0" ? "crs" : "srs"]: "EPSG:3857" })) url.searchParams.set(key, value);
  } else {
    url.pathname = `${url.pathname.replace(/\/$/, "")}/${record.kind === "arcgis-image" ? "exportImage" : "export"}`;
    for (const [key, value] of Object.entries({ bbox, bboxSR: "3857", imageSR: "3857", size: `${width},${height}`, format: "png32", transparent: record.role === "base" && record.opaque ? "false" : "true", f: "image" })) url.searchParams.set(key, value);
    if (record.arcgis?.layers) url.searchParams.set("layers", record.arcgis.layers);
  }
  return url.toString();
}
export function tileUrl(record: UserLayerRecord, coords: ArcGISTileCoordinates): string {
  if (record.kind === "xyz" || record.kind === "tms") {
    const y = record.kind === "tms" ? 2 ** coords.z - coords.y - 1 : coords.y;
    return record.url.replace(/\{s\}/gi, "a").replace(/\{z\}/gi, String(coords.z)).replace(/\{x\}/gi, String(coords.x)).replace(/\{(?:-y|y)\}/gi, String(y));
  }
  return imageUrlForBox(record, webMercatorBoundsForTile(coords), record.tileSize, record.tileSize);
}
