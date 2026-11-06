import { useEffect, useRef } from "react";
import { useMap } from "react-leaflet";
import type { FocusFitRequest } from "./focusDefinition";

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
  const { revision, bounds, insetRight = 0, insetBottom = 0 } = request;
  useEffect(() => {
    if (revision <= handled.current) return undefined;
    handled.current = revision;
    if (!bounds) return undefined;
    const fit = () => {
      const size = map.getSize();
      const inset = size.x >= insetRight * 2 + 320 ? insetRight : 0;
      // Keep a band of at least 160px of map to frame the area in.
      const foot = size.y - insetBottom >= 160 ? insetBottom : 0;
      map.fitBounds(bounds, { paddingTopLeft: [24, 24], paddingBottomRight: [24 + inset, 24 + foot], animate: false });
      return { center: map.getCenter(), zoom: map.getZoom() };
    };
    let fitted = fit();
    // Leaflet keeps the centre across a resize, so a camera still where the fit
    // left it means the reader has not moved the map.
    const onResize = () => {
      if (map.getZoom() !== fitted.zoom || !map.getCenter().equals(fitted.center)) {
        map.off("resize", onResize);
        return;
      }
      fitted = fit();
    };
    map.on("resize", onResize);
    const stop = window.setTimeout(() => map.off("resize", onResize), REFIT_WINDOW_MS);
    return () => {
      map.off("resize", onResize);
      window.clearTimeout(stop);
    };
  }, [map, revision, bounds, insetRight, insetBottom]);
  return null;
}
