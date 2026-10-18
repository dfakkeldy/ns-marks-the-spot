import { act, cleanup, render } from "@testing-library/react";
import L from "leaflet";
import { createRef } from "react";
import { MapContainer } from "react-leaflet";
import { afterEach, describe, expect, it, vi } from "vitest";
import { liveConditionsLayerCatalog, type WeatherRadarLayerDescriptor } from "../layers/layerCatalog";
import { WeatherRadarLayer } from "./WeatherRadarLayer";

const layer = liveConditionsLayerCatalog.find(({ id }) => id === "weather-radar") as WeatherRadarLayerDescriptor;

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("WeatherRadarLayer real Leaflet lifecycle", () => {
  it("keeps map zoom usable after radar is disabled", () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("<WMS_Capabilities />")));
    const map = createRef<L.Map>();
    const view = (visible: boolean) => (
      <MapContainer ref={map} center={[45, -61]} zoom={8} zoomAnimation={false}>
        <WeatherRadarLayer layer={layer} visible={visible} renderMode="interactive" />
      </MapContainer>
    );
    const mounted = render(view(true));
    expect(document.querySelector(".leaflet-tile-pane .leaflet-layer")).not.toBeNull();

    mounted.rerender(view(false));
    expect(document.querySelector(".leaflet-tile-pane .leaflet-layer")).toBeNull();

    // Leaflet detaches GridLayer's map listeners through its own `remove`
    // callback. Clearing all layer listeners first leaves a dead zoom handler.
    expect(() => act(() => { map.current!.setZoom(9); })).not.toThrow();
    expect(map.current!.getZoom()).toBe(9);
  });
});
