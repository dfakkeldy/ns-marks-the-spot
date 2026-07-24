import { OPEN_GOVERNMENT_LICENCE_TERMS_URL } from "../licensing/provinceLicense";

export type NativeLayerId =
  | "fletcher"
  | "ns-aerial"
  | "nsprd"
  | "crown-lands"
  | "flood-risk"
  | "waterfalls"
  | "water-features"
  | "roads";

export type TopographyLayerId = "contours";

export type WebOnlyProvinceLayerId = "buildings" | TopographyLayerId;

export type ProvinceLayerId =
  | Exclude<NativeLayerId, "fletcher">
  | WebOnlyProvinceLayerId;

export type WebMapLayerId = NativeLayerId | WebOnlyProvinceLayerId;

export type SourceResourceLayerId =
  | "mineral-occurrences"
  | "mineral-tenure"
  | "abandoned-mines";

export type DerivedResourceLayerId = "mineral-proximity-parcels";

export type ResourceLayerId = SourceResourceLayerId | DerivedResourceLayerId;

export type HydroPilotLayerId = "inverness-hydro-potential";

export type FloodHazardLayerId =
  | "published-river-flood-zones"
  | "coastal-flood-current"
  | "coastal-flood-2050"
  | "coastal-flood-2100";

export type FloodHazardLayerDescriptor = {
  id: FloodHazardLayerId;
  name: string;
  serviceUrl: string;
  sourceUrl: string;
  licenceUrl: string;
  minZoom: number;
  maxZoom: number;
  opacity: number;
  licence: "province-restricted" | "province-open";
  webCaveat: string;
  sourceDate: string;
  scale: string;
  coverage: string;
  exportOptions: ArcGISExportOptions;
};

export type EnvironmentalHealthLayerId =
  | "arsenic-risk-wells"
  | "uranium-risk-wells"
  | "manganese-risk-wells"
  | "surficial-aquifers";

/**
 * `well-water-risk` layers classify every bedrock unit into relative risk
 * bands from sampled wells; `aquifer-context` layers map aquifer extent and
 * carry no risk rating at all. The distinction keeps context mapping from
 * being read as a hazard call.
 */
export type EnvironmentalHealthScreening = "well-water-risk" | "aquifer-context";

/**
 * A legend band mirroring the province's own renderer. Each service ships a
 * different ramp (arsenic is purple, uranium olive-to-grey, manganese
 * greyscale), so the colours are carried per layer rather than shared.
 */
export type EnvironmentalHealthRiskBand = {
  label: string;
  color: string;
};

export type EnvironmentalHealthLayerDescriptor = {
  id: EnvironmentalHealthLayerId;
  name: string;
  serviceUrl: string;
  sourceUrl: string;
  licenceUrl: string;
  minZoom: number;
  maxZoom: number;
  opacity: number;
  licence: "province-restricted" | "province-open";
  screening: EnvironmentalHealthScreening;
  /** Legend bands exactly as the province's own service publishes them. */
  riskBands: readonly EnvironmentalHealthRiskBand[];
  /** The province's own recommendation to the reader; shown with the layer. */
  guidance: string;
  webCaveat: string;
  sourceDate: string;
  scale: string;
  coverage: string;
  exportOptions: ArcGISExportOptions;
};

export type HydroPilotLayerDescriptor = {
  id: HydroPilotLayerId;
  name: string;
  sourceUrl: string;
  serviceUrl: string;
  minZoom: number;
  maxZoom: number;
  opacity: number;
  licence: "province-open";
  webCaveat: string;
  sourceDate: string;
  scale: string;
  coverage: string;
};

export type ArcGISExportOptions = {
  transparent: boolean;
  layers?: string;
  dynamicLayers?: string;
  dpi?: number;
};

export type WebLayerDescriptor = {
  id: WebMapLayerId;
  name: string;
  serviceUrl: string;
  nativeDefaultVisibility: boolean;
  minZoom: number;
  maxZoom: number;
  opacity: number;
  licence: "province-restricted" | "rumsey-reference";
  webAvailability: "available" | "rights-pending";
  webCaveat: string;
  sourceDate: string;
  scale: string;
  coverage: string;
  exportOptions?: ArcGISExportOptions;
  exportOverlayOptions?: ArcGISExportOptions;
};

