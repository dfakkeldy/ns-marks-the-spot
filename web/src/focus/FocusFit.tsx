import { useEffect, useRef } from "react";
import type { LatLng } from "leaflet";
import { useMap } from "react-leaflet";
import type { FocusFitRequest } from "./focusDefinition";

interface FittedCamera {
  readonly center: LatLng;
  readonly zoom: number;
}

/** How long after a fit a change in the map's size (the licence strip folding on load) still refits it. */
const REFIT_WINDOW_MS = 10_000;

/**
 * Fits the map to a focus page's bounds once per new request revision. On a
 * map wide enough to spare it, the area is framed left of `insetRight`, where
 * the page's map overlay sits; a narrow map keeps the whole width.
 *
 * If the map changes size soon after (the licence strip folds a few seconds
 * after load, giving the map its full height), the fit is made again for the
 * new size, unless the reader has moved the map in the meantime.
 */
export function FocusFit({ request }: { request: FocusFitRequest }) {
  const map = useMap();
  const handled = useRef(0);
  // The latest page fit, while it may still be redone for a new map size.
  const lastFit = useRef<{ redo: () => FittedCamera; camera: FittedCamera; at: number } | null>(null);
  const { revision, bounds, insetRight = 0, insetBottom = 0 } = request;
  useEffect(() => {
    if (revision <= handled.current) return;
    handled.current = revision;
    if (!bounds) return;
    const redo = (): FittedCamera => {
      const size = map.getSize();
      const inset = size.x >= insetRight * 2 + 320 ? insetRight : 0;
      // Keep a band of at least 160px of map to frame the area in.
      const foot = size.y - insetBottom >= 160 ? insetBottom : 0;
      map.fitBounds(bounds, { paddingTopLeft: [24, 24], paddingBottomRight: [24 + inset, 24 + foot], animate: false });
      return { center: map.getCenter(), zoom: map.getZoom() };
    };
    lastFit.current = { redo, camera: redo(), at: Date.now() };
  }, [map, revision, bounds, insetRight, insetBottom]);
  // Its own effect, so the listener outlives a re-run of the fit effect.
  useEffect(() => {
    const onResize = () => {
      const last = lastFit.current;
      if (!last || Date.now() - last.at > REFIT_WINDOW_MS) return;
      // Leaflet keeps the centre across a resize (to the nearest pixel), so a
      // camera within a few pixels of where the fit left it means the reader
      // has not moved the map.
      const { center, zoom } = last.camera;
      const moved = map.getZoom() !== zoom
        || map.project(map.getCenter(), zoom).distanceTo(map.project(center, zoom)) > 3;
      if (moved) {
        lastFit.current = null;
        return;
      }
      last.camera = last.redo();
    };
    map.on("resize", onResize);
    return () => { map.off("resize", onResize); };
  }, [map]);
  return null;
}
