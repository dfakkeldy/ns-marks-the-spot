import { openInfrastructureSource } from "./openDataSources";
import { PROVINCE_LICENSE_URL } from "../licensing/provinceLicense";
import type { ContextLayerDescriptor } from "./contextLayerTypes";

const BASE = "https://nsgiwa.novascotia.ca/arcgis/rest/services/BASE";
const service = (theme: string) => `${BASE}/BASE_NSTDB_10k_${theme}_UT83/MapServer`;
const common = {
  licence: "province-restricted",
  licenceUrl: PROVINCE_LICENSE_URL,
  sourceDate: "Live NSTDB service · checked September 7, 2026 · capture dates vary by sheet",
  scale: "NSTDB 1:10,000 · publisher scale-dependent symbols",
  coverage: "Nova Scotia · mapped features only; omissions are not evidence of absence",
  minZoom: 13,
  maxZoom: 23,
  maxNativeZoom: 19,
  opacity: 0.9,
} as const;

type FeatureSelection = readonly [layerId: number, descriptions: readonly string[]];

/** Preserve exact source feature classes in the open replacement; omit callout copies. */
function filtered(theme: string, selections: readonly FeatureSelection[]) {
  return {
    openData: openInfrastructureSource(theme, selections),
    serviceUrl: service(theme),
    sourceUrl: service(theme),
    exportOptions: {
      transparent: true,
      dynamicLayers: JSON.stringify(selections.map(([layerId, descriptions]) => ({
        id: layerId,
        source: { type: "mapLayer", mapLayerId: layerId },
        definitionExpression: `FEAT_DESC IN (${descriptions.map((value) => `'${value.replaceAll("'", "''")}'`).join(", ")})`,
      }))),
    },
    legend: selections.flatMap(([, descriptions]) => descriptions.map((label) => ({ label }))),
  };
}

