import type { ContextFeatureStyle, ContextLayerDescriptor } from "./contextLayerTypes";

const NS_OPEN_LICENCE = "https://novascotia.ca/opendata/licence.asp";
const CA_OPEN_LICENCE = "https://open.canada.ca/en/open-government-licence-canada";
/** The live site is promoted from nightly, so its receipts are linked there. */
const REPOSITORY = "https://github.com/dfakkeldy/ns-marks-the-spot/blob/nightly";
const SMALL_CRAFT_HARBOURS = "https://egisp.dfo-mpo.gc.ca/arcgis/rest/services/open_data_donnees_ouvertes/small_craft_harbours_en/MapServer";
const SMALL_CRAFT_HARBOURS_RECORD = "https://open.canada.ca/data/en/dataset/262451e7-6416-47b5-8453-f31d212ea657";

/** Served from `web/public/fishing/`, outside the bundle; `LICENCE.txt` and the receipts sit beside them. */
export const FISHING_SPOTS_URL = `${import.meta.env.BASE_URL}fishing/spots.geojson`;
export const STOCKED_WATERS_URL = `${import.meta.env.BASE_URL}fishing/stocked-waters.geojson`;
/** Matches `source.json` → `spots.coverageBounds`, which `check:fishing` enforces on every pin. */
export const FISHING_SPOTS_COVERAGE = { west: -62.2, south: 45.3, east: -60.5, north: 46.4 } as const;

/** The exact property set of each feature in `spots.geojson` (the export allowlist). */
export const FISHING_SPOT_FIELDS = [
  "id", "name", "area", "water_type", "kind", "species", "species_text", "best_months", "peak_months",
  "access", "tip", "why", "caution", "evidence", "sources", "rules_ref",
] as const;

export type FishingWaterType = "salt" | "brackish-tidal" | "fresh-lake";
export type FishingEvidence = "stocking-data" | "survey-data" | "dfo-assessment" | "park-or-agency" | "reputation" | "inference";

/** One curated spot. `species` keys and `rules_ref` ids resolve in `calendar.json` and `rules.json`. */
export interface FishingSpotProperties {
  id: string;
  name: string;
  area: string;
  water_type: FishingWaterType;
  kind: string;
  species: string[];
  /** The same species, flattened for scalar-only popups. */
  species_text: string;
  /** Fish biology and reported quality, never open seasons. */
  best_months: number[];
  peak_months: number[];
  access: string;
  tip: string;
  why: string;
  caution: string;
  evidence: FishingEvidence;
  sources: string[];
  rules_ref: string[];
}

/**
 * Pin colours and labels by water type, shared with the page's cards so a card
 * matches its pin. Each holds at least 5:1 under the pins' white numerals.
 */
export const fishingWaterTypes: Readonly<Record<FishingWaterType, { label: string; color: string }>> = {
  salt: { label: "Salt water", color: "#b8440a" },
  "brackish-tidal": { label: "Brackish, tidal", color: "#6a3d9a" },
  "fresh-lake": { label: "Fresh water (lake or pond)", color: "#a3004f" },
};

export const fishingEvidenceLabels: Readonly<Record<FishingEvidence, string>> = {
  "stocking-data": "Provincial stocking records",
  "survey-data": "Provincial fish survey records",
  "dfo-assessment": "DFO assessment",
  "park-or-agency": "Park or agency page",
  reputation: "Reputation (listings and reports), not catch data",
  inference: "Project inference from habitat, not catch data",
};

const pin = (fillColor: string, radius: number): ContextFeatureStyle => ({
  color: "#ffffff", fillColor, fillOpacity: 0.95, weight: 1.5, radius,
});
const spotStyle = (type: FishingWaterType) => pin(fishingWaterTypes[type].color, 7);
const waterTypeLabels: Readonly<Record<string, string>> = Object.fromEntries(
  Object.entries(fishingWaterTypes).map(([type, { label }]) => [type, label]),
);

const STILL_WATER = "#8c510a";
const RUNNING_WATER = "#c98a2c";
const CORE_HARBOUR = "#253494";
const NON_CORE_HARBOUR = "#2ea5b8";

