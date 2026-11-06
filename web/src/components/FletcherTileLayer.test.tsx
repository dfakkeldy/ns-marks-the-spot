import { render } from "@testing-library/react";
import type { Map as LeafletMap } from "leaflet";
import { MapContainer, useMap } from "react-leaflet";
import { describe, expect, it, vi } from "vitest";
import { FletcherTileLayer } from "./FletcherTileLayer";

function Capture({ onMap }: { onMap: (map: LeafletMap) => void }) {
  onMap(useMap());
  return null;
}

describe("FletcherTileLayer", () => {
  it("leaves no map listener behind when it is hidden, so a later zoom does not crash", () => {
    // Switching from Historical Maps to a setup with its own camera hid the
    // mosaic and fitted the map in the same commit. The removed tile layer kept
    // its zoom listener (off() had erased Leaflet's detach-on-remove handler)
    // and threw "Cannot read properties of null (reading 'getCenter')".
    let map: LeafletMap | undefined;
    const layer = (visible: boolean) => (
      <MapContainer center={[46.26, -60.84]} zoom={9} style={{ width: 400, height: 300 }}>
        <Capture onMap={(value) => { map = value; }} />
        <FletcherTileLayer visible={visible} opacity={0.7} tileBaseUrl="https://tiles.example.test"
          retryToken={0} renderMode="interactive" onStatusChange={vi.fn()} />
      </MapContainer>
    );
    const { rerender } = render(layer(true));
    const zoomListeners = () => (map as unknown as { _events: Record<string, unknown[] | undefined> })._events.zoom?.length ?? 0;
    expect(zoomListeners()).toBeGreaterThan(0);
    rerender(layer(false));
    expect(zoomListeners()).toBe(0);
    expect(() => map!.setView([45.3, -62.7], 7, { animate: false })).not.toThrow();
  });
});
