import { createRoot } from "react-dom/client";
import { PrintPreview } from "../src/components/print/PrintPreview";
import type { PrintCapture } from "../src/services/printSnapshot";
import "leaflet/dist/leaflet.css";
import "../src/styles.css";

// Synthetic parcel and unavailable evidence; the preview, map, templates and
// stylesheet are the production components. No live property lookup is used.
const unavailable = { status: "not-asked", message: "Not requested in this layout fixture." } as const;
const capture: PrintCapture = {
  token: "layout-fixture", capturedAt: "2026-09-05T12:00:00Z",
  pid: "01234567", evidenceRequest: { pid: "01234567", generation: 1 },
  taxSaleEnabled: false, mode: "current", eventIds: [], events: [],
  selectedParcelGeometry: {
    type: "FeatureCollection",
    features: [{ type: "Feature", properties: { PID: "01234567" }, geometry: {
      type: "Polygon", coordinates: [[[-61.201, 46.3], [-61.2, 46.3], [-61.2, 46.301], [-61.201, 46.3]]],
    } }],
  },
  mapParcels: { type: "FeatureCollection", features: [] },
  taxSalePids: [], historicalTaxSalePids: [],
  viewport: {
    position: { latitude: 46.3005, longitude: -61.2005, zoom: 16 },
    bounds: { north: 46.302, east: -61.199, south: 46.299, west: -61.202 },
  },
  basemapStyle: "osm", layerIds: ["modern"], layerSources: [{
    id: "modern", name: "OpenStreetMap", sourceUrl: "https://www.openstreetmap.org/",
    sourceDate: "Live", attribution: "© OpenStreetMap contributors",
    licenceUrl: "https://www.openstreetmap.org/copyright",
  }],
  licenceAccepted: true, wellLogAccuracyFilter: "surveyed",
  evidence: {
    mappedArea: null, buildings: unavailable, assessments: unavailable,
    dwellings: unavailable, civicAddresses: unavailable, mappedContext: unavailable,
    riverFlood: unavailable, coastalFlood: unavailable, resources: unavailable,
  },
};

createRoot(document.getElementById("root")!).render(
  <PrintPreview capture={capture} baseUrl="https://example.test/map/" onClose={() => {}} />,
);
