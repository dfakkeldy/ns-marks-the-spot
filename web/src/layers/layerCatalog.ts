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
  exportOptions?: ArcGISExportOptions;
};

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
    exportOptions: { transparent: false },
  },
  {
    id: "nsprd",
    name: "NS Property Boundaries",
    serviceUrl:
      "https://nsgiwa2.novascotia.ca/arcgis/rest/services/PLAN/PLAN_NSPRD_WM84/MapServer",
    nativeDefaultVisibility: false,
    minZoom: 12,
    maxZoom: 24,
    opacity: 0.82,
    licence: "province-restricted",
    webAvailability: "available",
    webCaveat: "Zoom 12+ · not a survey",
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
  "ns-aerial": false,
  nsprd: false,
  "crown-lands": false,
  "flood-risk": false,
  waterfalls: false,
  "water-features": false,
  roads: false,
};