const harbourFields = ["OBJECTID", "Harbour_number", "Harbour_Name", "Harbour_Type", "Managed_by"] as const;
const harbourPopup = [
  { field: "Harbour_Name", label: "Harbour" },
  { field: "Harbour_number", label: "DFO harbour number" },
  { field: "Harbour_Type", label: "Harbour type" },
  { field: "Managed_by", label: "Managed by" },
] as const;
const harbourCommon = {
  category: "water-terrain",
  delivery: "feature-query",
  sourceUrl: SMALL_CRAFT_HARBOURS_RECORD,
  licenceUrl: CA_OPEN_LICENCE,
  licence: "canada-open",
  attribution: "Contains information licensed under the Open Government Licence – Canada. Source: Fisheries and Oceans Canada, Small Craft Harbours Locations and Information.",
  sourceDate: "Federal dataset modified 24 March 2026; live service checked 13 October 2026",
  scale: "Published harbour point; not a wharf outline, berth or launch location",
  minZoom: 8,
  maxZoom: 23,
  opacity: 1,
  // Ask the service for Nova Scotia rows only, so a view on a shared shore does
  // not mix in New Brunswick or PEI harbours. Rows with a blank province are
  // left out rather than assigned one.
  featureWhere: "Province = 'NS'",
  idField: "OBJECTID",
  outFields: harbourFields,
  labelField: "Harbour_Name",
  popupFields: harbourPopup,
} as const;

/**
 * Fishing context for the web map. The curated spots are the project's own
 * screening notes and say so; the stocked waters and harbours keep their
 * publishers' identities. None of these layers states a season, a limit or a
 * right of access: rule text lives in `rules.json`, behind the page's date gate.
 */
