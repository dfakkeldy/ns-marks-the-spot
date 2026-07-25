import { useEffect, useRef } from "react";
import { useMap } from "react-leaflet";
import {
  USER_MAPS_PANE,
  USER_MAPS_PANE_Z_INDEX,
} from "../../components/mapPanes";
import { buildLatLngMesh } from "../transform/projection";
import { WarpedRasterLayer } from "../render/WarpedRasterLayer";
import type { UserMapRecord } from "../types";

export type VisibleUserMap = {
  record: UserMapRecord;
  previewUrl: string;
  opacity: number;
};

/** Idempotent: Leaflet keeps panes for the map's lifetime. */
function ensurePane(map: ReturnType<typeof useMap>): void {
  if (!map.getPane(USER_MAPS_PANE)) {
    const pane = map.createPane(USER_MAPS_PANE);
    pane.style.zIndex = String(USER_MAPS_PANE_Z_INDEX);
  }
}

async function loadBitmap(url: string): Promise<ImageBitmap> {
  const response = await fetch(url);
  return createImageBitmap(await response.blob());
}

function WarpedRasterOverlay({ map }: { map: VisibleUserMap }) {
  const leafletMap = useMap();
  const layerRef = useRef<WarpedRasterLayer | null>(null);
  const opacityRef = useRef(map.opacity);
  const { record, previewUrl, opacity } = map;

  useEffect(() => {
    if (!leafletMap || record.georef.kind !== "embedded") {
      return;
    }
    const georef = record.georef;
    let cancelled = false;
    let bitmap: ImageBitmap | null = null;
    void loadBitmap(previewUrl)
      .then((loaded) => {
        if (cancelled) {
          loaded.close();
          return;
        }
        bitmap = loaded;
        ensurePane(leafletMap);
        const layer = new WarpedRasterLayer({
          paneName: USER_MAPS_PANE,
          // Read through the ref so an opacity change during the async load
          // is not lost to a stale closure.
          opacity: opacityRef.current,
          image: loaded,
          imageSize: { width: loaded.width, height: loaded.height },
          latLngMesh: buildLatLngMesh(georef, record.pixelSize),
        });
        layer.addTo(leafletMap);
        layerRef.current = layer;
      })
      .catch((error: unknown) => {
        // A missing/revoked blob URL is recoverable (map re-enable reloads
        // it); surface for diagnosis without crashing the tree.
        console.error("user map preview failed to load", error);
      });
    return () => {
      cancelled = true;
      layerRef.current?.remove();
      layerRef.current = null;
      bitmap?.close();
    };
  }, [leafletMap, record, previewUrl]);

  useEffect(() => {
    // Refs must not be written during render (react-hooks/refs), so the
    // "latest opacity" ref the async load below reads is kept current here,
    // in the same effect that also pushes the value into an already-built
    // layer.
    opacityRef.current = opacity;
    layerRef.current?.setOpacity(opacity);
  }, [opacity]);

  return null;
}

/** Sole mount point MapCanvas needs. */
export function UserMapLayers({ maps }: { maps: VisibleUserMap[] }) {
  return (
    <>
      {maps.map((map) => (
        <WarpedRasterOverlay key={map.record.id} map={map} />
      ))}
    </>
  );
}