type ResourceLayerBase = {
  id: SourceResourceLayerId;
  name: string;
  serviceUrl: string;
  sourceUrl: string;
  minZoom: number;
  maxZoom: number;
  opacity: number;
  licence: "province-open";
  webCaveat: string;
  sourceDate: string;
  scale: string;
  coverage: string;
};

export type ResourceMapLayerDescriptor = ResourceLayerBase & {
  delivery: "map-export";
  exportOptions: ArcGISExportOptions;
};

export type ResourceFeatureLayerDescriptor = ResourceLayerBase & {
  delivery: "feature-query";
  outFields: readonly string[];
  markerColor: string;
};

export type ResourceLayerDescriptor =
  | ResourceMapLayerDescriptor
  | ResourceFeatureLayerDescriptor;

export type DerivedResourceLayerDescriptor = {
  id: DerivedResourceLayerId;
  name: string;
  delivery: "derived-parcel-query";
  sourceUrl: string;
  minZoom: number;
  maxZoom: number;
  webCaveat: string;
  sourceDate: string;
  scale: string;
  coverage: string;
  requiresProvinceLicence: true;
};

export type ResourceControlDescriptor =
  | ResourceLayerDescriptor
  | DerivedResourceLayerDescriptor;

const PROPERTY_DYNAMIC_LAYERS = JSON.stringify([
  {
    id: 0,
    source: { type: "mapLayer", mapLayerId: 0 },
    drawingInfo: { showLabels: false },
  },
]);

const CROWN_LANDS_DYNAMIC_LAYERS = JSON.stringify([
  {
    id: 0,
    source: { type: "mapLayer", mapLayerId: 0 },
    drawingInfo: {
      renderer: {
        type: "simple",
        symbol: {
          type: "esriSFS",
          style: "esriSFSSolid",
          color: [46, 180, 46, 128],
          outline: {
            type: "esriSLS",
            style: "esriSLSSolid",
            color: [0, 100, 0, 255],
            width: 2,
          },
        },
      },
      labelingInfo: [],
    },
  },
]);

const WATERFALLS_DYNAMIC_LAYERS = JSON.stringify([
  {
    id: 1,
    source: { type: "mapLayer", mapLayerId: 1 },
    definitionExpression:
      "FEAT_DESC = 'Falls -  On a single line river point'",
    drawingInfo: {
      renderer: {
        type: "simple",
        symbol: {
          type: "esriSMS",
          style: "esriSMSCircle",
          color: [0, 120, 255, 255],
          size: 8,
          outline: {
            type: "esriSLS",
            style: "esriSLSSolid",
            color: [255, 255, 255, 255],
            width: 1.5,
          },
        },
      },
      showLabels: true,
      labelingInfo: [
        {
          labelExpression: "[ZVALUE]",
          labelPlacement: "esriServerPointLabelPlacementAboveRight",
          symbol: {
            type: "esriTS",
            color: [0, 120, 255, 255],
            font: { size: 10, family: "Arial", weight: "bold" },
          },
          minScale: 50_000,
        },
      ],
    },
  },
]);

const TRAIL_TRACK_DEFINITION =
  "FEAT_DESC LIKE '%TRACK%' OR FEAT_DESC LIKE 'TRAIL%'";

const TRAIL_TRACK_CONTRAST_DYNAMIC_LAYERS = JSON.stringify([
  {
    id: 80,
    source: { type: "mapLayer", mapLayerId: 8 },
    definitionExpression: TRAIL_TRACK_DEFINITION,
    drawingInfo: {
      renderer: {
        type: "simple",
        symbol: {
          type: "esriSLS",
          style: "esriSLSDash",
          color: [255, 255, 255, 200],
          width: 1.2,
        },
      },
      labelingInfo: [],
    },
  },
  {
    id: 81,
    source: { type: "mapLayer", mapLayerId: 8 },
    definitionExpression: TRAIL_TRACK_DEFINITION,
    drawingInfo: {
      renderer: {
        type: "simple",
        symbol: {
          type: "esriSLS",
          style: "esriSLSDash",
          color: [43, 39, 48, 255],
          width: 0.8,
        },
      },
      labelingInfo: [],
    },
  },
]);