export const fishingLayers = [
  {
    id: "fishing-spots",
    name: "Curated fishing spots",
    category: "water-terrain",
    serviceUrl: FISHING_SPOTS_URL,
    vectorSource: { kind: "geojson", url: FISHING_SPOTS_URL },
    sourceUrl: `${REPOSITORY}/docs/gis-fishing-sources.md`,
    licenceUrl: `${REPOSITORY}/web/public/fishing/LICENCE.txt`,
    licence: "cc-by",
    provenance: "project-derived",
    attribution: "NS Marks The Spot curated fishing spots: the project's own wording under CC BY 4.0. Positions and open-data facts contain information licensed under the Open Government Licence – Nova Scotia and the Open Government Licence – Canada. No endorsement by any data provider is implied.",
    sourceDate: "Spots checked 2026-10-12",
    scale: "Project-placed points on open-data features (road edges, harbours, park entrances); distances in the text are straight lines, not surveys",
    coverage: "27 hand-picked spots in southern Cape Breton, the Strait of Canso area and the Antigonish–Guysborough lakes; not a complete inventory",
    // Must equal the `notice` in spots.geojson (pinned by fishingLayers.test.ts).
    webCaveat: "Screening notes, not access permission or rules. Check the current Anglers' Handbook and DFO notices.",
    // 27 points: visible from the default zoom 9 view and the wider Cape Breton view.
    minZoom: 7,
    maxZoom: 23,
    opacity: 1,
    zIndex: 248,
    exportOptions: { transparent: true },
    delivery: "feature-query",
    idField: "id",
    labelField: "name",
    coverageBounds: FISHING_SPOTS_COVERAGE,
    // Scalars only: the generic popup shows a list as "Not supplied by source".
    // Months, species keys, sources and rule ids are for the /fishing page cards.
    popupFields: [
      { field: "area", label: "Area" },
      { field: "water_type", label: "Water", values: waterTypeLabels },
      { field: "kind", label: "Spot type" },
      { field: "species_text", label: "Species noted (not a catch record)" },
      { field: "evidence", label: "Evidence", values: fishingEvidenceLabels },
      { field: "access", label: "Access notes (not permission)" },
      { field: "caution", label: "Caution" },
      { field: "tip", label: "Tip" },
      { field: "why", label: "Why it is listed" },
    ],
    featureRenderer: {
      field: "water_type",
      styles: { salt: spotStyle("salt"), "brackish-tidal": spotStyle("brackish-tidal"), "fresh-lake": spotStyle("fresh-lake") },
      defaultStyle: pin("#555555", 7),
    },
    legend: (Object.keys(fishingWaterTypes) as FishingWaterType[]).map((type) => ({
      label: `Curated spot · ${fishingWaterTypes[type].label.toLowerCase()}`, color: fishingWaterTypes[type].color,
    })),
  },
  {
    id: "stocked-waters",
    name: "Stocked waters (hatchery records)",
    category: "water-terrain",
    serviceUrl: STOCKED_WATERS_URL,
    vectorSource: { kind: "geojson", url: STOCKED_WATERS_URL },
    sourceUrl: "https://data.novascotia.ca/d/8e4a-m6fw",
    licenceUrl: NS_OPEN_LICENCE,
    licence: "province-open",
    attribution: "Contains information licensed under the Open Government Licence – Nova Scotia. Source: Nova Scotia Fish Hatchery Stocking Records (8e4a-m6fw), located with Municipality Boundaries (7bqh-hssn).",
    sourceDate: "Publisher records current as of 14 April 2026 (dataset rows updated 20 April 2026); snapshot retrieved 13 October 2026",
    scale: "Project-converted points from the publisher's UTM easting and northing, zone inferred by a county check; one point per stocked water",
    coverage: "Province-wide trout stocking, 1976–2025; records the county check could not place, and every salmon release, are withheld (see the receipt)",
    // Must equal the collection `label` in stocked-waters.geojson (pinned by fishingLayers.test.ts).
    webCaveat: "Hatchery records 1976-2025. 2026 releases are not included. Stocked in a past year does not mean stocked this year, and a stocked water is not proof of public access. A stocking record is not an open season: some stocked rivers are now closed or restricted, so check the current Anglers' Handbook.",
    // 1,079 points province-wide. From zoom 9 a view holds a few hundred at
    // most; further out they would bury the curated spots and harbours.
    minZoom: 9,
    maxZoom: 23,
    opacity: 1,
    zIndex: 222,
    exportOptions: { transparent: true },
    delivery: "feature-query",
    idField: "id",
    labelField: "name",
    popupFields: [
      { field: "water_type", label: "Water type" },
      { field: "county", label: "County" },
      { field: "species_text", label: "Species stocked" },
      { field: "years_text", label: "Years stocked" },
      { field: "last_stocked", label: "Last stocking date" },
      { field: "releases", label: "Release records" },
      { field: "released_total", label: "Fish released, all years" },
      { field: "recent_released", label: "Fish released 2023–2025" },
      { field: "source_name", label: "Publisher's water name" },
      { field: "utm_zone", label: "UTM zone used" },
    ],
    featureRenderer: {
      field: "water_type",
      styles: {
        Lake: pin(STILL_WATER, 4.5), Pond: pin(STILL_WATER, 4.5), Flowage: pin(STILL_WATER, 4.5),
        River: pin(RUNNING_WATER, 4.5), Brook: pin(RUNNING_WATER, 4.5),
      },
      defaultStyle: pin("#555555", 4.5),
    },
    legend: [
      { label: "Stocked lake, pond or flowage", color: STILL_WATER },
      { label: "Stocked river or brook", color: RUNNING_WATER },
    ],
  },
  // The service's third layer (2, Recreational) had no Nova Scotia rows when
  // checked on 13 October 2026, so it is not offered.
  {
    ...harbourCommon,
    id: "dfo-small-craft-harbours-core",
    name: "DFO small craft harbours · core fishing",
    serviceUrl: `${SMALL_CRAFT_HARBOURS}/0`,
    coverage: "Core fishing harbours DFO lists in Nova Scotia (149 when checked); two core rows with a blank province are not shown",
    webCaveat: "Commercial fishing harbours run by harbour authorities. A harbour point is not permission to fish from the wharf; each harbour authority sets its own rules.",
    zIndex: 225,
    exportOptions: { transparent: true, layers: "show:0" },
    featureRenderer: { styles: {}, defaultStyle: pin(CORE_HARBOUR, 6) },
    legend: [{ label: "Core fishing harbour (DFO)", color: CORE_HARBOUR }],
  },
  {
    ...harbourCommon,
    id: "dfo-small-craft-harbours-non-core",
    name: "DFO small craft harbours · non-core fishing",
    serviceUrl: `${SMALL_CRAFT_HARBOURS}/1`,
    coverage: "Non-core fishing harbours DFO lists in Nova Scotia (23 when checked)",
    webCaveat: "Smaller fishing harbours DFO classes as non-core; many have no harbour authority. A harbour point is not permission to fish from the wharf.",
    zIndex: 224,
    exportOptions: { transparent: true, layers: "show:1" },
    featureRenderer: { styles: {}, defaultStyle: pin(NON_CORE_HARBOUR, 5) },
    legend: [{ label: "Non-core fishing harbour (DFO)", color: NON_CORE_HARBOUR }],
  },
] as const satisfies readonly ContextLayerDescriptor[];

export type FishingLayerId = (typeof fishingLayers)[number]["id"];

/** The curated-spots descriptor, for the /fishing page's own spot component. */
export const fishingSpotsLayer = fishingLayers[0];

/**
 * Fishing sources reviewed and withheld from the map, its data files and its
 * exports. A catalogue test fails if any layer or shipped file names one.
 */
export const withheldFishingSources = [
  { pattern: "atlantic_salmon_rivers_eastern_north_america", reason: "Salmon-river status layer: no open licence record could be confirmed." },
  { pattern: "Nova_Scotia_Boat_Launches", reason: "Boat-launch layer: no licence is established." },
  { pattern: "Barrier_Free_Data_Collection", reason: "Barrier-free fishing sites: no licence, and the layer holds staff contact details." },
  { pattern: "06338988ce444d16aa2fb4e35315ea61", reason: "Barrier-free fishing sites (catalogue item): no licence." },
  { pattern: "api-iwls", reason: "Tide and water-level service: the data are not open." },
  { pattern: "project-osrm", reason: "Routing demo server: not used for any fishing data." },
] as const;
