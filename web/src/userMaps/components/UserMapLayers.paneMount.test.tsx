import { cleanup, render, waitFor } from "@testing-library/react";
import L from "leaflet";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  OLD_GROWTH_POLICY_PANE,
  OLD_GROWTH_POLICY_PANE_Z_INDEX,
  USER_MAPS_PANE,
  USER_MAPS_PANE_Z_INDEX,
} from "../../components/mapPanes";
import type { UserMapRecord } from "../types";

const leafletMap = vi.hoisted(() => ({ current: null as L.Map | null }));

vi.mock("react-leaflet", () => ({
  useMap: () => leafletMap.current,
}));

// The pane contract belongs to UserMapLayers and Leaflet. Keep the expensive
// canvas warp out of this test while allowing the real Leaflet map to receive
// the layer after UserMapLayers creates its pane.
vi.mock("../render/WarpedRasterLayer", () => ({
  WarpedRasterLayer: class extends L.Layer {
    onAdd() {
      return this;
    }
    onRemove() {
      return this;
    }
    setOpacity() {}
    setGeometry() {}
  },
}));

import { UserMapLayers } from "./UserMapLayers";

const record: UserMapRecord = {
  id: "pane-fixture",
  name: "Pane fixture",
  source: "geotiff",
  createdAt: "2026-07-29T00:00:00.000Z",
  pixelSize: { width: 8, height: 6 },
  georef: {
    kind: "embedded",
    crs: "EPSG:26920",
    geotransform: [500000, 10, 0, 5000000, 0, -10],
  },
};

function mountLeafletMap(): L.Map {
  const container = document.createElement("div");
  Object.defineProperties(container, {
    clientWidth: { configurable: true, value: 640 },
    clientHeight: { configurable: true, value: 480 },
  });
  document.body.append(container);
  return L.map(container, { zoomControl: false }).setView([45.81, -61.47], 12);
}

describe("UserMapLayers pane mount", () => {
  afterEach(() => {
    cleanup();
    leafletMap.current?.remove();
    leafletMap.current = null;
    document.body.replaceChildren();
    vi.unstubAllGlobals();
  });

  it("places the user raster pane in Leaflet's tile pane at its overlay z-index", async () => {
    leafletMap.current = mountLeafletMap();
    vi.stubGlobal("fetch", vi.fn(async () => ({ blob: async () => new Blob() })));
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn(async () => ({ width: 8, height: 6, close: vi.fn() })),
    );

    render(
      <UserMapLayers maps={[{ record, previewUrl: "blob:pane-fixture", opacity: 0.7 }]} />,
    );

    await waitFor(() => expect(leafletMap.current?.getPane(USER_MAPS_PANE)).toBeTruthy());
    const tilePane = leafletMap.current?.getPane("tilePane");
    const userPane = leafletMap.current?.getPane(USER_MAPS_PANE);
    const oldGrowthPane = leafletMap.current?.createPane(
      OLD_GROWTH_POLICY_PANE,
      tilePane,
    );
    oldGrowthPane.style.zIndex = String(OLD_GROWTH_POLICY_PANE_Z_INDEX);

    expect(userPane?.parentElement).toBe(tilePane);
    expect(oldGrowthPane.parentElement).toBe(tilePane);
    expect(userPane?.style.zIndex).toBe(String(USER_MAPS_PANE_Z_INDEX));
    expect(Number(userPane?.style.zIndex)).toBeLessThan(
      Number(oldGrowthPane.style.zIndex),
    );
  });
});