export const PROPERTY_BOUNDARY_MIN_ZOOM = 14;

export const nativeLayerCatalog: readonly WebLayerDescriptor[] = [
  {
    id: "fletcher",
    name: "Fletcher",
    serviceUrl:
      "https://wmts.oldmapsonline.org/maps/9b86f069-b432-5e78-a4c9-306ee238e5fb/2023-06-13T14:40:41.945831Z/{z}/{x}/{y}.png",
    nativeDefaultVisibility: true,
    minZoom: 0,
    maxZoom: 24,
    opacity: 1,
    licence: "rumsey-reference",
    webAvailability: "rights-pending",
    webCaveat: "Web rights pending",
    sourceDate: "Historical source · scan published 2023",
    scale: "Historical map sheet",
    coverage: "Selected Nova Scotia sheets",
  },
  {
    id: "ns-aerial",
    name: "NS Aerial",
    serviceUrl:
      "https://nsgiwa.novascotia.ca/arcgis/rest/services/BASE/BASE_NSODB_10k_WM84/MapServer",
    nativeDefaultVisibility: false,
    minZoom: 10,
    maxZoom: 23,
    opacity: 1,
    licence: "province-restricted",
    webAvailability: "available",
    webCaveat: "Online imagery · zoom 10+",
    sourceDate: "Imagery dates vary · service checked July 20, 2026",
    scale: "NSODB 1:10,000 imagery",
    coverage: "Nova Scotia",
    exportOptions: { transparent: false },
  },
  {
    id: "nsprd",
    name: "NS Property Boundaries",
    serviceUrl:
      "https://nsgiwa2.novascotia.ca/arcgis/rest/services/PLAN/PLAN_NSPRD_WM84/MapServer",
    nativeDefaultVisibility: false,
    minZoom: PROPERTY_BOUNDARY_MIN_ZOOM,
    maxZoom: 24,
    opacity: 0.82,
    licence: "province-restricted",
    webAvailability: "available",
    webCaveat: "Zoom 14+ · not a survey",
    sourceDate: "Live service · checked July 20, 2026",
    scale: "Display floor 1:36,114",
    coverage: "Nova Scotia",
    exportOptions: {
      transparent: true,
      dynamicLayers: PROPERTY_DYNAMIC_LAYERS,
    },
  },
  {
    id: "crown-lands",
    name: "Crown Lands",
    serviceUrl:
      "https://nsgiwa.novascotia.ca/arcgis/rest/services/PLAN/PLANCrownLandsWM84V1/MapServer",
    nativeDefaultVisibility: false,
    minZoom: 12,
    maxZoom: 24,
    opacity: 0.78,
    licence: "province-restricted",
    webAvailability: "available",
    webCaveat: "Zoom 12+",
    sourceDate: "Live service · checked July 20, 2026",
    scale: "Detailed view from zoom 12",
    coverage: "Nova Scotia",
    exportOptions: {
      transparent: true,
      dynamicLayers: CROWN_LANDS_DYNAMIC_LAYERS,
    },
  },
  {
    id: "flood-risk",
    name: "Watersheds",
    serviceUrl:
      "https://fletcher.novascotia.ca/arcgis/rest/services/mrlu/flood_risk_areas/MapServer",
    nativeDefaultVisibility: false,
    minZoom: 12,
    maxZoom: 24,
    opacity: 0.72,
    licence: "province-restricted",
    webAvailability: "available",
    webCaveat: "Watershed context · not flood-risk mapping · zoom 12+",
    sourceDate: "Live service · checked July 20, 2026",
    scale: "Watershed detail from zoom 12",
    coverage: "Nova Scotia primary, secondary, and tertiary watersheds",
    exportOptions: { transparent: true, layers: "show:24,25,26" },
  },
  {
    id: "waterfalls",
    name: "Waterfalls",
    serviceUrl:
      "https://nsgiwa.novascotia.ca/arcgis/rest/services/BASE/BASE_NSTDB_10k_Water_WM84/MapServer",
    nativeDefaultVisibility: false,
    minZoom: 7,
    maxZoom: 24,
    opacity: 1,
    licence: "province-restricted",
    webAvailability: "available",
    webCaveat: "90 mapped falls · overview on selection",
    sourceDate: "Live service · checked July 20, 2026",
    scale: "NSTDB 1:10,000 point inventory",
    coverage: "Nova Scotia · 90 mapped falls",
    exportOptions: {
      transparent: true,
      dynamicLayers: WATERFALLS_DYNAMIC_LAYERS,
    },
  },
  {
    id: "water-features",
    name: "Water features",
    serviceUrl:
      "https://nsgiwa.novascotia.ca/arcgis/rest/services/BASE/BASE_NSTDB_10k_Water_WM84/MapServer",
    nativeDefaultVisibility: false,
    minZoom: 10,
    maxZoom: 24,
    opacity: 1,
    licence: "province-restricted",
    webAvailability: "available",
    webCaveat: "Rivers, lakes, wetlands & more · zoom 10+",
    sourceDate: "Live service · checked July 20, 2026",
    scale: "NSTDB 1:10,000",
    coverage: "Nova Scotia",
    exportOptions: { transparent: true, dpi: 144 },
  },
  {
    id: "roads",
    name: "Roads, trails & culverts",
    serviceUrl:
      "https://nsgiwa.novascotia.ca/arcgis/rest/services/BASE/BASE_NSTDB_10k_Roads_UT83/MapServer",
    nativeDefaultVisibility: false,
    minZoom: 10,
    maxZoom: 24,
    opacity: 1,
    licence: "province-restricted",
    webAvailability: "available",
    webCaveat: "Highways to trails · culverts close up · zoom 10+",
    sourceDate: "Live service · checked July 20, 2026",
    scale: "NSTDB 1:10,000",
    coverage: "Nova Scotia",
    exportOptions: { transparent: true, dpi: 192 },
    exportOverlayOptions: {
      transparent: true,
      dpi: 192,
      dynamicLayers: TRAIL_TRACK_CONTRAST_DYNAMIC_LAYERS,
    },
  },
] as const;

