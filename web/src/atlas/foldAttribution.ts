import type { Map as MapLibreMap } from "maplibre-gl";

/**
 * MapLibre opens a compact attribution expanded, and re-opens it as sources
 * load. On a phone that card covered the scale bar and a third of the view.
 * Fold it to its (i) button once the map is up; the full credit stays one tap
 * away. `always` folds it on every width.
 */
export function foldCompactAttribution(map: MapLibreMap, always = false): void {
  if (!always && !window.matchMedia?.("(max-width: 860px)").matches) return;
  const fold = () => map.getContainer().querySelector(".maplibregl-ctrl-attrib")?.classList.remove("maplibregl-compact-show");
  fold();
  map.once("load", fold);
  map.once("idle", fold);
}
