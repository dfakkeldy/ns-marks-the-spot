import { useEffect, useRef } from "react";
import { useMap } from "react-leaflet";
import type { FocusFitRequest } from "./focusDefinition";

/**
 * Fits the map to a focus page's bounds once per new request revision. On a
 * map wide enough to spare it, the area is framed left of `insetRight`, where
 * the page's map overlay sits; a narrow map keeps the whole width.
 */
export function FocusFit({ request }: { request: FocusFitRequest }) {
  const map = useMap();
  const handled = useRef(0);
  const { revision, bounds, insetRight = 0 } = request;
  useEffect(() => {
    if (revision <= handled.current) return;
    handled.current = revision;
    if (!bounds) return;
    const inset = map.getSize().x >= insetRight * 2 + 320 ? insetRight : 0;
    map.fitBounds(bounds, { paddingTopLeft: [24, 24], paddingBottomRight: [24 + inset, 24], animate: false });
  }, [map, revision, bounds, insetRight]);
  return null;
}