export const provinceLayerIds: ProvinceLayerId[] = [
  "ns-aerial",
  "nsprd",
  "crown-lands",
  "flood-risk",
  "waterfalls",
  "water-features",
  "roads",
  "buildings",
  "contours",
];

const buildingLayerCatalog: readonly (
  WebLayerDescriptor & { id: "buildings" }
)[] = [
  {
    id: "buildings",
    name: "Buildings",
    serviceUrl:
      "https://nsgiwa.novascotia.ca/arcgis/rest/services/BASE/BASE_NSTDB_10k_Buildings_UT83/MapServer",
    nativeDefaultVisibility: false,
    minZoom: 13,
    maxZoom: 24,
    opacity: 0.9,
    licence: "province-restricted",
    webAvailability: "available",
    webCaveat: "Mapped points & footprints · zoom 13+",
    sourceDate: "NSTDB updated May 5, 2026 · service checked July 22, 2026",
    scale: "NSTDB 1:10,000",
    coverage: "Nova Scotia",
    exportOptions: { transparent: true, dpi: 144 },
  },
] as const;

export const topographyLayerCatalog: readonly (
  WebLayerDescriptor & { id: TopographyLayerId }
)[] = [
  {
    id: "contours",
    name: "Contours",
    serviceUrl:
      "https://nsgiwa.novascotia.ca/arcgis/rest/services/BASE/BASE_NSTDB_10k_Landforms_UT83/MapServer",
    nativeDefaultVisibility: false,
    minZoom: 13,
    maxZoom: 24,
    opacity: 0.88,
    licence: "province-restricted",
    webAvailability: "available",
    webCaveat: "5 m elevation lines · terrain screening only · zoom 13+",
    sourceDate: "NSTDB updated May 5, 2026 · service checked July 22, 2026",
    scale: "LiDAR-derived 5 m contours · labelled index lines",
    coverage: "Nova Scotia",
    exportOptions: {
      transparent: true,
      layers: "show:2,4",
      dpi: 144,
    },
  },
] as const;

export const webOnlyProvinceLayerCatalog: readonly (
  WebLayerDescriptor & { id: WebOnlyProvinceLayerId }
)[] = [
  ...buildingLayerCatalog,
  ...topographyLayerCatalog,
] as const;

