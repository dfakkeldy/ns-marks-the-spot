import type { ContextFeatureStyle, ContextLayerDescriptor } from "./contextLayerTypes";

/** The live site is promoted from nightly, so its receipts are linked there. */
const REPOSITORY = "https://github.com/dfakkeldy/ns-marks-the-spot/blob/nightly";

/** Served from `web/public/wind/`, outside the bundle; `LICENCE.txt` sits beside it. */
export const PLANNED_WIND_TURBINES_URL = `${import.meta.env.BASE_URL}wind/planned-turbines.geojson`;
export const INSTALLED_SINCE_2018_URL = `${import.meta.env.BASE_URL}wind/installed-since-2018.geojson`;
export const PLANNED_WIND_SOURCES_URL = `${REPOSITORY}/docs/planned-wind-turbines-sources.md`;
export const PLANNED_WIND_LICENCE_URL = `${REPOSITORY}/web/public/wind/LICENCE.txt`;
/** Nova Scotia; every turbine in both files lies inside it (pinned by plannedWindLayers.test.ts). */
export const PLANNED_WIND_COVERAGE = { west: -66.6, south: 43.3, east: -59.6, north: 47.1 } as const;

/**
 * Hollow, in the orange Rhodena uses for its proposed turbines: drawn in
 * outline because none of them is operating yet. Installed turbines are filled.
 */
export const PLANNED_TURBINE_COLOR = "#b24719";
const planned: ContextFeatureStyle = { color: PLANNED_TURBINE_COLOR, fillColor: PLANNED_TURBINE_COLOR, fillOpacity: 0.3, weight: 1.5, radius: 6, marker: { glyph: "turbine", hollow: true } };

/** NRCan's installed cyan, so every operating turbine reads alike whichever source placed it. */
export const INSTALLED_TURBINE_COLOR = "#0891b2";
const installed: ContextFeatureStyle = { color: INSTALLED_TURBINE_COLOR, fillColor: INSTALLED_TURBINE_COLOR, fillOpacity: 0.85, weight: 1, radius: 6, marker: { glyph: "turbine" } };

const POPUP_FIELDS = [
  { field: "project", label: "Project" },
  { field: "proponent", label: "Proponent" },
  { field: "status", label: "Status" },
  { field: "status_date", label: "Status date" },
  { field: "layout_role", label: "Layout" },
  { field: "project_turbines", label: "Turbines in project" },
  { field: "project_capacity_mw", label: "Project capacity (MW)" },
  { field: "tip_height_m", label: "Tip height (m)" },
  { field: "coords_as_published", label: "Coordinates as published" },
  { field: "source", label: "Source" },
  { field: "source_locator", label: "Where in the source" },
] as const;

/**
 * Turbine positions read from the coordinate tables in Nova Scotia
 * environmental assessment filings (docs/planned-wind-turbines-sources.md):
 * the planned ones, and the farms built since NRCan's inventory stops (2018).
 * The positions are facts from public records, so the layers follow Rhodena's
 * terms rather than the project's CC BY wording.
 */
export const windFilingLayers = [
  {
    id: "planned-wind-turbines",
    name: "Planned wind turbines (NS EA filings)",
    category: "roads-places",
    serviceUrl: PLANNED_WIND_TURBINES_URL,
    vectorSource: { kind: "geojson", url: PLANNED_WIND_TURBINES_URL },
    sourceUrl: PLANNED_WIND_SOURCES_URL,
    licenceUrl: PLANNED_WIND_LICENCE_URL,
    licence: "public-facts",
    provenance: "project-derived",
    attribution: "Planned turbine positions: factual extracts from Nova Scotia environmental assessment filings by each project's proponent, compiled by NS Marks The Spot. Original source rights retained.",
    sourceDate: "Filings read October 24, 2026; layouts dated by each filing",
    scale: "Single points from published coordinate tables; assessed layouts, not as-built surveys",
    coverage: "Nova Scotia projects with published turbine coordinates, as listed in the receipt; a project not listed is not evidence that none is planned",
    // Must equal the `notice` in planned-turbines.geojson (pinned by plannedWindLayers.test.ts).
    webCaveat: "Wind turbine positions from tables in Nova Scotia environmental assessment filings: assessed layouts, subject to change, not as-built surveys. Some farms are under construction and one is still under review; an approval does not mean a farm will be built. Alternate and dropped sites, approvals that may have lapsed, and turbines already operating are left out.",
    minZoom: 7,
    maxZoom: 23,
    opacity: 1,
    zIndex: 237,
    exportOptions: { transparent: true },
    delivery: "feature-query",
    idField: "id",
    labelField: "turbine",
    permanentLabels: { minZoom: 15 },
    coverageBounds: PLANNED_WIND_COVERAGE,
    popupFields: POPUP_FIELDS,
    featureRenderer: { styles: {}, defaultStyle: planned },
    legend: [{ label: "Planned turbine (assessed position)", color: PLANNED_TURBINE_COLOR, marker: { glyph: "turbine", hollow: true } }],
  },
  {
    id: "wind-turbines-since-2018",
    name: "Installed wind turbines since 2018 (NS EA filings)",
    category: "roads-places",
    serviceUrl: INSTALLED_SINCE_2018_URL,
    vectorSource: { kind: "geojson", url: INSTALLED_SINCE_2018_URL },
    sourceUrl: PLANNED_WIND_SOURCES_URL,
    licenceUrl: PLANNED_WIND_LICENCE_URL,
    licence: "public-facts",
    provenance: "project-derived",
    attribution: "Turbine positions: factual extracts from Nova Scotia environmental assessment filings by each project's proponent, compiled by NS Marks The Spot; build status checked against Copernicus Sentinel-2 imagery. Original source rights retained.",
    sourceDate: "Filings read October 24, 2026; layouts dated by each filing; imagery to October 24, 2026",
    scale: "Single points from published coordinate tables; EA layouts, not as-built surveys",
    coverage: "Nova Scotia wind farms that entered service after NRCan's inventory stops (2018), as listed in the receipt",
    // Must equal the `notice` in installed-since-2018.geojson (pinned by plannedWindLayers.test.ts).
    webCaveat: "Wind turbines built in Nova Scotia since 2018, which NRCan's database does not list yet. Positions are from tables in each farm's environmental assessment filing, not as-built surveys: some turbines were built up to about 130 m from the tabulated spot, and each point says how far the nearest cleared pad is in Sentinel-2 imagery.",
    minZoom: 7,
    maxZoom: 23,
    opacity: 0.85,
    zIndex: 238,
    exportOptions: { transparent: true },
    delivery: "feature-query",
    idField: "id",
    labelField: "turbine",
    permanentLabels: { minZoom: 15 },
    coverageBounds: PLANNED_WIND_COVERAGE,
    popupFields: POPUP_FIELDS,
    featureRenderer: { styles: {}, defaultStyle: installed },
    legend: [{ label: "Installed since 2018 (EA position)", color: INSTALLED_TURBINE_COLOR, marker: { glyph: "turbine" } }],
  },
] as const satisfies readonly ContextLayerDescriptor[];
