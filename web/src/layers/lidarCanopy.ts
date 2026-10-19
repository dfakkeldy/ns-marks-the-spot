import pilot from "./lidarCanopyPilot.json";
import type { ContextLayerDescriptor } from "./contextLayerTypes";

/** Disabled until an explicitly configured local or approved immutable tile host exists. */
export function canopyTileBaseUrl(value: string = import.meta.env.VITE_CHM_TILE_BASE_URL ?? ""): string | null {
  const base = value.trim().replace(/\/+$/u, "");
  if (!base) return null;
  const url = new URL(base);
  const local = url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname);
  if ((!local && url.protocol !== "https:") || url.username || url.password || url.search || url.hash) {
    throw new Error("CHM tile hosts require HTTPS or local HTTP, without credentials or query state.");
  }
  return base;
}

const base = canopyTileBaseUrl();
export const lidarCanopyLayer = {
  id: "lidar-canopy-height",
  name: pilot.name,
  category: "forestry-ecology",
  delivery: "tile",
  tileUrl: base ? `${base}/${pilot.revision}/{z}/{x}/{y}.png` : undefined,
  unavailableReason: base ? undefined : "Pilot tiles are not published. Licence confirmation is pending.",
  serviceUrl: pilot.indexUrl,
  sourceUrl: pilot.sourceUrl,
  licenceUrl: pilot.licenceUrl,
  licence: "province-restricted",
  attribution: pilot.attribution,
  sourceDate: pilot.sheets.map(({ sheet, project, year }) => `Sheet ${sheet} · lidar ${year} · project ${project}`).join("; "),
  scale: "1 m source pixels; height above ground in metres. Height classes and XYZ tiles are project-derived; zoom 18+ enlarges zoom 17.",
  coverage: "One 10K sheet around Judique, Inverness County, Cape Breton, about 43 km². Transparent areas include source NoData; outside the pilot is not evidence of no forest.",
  webCaveat: "2017 lidar, from the Province's 2016–2020 CHM collection. This is not a timber cruise or a current inspection. It differs from inventory-based Forest stand height. CHM licence coverage is provisional; local preview only pending confirmation.",
  minZoom: pilot.minZoom,
  maxZoom: 23,
  maxNativeZoom: pilot.maxNativeZoom,
  coverageBounds: pilot.bounds,
  opacity: 0.72,
  zIndex: 175,
  exportOptions: { transparent: true },
  legend: [...pilot.classes.map(({ label, color }) => ({ label, color })),
    { label: "Transparent · NoData, invalid/negative height, or outside pilot; not zero height" }],
} as const satisfies ContextLayerDescriptor;
