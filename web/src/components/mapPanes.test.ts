import L from "leaflet";
import { afterEach, describe, expect, it } from "vitest";
import {
  ENVIRONMENTAL_HEALTH_LAYER_Z_INDEX,
  ESTABLISHED_PARCEL_PANE,
  ESTABLISHED_PARCEL_PANE_Z_INDEX,
  GEOREFERENCE_PANE_Z_INDEX,
  MEASURE_PANE,
  MEASURE_PANE_Z_INDEX,
  MINERAL_PROXIMITY_PANE,
  MINERAL_PROXIMITY_PANE_Z_INDEX,
  PROVINCE_LAYER_Z_INDEXES,
  USER_MAPS_PANE_Z_INDEX,
  WELL_LOG_PANE,
  WELL_LOG_PANE_Z_INDEX,
  ZONING_PANE_Z_INDEX,
} from "./mapPanes";

describe("parcel pane ordering", () => {
  let map: L.Map | undefined;

  afterEach(() => {
    map?.remove();
    map = undefined;
    document.body.replaceChildren();
  });

  it("keeps a remounted proximity layer below established parcel overlays", () => {
    const container = document.createElement("div");
    Object.defineProperties(container, {
      clientWidth: { configurable: true, value: 640 },
      clientHeight: { configurable: true, value: 480 },
    });
    document.body.append(container);
    map = L.map(container, { zoomControl: false }).setView([45.81, -61.47], 12);

    const proximityPane = map.createPane(MINERAL_PROXIMITY_PANE);
    proximityPane.style.zIndex = String(MINERAL_PROXIMITY_PANE_Z_INDEX);
    const establishedPane = map.createPane(ESTABLISHED_PARCEL_PANE);
    establishedPane.style.zIndex = String(ESTABLISHED_PARCEL_PANE_Z_INDEX);
    const markerIcon = L.divIcon({ className: "test-parcel-marker" });
    const selectedParcel = L.marker([45.81, -61.47], {
      icon: markerIcon,
      pane: ESTABLISHED_PARCEL_PANE,
    }).addTo(map);
    const firstProximityLayer = L.marker([45.811, -61.471], {
      icon: markerIcon,
      pane: MINERAL_PROXIMITY_PANE,
    }).addTo(map);

    expect(firstProximityLayer.getElement()?.parentElement).toBe(proximityPane);
    expect(selectedParcel.getElement()?.parentElement).toBe(establishedPane);

    firstProximityLayer.remove();
    const refreshedProximityLayer = L.marker([45.812, -61.472], {
      icon: markerIcon,
      pane: MINERAL_PROXIMITY_PANE,
    }).addTo(map);

    expect(refreshedProximityLayer.getElement()?.parentElement).toBe(proximityPane);
    expect(selectedParcel.getElement()?.parentElement).toBe(establishedPane);
    expect(Number(proximityPane.style.zIndex)).toBeLessThan(
      Number(establishedPane.style.zIndex),
    );
  });

  it("keeps property boundaries below water and road context", () => {
    expect(PROVINCE_LAYER_Z_INDEXES.nsprd).toBeLessThan(
      PROVINCE_LAYER_Z_INDEXES["water-features"],
    );
    expect(PROVINCE_LAYER_Z_INDEXES.nsprd).toBeLessThan(
      PROVINCE_LAYER_Z_INDEXES.roads,
    );
    expect(PROVINCE_LAYER_Z_INDEXES.nsprd).toBeLessThan(
      PROVINCE_LAYER_Z_INDEXES.buildings,
    );
    expect(PROVINCE_LAYER_Z_INDEXES.buildings).toBeLessThan(
      PROVINCE_LAYER_Z_INDEXES.roads,
    );
  });

  it("keeps well points above proximity parcels and below the selected parcel", () => {
    expect(MINERAL_PROXIMITY_PANE_Z_INDEX).toBeLessThan(WELL_LOG_PANE_Z_INDEX);
    expect(WELL_LOG_PANE_Z_INDEX).toBeLessThan(ESTABLISHED_PARCEL_PANE_Z_INDEX);
    expect(WELL_LOG_PANE).not.toBe(MINERAL_PROXIMITY_PANE);
    expect(WELL_LOG_PANE).not.toBe(ESTABLISHED_PARCEL_PANE);
    expect(MEASURE_PANE_Z_INDEX).toBeGreaterThan(ESTABLISHED_PARCEL_PANE_Z_INDEX);
    expect(MEASURE_PANE_Z_INDEX).toBeLessThan(500);
    expect(MEASURE_PANE).not.toBe(ESTABLISHED_PARCEL_PANE);
  });

  it("stacks user maps above aerial imagery and below data overlays", () => {
    expect(USER_MAPS_PANE_Z_INDEX).toBeGreaterThan(
      PROVINCE_LAYER_Z_INDEXES["ns-aerial"],
    );
    expect(USER_MAPS_PANE_Z_INDEX).toBeLessThan(
      ENVIRONMENTAL_HEALTH_LAYER_Z_INDEX,
    );
    expect(USER_MAPS_PANE_Z_INDEX).toBeLessThan(PROVINCE_LAYER_Z_INDEXES.nsprd);
  });

  it("keeps georeferencing markers above every data overlay", () => {
    // A control point under a parcel line, a measurement, or a selected
    // parcel outline cannot be clicked or dragged.
    const dataPaneMax = Math.max(
      ...Object.values(PROVINCE_LAYER_Z_INDEXES),
      ENVIRONMENTAL_HEALTH_LAYER_Z_INDEX,
      ZONING_PANE_Z_INDEX,
      MINERAL_PROXIMITY_PANE_Z_INDEX,
      WELL_LOG_PANE_Z_INDEX,
      ESTABLISHED_PARCEL_PANE_Z_INDEX,
      MEASURE_PANE_Z_INDEX,
      USER_MAPS_PANE_Z_INDEX,
    );
    expect(GEOREFERENCE_PANE_Z_INDEX).toBeGreaterThan(dataPaneMax);
  });

  it("keeps georeferencing markers clear of Leaflet's own panes", () => {
    // Verified from leaflet/dist/leaflet.css: marker 600, tooltip 650,
    // popup 700. Above the first two, below the last.
    expect(GEOREFERENCE_PANE_Z_INDEX).toBeGreaterThan(650);
    expect(GEOREFERENCE_PANE_Z_INDEX).toBeLessThan(700);
    // NOT `expect(GEOREFERENCE_PANE).not.toBe(USER_MAPS_PANE)` — two
    // different string literals can never be equal, so that assertion can
    // never fail. What actually matters is the ORDER: the control points must
    // outrank the drape they are placed on.
    expect(GEOREFERENCE_PANE_Z_INDEX).toBeGreaterThan(USER_MAPS_PANE_Z_INDEX);
  });
});
