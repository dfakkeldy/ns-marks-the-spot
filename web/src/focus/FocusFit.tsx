import { useEffect, useRef } from "react";
import { useMap } from "react-leaflet";
import type { FocusFitRequest } from "./focusDefinition";

/** Fits the map to a focus page's bounds once per new request revision. */
export function FocusFit({ request }: { request: FocusFitRequest }) {
  const map = useMap();
  const handled = useRef(0);
  const { revision, bounds } = request;
  useEffect(() => {
    if (revision <= handled.current) return;
    handled.current = revision;
    if (bounds) map.fitBounds(bounds, { padding: [24, 24], animate: false });
  }, [map, revision, bounds]);
  return null;
}