// Keep the original service definitions as the class-selection reference.
// contextLayerCatalog replaces filtered entries with their verified open datasets.
// The complete provincial topographic cartography retains its service licence.
export const infrastructureLayers = [
  {
    ...common,
    id: "ns-topographic",
    name: "Nova Scotia topographic map",
    category: "background-maps",
    serviceUrl: service("Colour"),
    sourceUrl: service("Colour"),
    minZoom: 5,
    opacity: 1,
    zIndex: 145,
    exportOptions: { transparent: false },
    webCaveat: "Provincial colour background with GeoNAMES · source scale limits apply; closer zoom adds no survey precision",
    legend: [{ label: "NSTDB colour cartography with GeoNAMES" }],
  },
  {
    ...common,
    ...filtered("Utilities", [[2, ["TRANSMISSION LINE (electrical) line"]]]),
    id: "transmission-lines",
    name: "Electrical transmission lines",
    category: "roads-places",
    minZoom: 11,
    zIndex: 240,
    webCaveat: "Mapped electrical lines · no voltage, capacity, connection availability or easement evidence",
  },
  {
    ...common,
    ...filtered("Utilities", [
      [3, ["SUBSTATION (transformer) polygon"]],
      [1, ["SUBSTATION (transformer) point"]],
    ]),
    id: "substations",
    name: "Electrical substations",
    category: "roads-places",
    zIndex: 241,
    webCaveat: "Mapped transformer sites · no operating status, connection capacity or access permission",
  },
  {
    ...common,
    ...filtered("Utilities", [[2, [
      "PIPELINE (cross country) line",
      "PIPELINE (cross country) overhead line",
      "PIPELINE (cross country) underground line",
    ]]]),
    id: "pipelines",
    name: "Cross-country pipelines",
    category: "roads-places",
    minZoom: 11,
    zIndex: 239,
    webCaveat: "Mapped general, overhead and underground classes · not a utility locate or evidence of contents, service or easements",
  },
  {
    ...common,
    ...filtered("Utilities", [
      [3, ["TANK (over 15m diameter) polygon"]],
      [1, ["TANK (6-15m diameter) point", "TANK indefinite/approximate point"]],
    ]),
    id: "tanks",
    name: "Mapped tanks",
    category: "roads-places",
    zIndex: 242,
    webCaveat: "Mapped tank footprints and points, including approximate positions · contents and operating status unknown",
  },
  {
    ...common,
    ...filtered("Utilities", [[1, [
      "TOWER (all except transmission line towers) point",
      "TOWER (all except transmission line towers) indefinite/approximate point",
    ]]]),
    id: "towers",
    name: "Mapped towers",
    category: "roads-places",
    zIndex: 243,
    webCaveat: "Excludes transmission-line towers · includes approximate positions; no height, purpose or operating-status evidence",
  },
  {
    ...common,
    ...filtered("Utilities", [
      [3, ["SEWAGE SETTLING POND  (over 15m diameter) polygon"]],
      [1, ["SEWAGE SETTLING POND  (6-15m diameter) point"]],
    ]),
    id: "sewage-settling-ponds",
    name: "Sewage settling ponds",
    category: "environment-hazards",
    zIndex: 228,
    webCaveat: "Mapped ponds · no current discharge, contamination, capacity or setback evidence",
  },
  {
    ...common,
    ...filtered("Designated_Areas", [[1, ["SEWAGE TREATMENT PLANT polygon"]]]),
    id: "sewage-treatment-plants",
    name: "Sewage treatment plants",
    category: "environment-hazards",
    zIndex: 227,
    webCaveat: "Mapped facility areas · no operating status, capacity, discharge or contamination evidence",
  },
  {
    ...common,
    ...filtered("Designated_Areas", [[1, ["DUMP / SANITARY LANDFILL polygon", "AUTO SALVAGE YARD polygon"]]]),
    id: "waste-salvage-sites",
    name: "Dumps, sanitary landfills and salvage yards",
    category: "environment-hazards",
    zIndex: 226,
    webCaveat: "Mapped site classes · excludes land-reclamation landfill; no current activity or contamination conclusion",
  },
  {
    ...common,
    ...filtered("Designated_Areas", [[1, [
      "PIT polygon", "PIT ruin/inactive/abandoned polygon",
      "QUARRY polygon", "QUARRY ruin/inactive/abandoned polygon",
      "MINE/OPEN PIT polygon", "MINE/OPEN PIT ruin/inactive/abandoned polygon",
      "PEAT CUTTING polygon", "DISPOSAL PILE (mines) polygon",
    ]]]),
    id: "pits-quarries-surface-workings",
    name: "Pits, quarries and surface workings",
    category: "geology-resources",
    minZoom: 12,
    zIndex: 225,
    webCaveat: "Includes mapped inactive/abandoned classes, peat cutting and mine disposal piles · no current activity, reserves, contamination or mineral-rights conclusion",
  },
  {
    ...common,
    ...filtered("Water", [
      [6, ["Breakwater polygon", "Dry Dock polygon", "Slipway polygon", "Wharf polygon", "Wharf - Ruin/Inactive/Abandoned polygon", "Wharf - Under Construction polygon"]],
      [3, ["Breakwater line", "Wharf - Single Line"]],
    ]),
    id: "wharves-coastal-structures",
    name: "Wharves and coastal structures",
    category: "water-terrain",
    zIndex: 235,
    webCaveat: "NSTDB water-theme wharves, breakwaters, dry docks and slipways, including inactive/construction classes · no safe landing, navigation or public-access conclusion",
  },
  {
    ...common,
    ...filtered("Structures", [
      [2, ["GATE (non-NSRN gates along fences or other linear features) line"]],
      [1, ["GATE (non-NSRN gates) point", "GATE indefinite/approximate point"]],
    ]),
    id: "mapped-gates",
    name: "Mapped gates",
    category: "roads-places",
    zIndex: 245,
    webCaveat: "NSTDB non-NSRN and approximate gates · incomplete inventory; no present open/closed status or right of access",
  },
  {
    ...common,
    ...filtered("Designated_Areas", [[1, ["CAMPGROUND polygon"]]]),
    id: "campgrounds",
    name: "Mapped campgrounds",
    category: "roads-places",
    zIndex: 218,
    webCaveat: "Mapped campground areas · no current operation, availability, facilities or camping permission",
  },
  {
    ...common,
    ...filtered("Designated_Areas", [[1, ["CEMETERY polygon"]]]),
    id: "cemeteries",
    name: "Mapped cemeteries",
    category: "roads-places",
    zIndex: 219,
    webCaveat: "Mapped cemetery areas · no individual grave locations, completeness or public-access permission",
  },
  {
    ...common,
    ...filtered("Designated_Areas", [[1, [
      "SCENIC LOOKOUT paved (along highways) polygon", "SCENIC LOOKOUT unpaved (along highways) polygon",
      "REST AREA paved (along highways) polygon", "REST AREA unpaved (along highways) polygon",
    ]]]),
    id: "lookouts-rest-areas",
    name: "Scenic lookouts and rest areas",
    category: "roads-places",
    zIndex: 220,
    webCaveat: "Mapped highway sites, paved and unpaved · no current facilities, stopping safety or access permission",
  },
  {
    ...common,
    ...filtered("Designated_Areas", [[1, ["SHOOTING RANGE polygon"]]]),
    id: "shooting-ranges",
    name: "Mapped shooting ranges",
    category: "roads-places",
    zIndex: 221,
    webCaveat: "Mapped range areas · no current operation, safety boundary or permission to enter or shoot",
  },
] as const satisfies readonly ContextLayerDescriptor[];