export const provinceLayerCatalog: readonly (
  WebLayerDescriptor & { id: ProvinceLayerId }
)[] = [
  ...nativeLayerCatalog.filter(
    (layer): layer is WebLayerDescriptor & {
      id: Exclude<NativeLayerId, "fletcher">;
    } => layer.licence === "province-restricted",
  ),
  ...webOnlyProvinceLayerCatalog,
];

export const initialProvinceLayerVisibility: Record<ProvinceLayerId, boolean> = {
  "ns-aerial": true,
  nsprd: true,
  "crown-lands": false,
  "flood-risk": false,
  waterfalls: false,
  "water-features": true,
  roads: true,
  buildings: false,
  contours: false,
};

const COASTAL_HAZARD_SOURCE_URL = "https://nsgi.novascotia.ca/chm";
const COASTAL_HAZARD_LICENCE_URL =
  "https://nsgiwa.novascotia.ca/documents/licenses/unrestricted/unrestrictedLicense.pdf";

export const floodHazardLayerCatalog: readonly FloodHazardLayerDescriptor[] = [
  {
    id: "published-river-flood-zones",
    name: "Published river flood zones",
    serviceUrl:
      "https://fletcher.novascotia.ca/arcgis/rest/services/mrlu/flood_risk_areas/MapServer",
    sourceUrl:
      "https://fletcher.novascotia.ca/arcgis/rest/services/mrlu/flood_risk_areas/MapServer",
    licenceUrl:
      "https://nsgiwa.novascotia.ca/documents/licenses/MapService/Restricted%20Map%20Services%20License%20-%20NSPRD%20v1.pdf",
    minZoom: 10,
    maxZoom: 24,
    opacity: 0.72,
    licence: "province-restricted",
    webCaveat: "Published 5% and 1% AEP mapping in four study areas",
    sourceDate: "NSGC 2006-era mapping · service checked July 22, 2026",
    scale: "Study-area flood mapping",
    coverage: "Antigonish, Bedford–Sackville, Pictou, and Truro",
    exportOptions: {
      transparent: true,
      layers: "show:2,3,4,5,7,8,9,10,12,13,14,16,17,18",
    },
  },
  {
    id: "coastal-flood-current",
    name: "Coastal flooding — current",
    serviceUrl:
      "https://nsgiwa.novascotia.ca/arcgis/rest/services/OCN/OCN_Projected_Current_Day_Flooding_UT83/MapServer",
    sourceUrl: COASTAL_HAZARD_SOURCE_URL,
    licenceUrl: COASTAL_HAZARD_LICENCE_URL,
    minZoom: 8,
    maxZoom: 24,
    opacity: 0.68,
    licence: "province-open",
    webCaveat: "Current sea level with a 1% AEP storm surge",
    sourceDate: "Live Coastal Hazard Map · checked July 22, 2026",
    scale: "Provincial coastal screening",
    coverage: "Mapped Nova Scotia coast",
    exportOptions: { transparent: true },
  },
  {
    id: "coastal-flood-2050",
    name: "Coastal flooding — 2050",
    serviceUrl:
      "https://nsgiwa.novascotia.ca/arcgis/rest/services/OCN/OCN_Projected_Worst_Case_Flooding_2050_UT83/MapServer",
    sourceUrl: COASTAL_HAZARD_SOURCE_URL,
    licenceUrl: COASTAL_HAZARD_LICENCE_URL,
    minZoom: 8,
    maxZoom: 24,
    opacity: 0.68,
    licence: "province-open",
    webCaveat: "2050 high sea-level scenario with a 1% AEP storm surge",
    sourceDate: "Live Coastal Hazard Map · checked July 22, 2026",
    scale: "Provincial coastal screening",
    coverage: "Mapped Nova Scotia coast",
    exportOptions: { transparent: true },
  },
  {
    id: "coastal-flood-2100",
    name: "Coastal flooding — 2100",
    serviceUrl:
      "https://nsgiwa.novascotia.ca/arcgis/rest/services/OCN/OCN_Projected_Worst_Case_Flooding_2100_UT83/MapServer",
    sourceUrl: COASTAL_HAZARD_SOURCE_URL,
    licenceUrl: COASTAL_HAZARD_LICENCE_URL,
    minZoom: 8,
    maxZoom: 24,
    opacity: 0.68,
    licence: "province-open",
    webCaveat: "2100 high sea-level scenario with a 1% AEP storm surge",
    sourceDate: "Live Coastal Hazard Map · checked July 22, 2026",
    scale: "Provincial coastal screening",
    coverage: "Mapped Nova Scotia coast",
    exportOptions: { transparent: true },
  },
] as const;

