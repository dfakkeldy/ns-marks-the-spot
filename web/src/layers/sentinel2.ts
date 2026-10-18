import type { ContextLayerDescriptor } from "./contextLayerTypes";

// Verified against EOX WMTS capabilities and cloudless.eox.at/pricing on
// 2026-09-12. This identifier is the CC BY 2016 edition; newer editions are NC.
export const sentinel2Layer = {
  id: "sentinel-2",
  name: "Sentinel-2 satellite · 2016–2017",
  category: "background-maps",
  delivery: "tile",
  tileUrl: "https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless_3857/default/g/{z}/{y}/{x}.jpg",
  serviceUrl: "https://tiles.maps.eox.at/wmts/1.0.0/WMTSCapabilities.xml",
  sourceUrl: "https://cloudless.eox.at/pricing",
  licence: "cc-by",
  licenceUrl: "https://creativecommons.org/licenses/by/4.0/",
  attribution: "EOxCloudless — https://cloudless.eox.at by EOX IT Services GmbH (Contains modified Copernicus Sentinel data 2016 & 2017) · CC BY 4.0",
  sourceDate: "2016 mosaic · Sentinel acquisitions from 2016–2017; not current imagery",
  scale: "10 m Sentinel-2 source imagery · rendered tiles through zoom 14; closer zoom enlarges pixels",
  coverage: "Global mosaic · landscape context, not current site conditions",
  webCaveat: "2016–2017 imagery · 10 m satellite source · CC BY 4.0 · landscape context only",
  minZoom: 0,
  maxZoom: 24,
  maxNativeZoom: 14,
  opacity: 1,
  zIndex: 149,
  exportOptions: { transparent: false },
  legend: [{ label: "Natural-colour cloudless mosaic; colours are processed and imagery is historical" }],
} as const satisfies ContextLayerDescriptor;
