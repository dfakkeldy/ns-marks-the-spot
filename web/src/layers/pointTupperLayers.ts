import type { ContextFeatureStyle, ContextLayerDescriptor } from "./contextLayerTypes";

/** The live site is promoted from nightly, so its receipts are linked there. */
const REPOSITORY = "https://github.com/dfakkeldy/ns-marks-the-spot/blob/nightly";

/** Served from `web/public/point-tupper/`, outside the bundle; `LICENCE.txt` sits beside it. */
export const POINT_TUPPER_SITES_URL = `${import.meta.env.BASE_URL}point-tupper/sites.geojson`;
export const POINT_TUPPER_SOURCES_URL = `${REPOSITORY}/docs/point-tupper-sources.md`;
export const POINT_TUPPER_LICENCE_URL = `${REPOSITORY}/web/public/point-tupper/LICENCE.txt`;
/** Every place in `sites.geojson` lies inside this envelope (pinned by pointTupperLayers.test.ts). */
export const POINT_TUPPER_SITES_COVERAGE = { west: -61.8, south: 45.5, east: -60.7, north: 45.75 } as const;

export type PointTupperSiteKind = "terminal" | "power" | "water" | "community";

/** Marker colours and legend labels by kind. */
export const pointTupperSiteKinds: Readonly<Record<PointTupperSiteKind, { label: string; color: string }>> = {
  terminal: { label: "EverWind terminal", color: "#9c3d10" },
  power: { label: "Power", color: "#5b3a9e" },
  water: { label: "Water supply", color: "#0b5f73" },
  community: { label: "Mi'kmaw community (place label only)", color: "#3f5f2a" },
};

const pin = (color: string, radius: number): ContextFeatureStyle => ({ color: "#ffffff", fillColor: color, fillOpacity: 1, weight: 2.5, radius });

/**
 * A handful of key places for the /pointtupper page, each placed from a public
 * source (docs/point-tupper-sources.md). The data-centre campus footprint has
 * not been published, so no campus shape is drawn.
 */
export const pointTupperLayers = [
  {
    id: "point-tupper-sites",
    name: "Point Tupper · key places",
    category: "point-tupper-site",
    serviceUrl: POINT_TUPPER_SITES_URL,
    vectorSource: { kind: "geojson", url: POINT_TUPPER_SITES_URL },
    sourceUrl: POINT_TUPPER_SOURCES_URL,
    licenceUrl: POINT_TUPPER_LICENCE_URL,
    licence: "cc-by",
    provenance: "project-derived",
    attribution: "NS Marks The Spot Point Tupper places: the project's own wording under CC BY 4.0. Positions from Wikidata (CC0) and the EverWind EA registration (Nova Scotia Environment and Climate Change). No endorsement by any source is implied.",
    sourceDate: "Sources read October 19, 2026",
    scale: "Single points from published coordinates; not site boundaries",
    coverage: "Five places around the Strait of Canso; not a complete inventory",
    // Must equal the `notice` in sites.geojson (pinned by pointTupperLayers.test.ts).
    webCaveat: "Key places for the Point Tupper data-centre campus, each from a public source. The campus footprint has not been published, so it is not drawn.",
    minZoom: 7,
    maxZoom: 23,
    opacity: 1,
    zIndex: 249,
    exportOptions: { transparent: true },
    delivery: "feature-query",
    idField: "id",
    labelField: "name",
    coverageBounds: POINT_TUPPER_SITES_COVERAGE,
    popupFields: [
      { field: "note", label: "About" },
      { field: "located_by", label: "Position from" },
      { field: "source", label: "Source" },
      { field: "source_date", label: "Date" },
    ],
    featureRenderer: {
      field: "kind",
      styles: {
        terminal: pin(pointTupperSiteKinds.terminal.color, 9),
        power: pin(pointTupperSiteKinds.power.color, 8),
        water: pin(pointTupperSiteKinds.water.color, 8),
        community: pin(pointTupperSiteKinds.community.color, 7),
      },
      defaultStyle: pin("#555555", 7),
    },
    legend: (Object.keys(pointTupperSiteKinds) as PointTupperSiteKind[]).map((kind) => ({
      label: pointTupperSiteKinds[kind].label, color: pointTupperSiteKinds[kind].color,
    })),
  },
] as const satisfies readonly ContextLayerDescriptor[];