export const initialFloodHazardLayerVisibility: Record<
  FloodHazardLayerId,
  boolean
> = {
  "published-river-flood-zones": false,
  "coastal-flood-current": false,
  "coastal-flood-2050": false,
  "coastal-flood-2100": false,
};

// Sampled from each service's own uniqueValue renderer so the rail legend
// matches what the province draws on the map.
const ARSENIC_RISK_BANDS = [
  { label: "High Risk", color: "#993d7a" },
  { label: "Medium Risk", color: "#c363e0" },
  { label: "Low Risk", color: "#d8b5eb" },
] as const;

const URANIUM_RISK_BANDS = [
  { label: "High Risk", color: "#808000" },
  { label: "Medium Risk", color: "#ffffbf" },
  { label: "Low Risk", color: "#b0b0b0" },
] as const;

const MANGANESE_RISK_BANDS = [
  { label: "High Risk", color: "#828282" },
  { label: "Medium Risk", color: "#b2b2b2" },
  { label: "Low Risk", color: "#e1e1e1" },
] as const;

const DEPARTMENTAL_AGREEMENT_LICENCE_URL =
  "https://nsgiwa.novascotia.ca/documents/licenses/MapService/Restricted%20Map%20Services%20License%20-%20NSPRD%20v1.pdf";

/**
 * Provincial screening layers for well-water and indoor-air health hazards.
 *
 * Every risk layer here classifies *bedrock units*, not properties: a parcel
 * inherits the band of the rock beneath it. The province is explicit that a
 * band is not a measurement, so `guidance` carries its testing recommendation
 * and the UI must show it wherever the band is shown.
 *
 * Radon potential (fletcher `radon/radon_cache`) is deliberately absent: its
 * `export` endpoint returns an empty 0x0 image and its only working delivery
 * is a tile cache in NAD83/MTM (wkid 2961), which Leaflet cannot consume
 * without a reprojection dependency. See ARCHITECTURE.md.
 */
