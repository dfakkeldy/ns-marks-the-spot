export type NativeLayerId =
  | "fletcher"
  | "ns-aerial"
  | "nsprd"
  | "crown-lands"
  | "flood-risk"
  | "waterfalls"
  | "water-features"
  | "roads";

export type ProvinceLayerId = Exclude<NativeLayerId, "fletcher">;

export type SourceResourceLayerId =
  | "mineral-occurrences"
  | "mineral-tenure"
  | "abandoned-mines";

export type DerivedResourceLayerId = "mineral-proximity-parcels";

export type ResourceLayerId = SourceResourceLayerId | DerivedResourceLayerId;

export type HydroPilotLayerId = "inverness-hydro-potential";

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
  id: NativeLayerId;
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
    name: "Flood Risk Areas",
    serviceUrl:
      "https://fletcher.novascotia.ca/arcgis/rest/services/mrlu/flood_risk_areas/MapServer",
    nativeDefaultVisibility: false,
    minZoom: 12,
    maxZoom: 24,
    opacity: 0.72,
    licence: "province-restricted",
    webAvailability: "available",
    webCaveat: "Watersheds · zoom 12+",
    sourceDate: "Live service · checked July 20, 2026",
    scale: "Watershed detail from zoom 12",
    coverage: "Published flood-risk watersheds",
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
  },
] as const;

export const provinceLayerIds: NativeLayerId[] = [
  "ns-aerial",
  "nsprd",
  "crown-lands",
  "flood-risk",
  "waterfalls",
  "water-features",
  "roads",
];

export const provinceLayerCatalog = nativeLayerCatalog.filter(
  (layer): layer is WebLayerDescriptor & { id: ProvinceLayerId } =>
    layer.licence === "province-restricted",
);

export const initialProvinceLayerVisibility: Record<ProvinceLayerId, boolean> = {
  "ns-aerial": true,
  nsprd: true,
  "crown-lands": false,
  "flood-risk": false,
  waterfalls: false,
  "water-features": true,
  roads: true,
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
    name: "Inverness terrain potential",
    sourceUrl:
      "https://data.novascotia.ca/Internal-Government-Services/1-10-000-Nova-Scotia-Watersheds-Map/kzer-4ht8",
    serviceUrl:
      "https://nsgiwa.novascotia.ca/arcgis/rest/services/WTR/WTR_NSHN_UT83/MapServer",
    minZoom: 8,
    maxZoom: 23,
    opacity: 0.92,
    licence: "province-open",
    webCaveat: "Modeled upstream area + bounded mapped drop · relative pilot",
    sourceDate: "Watersheds 2021 · NSHN retrieved July 20, 2026",
    scale: "Tertiary/sub-tertiary catchments + NSHN primary-flow route",
    coverage: "13 Inverness-centred watersheds with routed catchment coverage",
  },
] as const;

export const initialHydroPilotLayerVisibility: Record<
  HydroPilotLayerId,
  boolean
> = {
  "inverness-hydro-potential": false,
};
