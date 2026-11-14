import { useEffect } from "react";
import { useMap } from "react-leaflet";
import { UserTiles } from "../UserTiles";
import type { UserLayerRecord } from "../types";

export type VisibleUserLayer = { record: UserLayerRecord; opacity: number };
function OneLayer({ record, opacity, onStatus }: VisibleUserLayer & { onStatus: (id: string, status: string) => void }) {
  const map = useMap();
  useEffect(() => {
    const layer = new UserTiles(record, opacity);
    let failed = false;
    const report = () => onStatus(record.id, map.getZoom() < record.minZoom ? `Zoom in to level ${record.minZoom}.` : failed ? record.probe?.diagnostic ?? "The server did not return an image." : layer.isLoading() ? "Loading" : "Ready");
    layer.on("loading", () => { failed = false; report(); });
    layer.on("tileerror", () => { failed = true; report(); });
    layer.on("load", report); map.on("zoomend", report); layer.addTo(map); report();
    return () => { map.off("zoomend", report); layer.remove(); layer.off(); };
  }, [map, record, opacity, onStatus]);
  return null;
}
export function UserTileLayers({ layers, onStatus }: { layers: VisibleUserLayer[]; onStatus: (id: string, status: string) => void }) { return <>{layers.map(item => <OneLayer key={item.record.id} {...item} onStatus={onStatus} />)}</>; }