export const environmentalHealthLayerCatalog: readonly EnvironmentalHealthLayerDescriptor[] =
  [
    {
      id: "arsenic-risk-wells",
      name: "Arsenic risk — bedrock wells",
      serviceUrl:
        "https://nsgiwa.novascotia.ca/arcgis/rest/services/GEOL/GEOL_hg_ArsenicRiskWaterWells_h499ns_UT83/MapServer",
      sourceUrl:
        "https://novascotia.ca/natr/meb/geoscience-online/arsenicriskwells_about.asp",
      licenceUrl: DEPARTMENTAL_AGREEMENT_LICENCE_URL,
      minZoom: 7,
      maxZoom: 24,
      opacity: 0.55,
      licence: "province-restricted",
      screening: "well-water-risk",
      riskBands: ARSENIC_RISK_BANDS,
      guidance:
        "Testing your well is the only way to find out whether arsenic is a concern in your well, so it is important to test your water no matter where you live.",
      webCaveat:
        "Relative risk zones by bedrock unit · not a test result for this property",
      sourceDate: "Live service · checked July 23, 2026",
      scale:
        "Bedrock-unit risk bands · high risk is >15% of well samples over the 10 µg/L guideline",
      coverage: "Nova Scotia bedrock aquifers",
      exportOptions: { transparent: true },
    },
    {
      id: "uranium-risk-wells",
      name: "Uranium risk — bedrock wells",
      serviceUrl:
        "https://dawson.novascotia.ca/arcgis/rest/services/hg_uranium_risk_h529ns_UT83/MapServer",
      sourceUrl:
        "https://data.novascotia.ca/d/w8ax-dtd5",
      licenceUrl: OPEN_GOVERNMENT_LICENCE_TERMS_URL,
      minZoom: 7,
      maxZoom: 24,
      opacity: 0.55,
      licence: "province-open",
      screening: "well-water-risk",
      riskBands: URANIUM_RISK_BANDS,
      guidance:
        "Risk bands describe bedrock units, not individual wells. Test your well water to find out whether uranium is a concern at this property.",
      webCaveat:
        "Relative risk zones by bedrock unit · not a test result for this property",
      sourceDate: "Open File Report ME 2020-001 · service checked July 23, 2026",
      scale:
        "Bedrock-unit risk bands · high risk is >15% of well samples over the 20 µg/L guideline",
      coverage: "Nova Scotia bedrock aquifers",
      exportOptions: { transparent: true },
    },
    {
      id: "manganese-risk-wells",
      name: "Manganese risk — water wells",
      serviceUrl:
        "https://dawson.novascotia.ca/arcgis/rest/services/hg_manganese_risk_h535ns_UT83/MapServer",
      sourceUrl: "https://novascotia.ca/natr/meb/data/ofr/ofr_me_2021-002.pdf",
      licenceUrl: DEPARTMENTAL_AGREEMENT_LICENCE_URL,
      minZoom: 7,
      maxZoom: 24,
      opacity: 0.55,
      licence: "province-restricted",
      screening: "well-water-risk",
      riskBands: MANGANESE_RISK_BANDS,
      guidance:
        "Risk bands describe bedrock and surficial aquifers, not individual wells. Test your well water to find out whether manganese is a concern at this property.",
      webCaveat:
        "Bedrock and surficial aquifer risk zones · not a test result for this property",
      sourceDate: "Open File Report ME 2021-002 · service checked July 23, 2026",
      scale:
        "Aquifer risk bands · high risk is >15% of well samples over the 120 µg/L guideline",
      coverage: "Nova Scotia bedrock and surficial aquifers",
      exportOptions: { transparent: true },
    },
    {
      id: "surficial-aquifers",
      name: "Surficial aquifers",
      serviceUrl:
        "https://nsgiwa.novascotia.ca/arcgis/rest/services/GEOL/GEOL_hg_SurficialAquifers_h490ns_UT83/MapServer",
      sourceUrl:
        "https://nsgiwa.novascotia.ca/arcgis/rest/services/GEOL/GEOL_hg_SurficialAquifers_h490ns_UT83/MapServer",
      licenceUrl: DEPARTMENTAL_AGREEMENT_LICENCE_URL,
      minZoom: 7,
      maxZoom: 24,
      opacity: 0.5,
      licence: "province-restricted",
      screening: "aquifer-context",
      riskBands: [],
      guidance:
        "Mapped aquifer extent only. This layer carries no risk rating and says nothing about water quality at any property.",
      webCaveat: "Aquifer extent context · carries no risk rating",
      sourceDate: "Live service · checked July 23, 2026",
      scale: "Provincial surficial aquifer mapping (h490ns)",
      coverage: "Mapped Nova Scotia surficial aquifers",
      exportOptions: { transparent: true },
    },
  ] as const;

export const initialEnvironmentalHealthLayerVisibility: Record<
  EnvironmentalHealthLayerId,
  boolean
> = {
  "arsenic-risk-wells": false,
  "uranium-risk-wells": false,
  "manganese-risk-wells": false,
  "surficial-aquifers": false,
};

