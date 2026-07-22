export type NativeLayerId =
  | "fletcher"
  | "ns-aerial"
  | "nsprd"
  | "crown-lands"
  | "flood-risk"
  | "waterfalls"
  | "water-features"
  | "roads";

export type WebOnlyProvinceLayerId = "buildings";

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

export const PROPERTY_BOUNDARY_MIN_ZOOM = 10;

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
    minZoom: 0,
    maxZoom: 23,
    opacity: 1,
    licence: "province-restricted",
    webAvailability: "available",
    webCaveat: "Online imagery",
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
    webCaveat: "Zoom 10+ · not a survey",
    sourceDate: "Live service · checked July 20, 2026",
    scale: "Display floor 1:36,114",
    coverage: "Nova Scotia",
    exportOptions: {
      transparent: true,
      dpi: 0.75,
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
    minZoom: 7,
    maxZoom: 24,
    opacity: 1,
    licence: "province-restricted",
    webAvailability: "available",
    webCaveat: "Rivers, lakes, wetlands & more",
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
    minZoom: 7,
    maxZoom: 24,
    opacity: 1,
    licence: "province-restricted",
    webAvailability: "available",
    webCaveat: "Highways to trails · culverts close up",
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
];

export const webOnlyProvinceLayerCatalog: readonly (
  WebLayerDescriptor & { id: WebOnlyProvinceLayerId }
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
