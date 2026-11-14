import L from "leaflet";
import { tileUrl } from "./tileUrls";
import type { UserLayerRecord } from "./types";

export class UserTiles extends L.TileLayer {
  constructor(private readonly record: UserLayerRecord, opacity: number) {
    super(record.url, { minZoom: record.minZoom, maxZoom: 23, maxNativeZoom: record.maxNativeZoom, tileSize: 256, className: "user-supplied-tile-layer", opacity, zIndex: record.role === "base" ? 152 : 158, crossOrigin: record.probe?.corsReadable === true ? "anonymous" : false });
  }
  getTileUrl(coords: L.Coords): string { return tileUrl(this.record, coords); }
}