export const resourceLayerCatalog: readonly ResourceLayerDescriptor[] = [
  {
    id: "mineral-occurrences",
    name: "Mineral occurrences",
    serviceUrl:
      "https://services.arcgis.com/TS1HHBYLM10d1SZH/arcgis/rest/services/mineral_occurrence_database_d002ns_UT83/FeatureServer/0",
    sourceUrl:
      "https://novascotia.ca/natr/meb/download/dp002.asp",
    minZoom: 8,
    maxZoom: 23,
    opacity: 0.9,
    licence: "province-open",
    delivery: "feature-query",
    outFields: [
      "geo_id",
      "Name",
      "Occ_type",
      "Status",
      "Comm_prim",
      "Comm_list",
    ],
    markerColor: "#9b5de5",
    webCaveat: "Recorded occurrences, not proof of a viable deposit",
    sourceDate: "June 2024 · version 12",
    scale: "Point inventory · source displays to 1:500,000",
    coverage: "Nova Scotia",
  },
  {
    id: "mineral-tenure",
    name: "Mineral tenure",
    serviceUrl:
      "https://novarocmaps.novascotia.ca/arcgis/rest/services/NovaRoc/MapServer",
    sourceUrl: "https://novaroc.novascotia.ca/novaroc/",
    minZoom: 7,
    maxZoom: 23,
    opacity: 0.7,
    licence: "province-open",
    delivery: "map-export",
    exportOptions: { transparent: true, layers: "show:1,7" },
    webCaveat: "Exploration licences and mineral leases; not land ownership",
    sourceDate: "Live NovaROC · checked July 20, 2026",
    scale: "Tenure polygons · source displays to 1:3,000,000",
    coverage: "Nova Scotia",
  },
  {
    id: "abandoned-mines",
    name: "Abandoned mine openings",
    serviceUrl:
      "https://services.arcgis.com/TS1HHBYLM10d1SZH/arcgis/rest/services/Abandoned_Mine_Openings_Degree_of_Hazard_d010ns_ut83/FeatureServer/0",
    sourceUrl:
      "https://novascotia.ca/natr/meb/download/dp010.asp",
    minZoom: 11,
    maxZoom: 23,
    opacity: 0.92,
    licence: "province-open",
    delivery: "feature-query",
    outFields: [
      "geo_id",
      "ShaftID",
      "Name",
      "Opening_ty",
      "Degree_Haz",
      "Protection",
    ],
    markerColor: "#d1495b",
    webCaveat: "Provincial hazard inventory; locations and conditions may change",
    sourceDate: "2024 · version 9",
    scale: "Approximate point inventory",
    coverage: "Nova Scotia · incomplete inventory",
  },
] as const;

export const derivedResourceLayerCatalog: readonly DerivedResourceLayerDescriptor[] = [
  {
    id: "mineral-proximity-parcels",
    name: "Properties within 1 km of a mineral occurrence",
    delivery: "derived-parcel-query",
    sourceUrl: "https://novascotia.ca/natr/meb/download/dp002.asp",
    minZoom: 12,
    maxZoom: 23,
    webCaveat: "Derived from published occurrences and NSPRD parcels; not proof of mineralization",
    sourceDate: "Mineral occurrences June 2024 · NSPRD live",
    scale: "Application-derived 1 km parcel proximity",
    coverage: "Visible Nova Scotia map area",
    requiresProvinceLicence: true,
  },
] as const;

export const allResourceLayerCatalog: readonly ResourceControlDescriptor[] = [
  ...resourceLayerCatalog,
  ...derivedResourceLayerCatalog,
];

export const initialResourceLayerVisibility: Record<ResourceLayerId, boolean> = {
  "mineral-occurrences": false,
  "mineral-tenure": false,
  "abandoned-mines": false,
  "mineral-proximity-parcels": false,
};

export const hydroPilotLayerCatalog: readonly HydroPilotLayerDescriptor[] = [
  {
    id: "inverness-hydro-potential",
    name: "Inverness micro-hydro screen",
    sourceUrl:
      "https://data.novascotia.ca/Internal-Government-Services/1-10-000-Nova-Scotia-Watersheds-Map/kzer-4ht8",
    serviceUrl:
      "https://nsgiwa.novascotia.ca/arcgis/rest/services/WTR/WTR_NSHN_UT83/MapServer",
    minZoom: 8,
    maxZoom: 23,
    opacity: 0.92,
    licence: "province-open",
    webCaveat: "Modeled upstream area + nominal 1–50 kW scale · not predicted output",
    sourceDate: "Watersheds 2021 · NSHN retrieved July 21, 2026",
    scale: "Tertiary/sub-tertiary catchments + connected NSHN tributaries",
    coverage: "13 Inverness-centred watersheds with connected tributary coverage",
  },
] as const;

export const initialHydroPilotLayerVisibility: Record<
  HydroPilotLayerId,
  boolean
> = {
  "inverness-hydro-potential": false,
};
