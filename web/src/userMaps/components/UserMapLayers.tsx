import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { useMap } from "react-leaflet";
import {
  USER_MAPS_PANE,
  USER_MAPS_PANE_Z_INDEX,
} from "../../components/mapPanes";
import { meshForRecord } from "../recordMesh";
import type { LatLngPoint } from "../transform/projection";
import { WarpedRasterLayer } from "../render/WarpedRasterLayer";
import type { PixelRect, UserMapRecord } from "../types";

export type VisibleUserMap = {
  record: UserMapRecord;
  previewUrl: string;
  opacity: number;
};

/** The map being georeferenced. Its mesh is owned by the session, not derived
 * from the record, because it changes on every pointer move during a drag. */
export type DraftUserMap = VisibleUserMap & { mesh: LatLngPoint[][] | null };

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

/**
 * One Leaflet layer per raster. `mesh` is passed separately from `record`
 * rather than derived inside the build effect, so the draft can re-warp
 * without the effect's dependencies changing.
 */
function WarpedRasterOverlay({
  previewUrl,
  opacity,
  mesh,
  sourceRect,
}: {
  previewUrl: string;
  opacity: number;
  mesh: LatLngPoint[][] | null;
  sourceRect?: PixelRect;
}) {
  const leafletMap = useMap();
  const layerRef = useRef<WarpedRasterLayer | null>(null);
  const opacityRef = useRef(opacity);
  const meshRef = useRef(mesh);
  const sourceRectRef = useRef(sourceRect);
  const hasMesh = mesh !== null;

  useEffect(() => {
    if (!leafletMap || !hasMesh) {
      return;
    }
    let cancelled = false;
    let bitmap: ImageBitmap | null = null;
    void loadBitmap(previewUrl)
      .then((loaded) => {
        if (cancelled) {
          loaded.close();
          return;
        }
        const currentMesh = meshRef.current;
        if (!currentMesh) {
          loaded.close();
          return;
        }
        bitmap = loaded;
        ensurePane(leafletMap);
        const layer = new WarpedRasterLayer({
          paneName: USER_MAPS_PANE,
          // Read both through refs: opacity or mesh may have changed while
          // the bitmap was decoding, and a stale closure would build the
          // layer with whatever was current when the effect first ran.
          opacity: opacityRef.current,
          image: loaded,
          imageSize: { width: loaded.width, height: loaded.height },
          latLngMesh: currentMesh,
          sourceRect: sourceRectRef.current,
        });
        layer.addTo(leafletMap);
        layerRef.current = layer;
      })
      .catch((error: unknown) => {
        if (cancelled) {
          return;
        }
        console.error("user map preview failed to load", error);
      });
    return () => {
      cancelled = true;
      layerRef.current?.remove();
      layerRef.current = null;
      bitmap?.close();
    };
    // Deliberately NOT depending on `mesh`: a georeferencing drag changes it
    // dozens of times a second, and rebuilding here would re-decode the
    // bitmap every frame. Geometry updates go through the layout effect
    // below instead.
  }, [leafletMap, previewUrl, hasMesh]);

  useLayoutEffect(() => {
    // Layout, not passive: passive effects are scheduled asynchronously, so a
    // pending createImageBitmap could resolve and read a stale ref first.
    // Layout effects flush during commit, before any yield to the event loop.
    // (PR 1 hit exactly this bug with opacity; the same ordering applies to
    // the mesh, which changes far more often.)
    opacityRef.current = opacity;
    meshRef.current = mesh;
    sourceRectRef.current = sourceRect;
    layerRef.current?.setOpacity(opacity);
    if (mesh) {
      layerRef.current?.setGeometry(mesh, sourceRect);
    }
  }, [opacity, mesh, sourceRect]);

  return null;
}

/**
 * A saved map derives its mesh from its record — and MUST memoize it on the
 * record's object identity. `useUserMaps` rebuilds its VisibleUserMap
 * wrappers on every render, so calling meshForRecord in the parent's render
 * body would hand this overlay a brand-new array each time and re-trigger the
 * geometry layout effect below. During a georeferencing drag that is every
 * saved layer rebuilding its lattice and repainting on every pointer move.
 * The memo can only live in a component, not in a `.map()` callback, which is
 * the entire reason this wrapper exists.
 */
function SavedMapOverlay({ map }: { map: VisibleUserMap }) {
  const mesh = useMemo(() => meshForRecord(map.record), [map.record]);
  return (
    <WarpedRasterOverlay
      previewUrl={map.previewUrl}
      opacity={map.opacity}
      mesh={mesh}
      sourceRect={map.record.sourceRect}
    />
  );
}

/** Sole mount point MapCanvas needs. */
export function UserMapLayers({
  maps,
  draft = null,
}: {
  maps: VisibleUserMap[];
  draft?: DraftUserMap | null;
}) {
  return (
    <>
      {maps.map((map) => (
        <SavedMapOverlay key={map.record.id} map={map} />
      ))}
      {draft ? (
        // The draft's mesh comes from the session, not from the record: it
        // changes on every pointer move, and the record is only updated on
        // the debounced write-through.
        <WarpedRasterOverlay
          key={`draft-${draft.record.id}`}
          previewUrl={draft.previewUrl}
          opacity={draft.opacity}
          mesh={draft.mesh}
          sourceRect={draft.record.sourceRect}
        />
      ) : null}
    </>
  );
}
