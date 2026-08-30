import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import L from "leaflet";
import { MapContainer } from "react-leaflet";
import { SNAP_TARGET_PANE } from "../../../components/mapPanes";
import type { ParcelSnapFeature } from "../../../services/parcelSnapSource";
import {
  ParcelSnapTargetsLayer,
  type ParcelSnapStatus,
} from "./ParcelSnapTargetsLayer";

L.Map.addInitHook(function initHook(this: L.Map) {
  Object.defineProperties(this.getContainer(), {
    clientWidth: { configurable: true, value: 640 },
    clientHeight: { configurable: true, value: 480 },
  });
});

const createdMaps: L.Map[] = [];
L.Map.addInitHook(function trackHook(this: L.Map) {
  createdMaps.push(this);
});

function parcel(pid: string, west = -61.001, south = 46.0): ParcelSnapFeature {
  const size = 0.0005;
  return {
    type: "Feature",
    id: pid,
    geometry: {
      type: "Polygon",
      coordinates: [
        [
          [west, south],
          [west + size, south],
          [west + size, south + size],
          [west, south + size],
          [west, south],
        ],
      ],
    },
    properties: { PID: pid },
  };
}

function mount(options: {
  zoom?: number;
  fetchParcels?: (
    bounds: unknown,
    opts?: unknown,
  ) => Promise<ParcelSnapFeature[]>;
}) {
  const statuses: ParcelSnapStatus[] = [];
  const fetchParcels =
    options.fetchParcels ?? (async () => [parcel("10000001"), parcel("10000002", -61.002)]);
  const host = document.createElement("div");
  document.body.append(host);
  render(
    <MapContainer
      center={[46.0002, -61.0008]}
      zoom={options.zoom ?? 16}
      zoomControl={false}
    >
      <ParcelSnapTargetsLayer
        onStatusChange={(status) => statuses.push(status)}
        fetchParcels={fetchParcels as never}
      />
    </MapContainer>,
    { container: host },
  );
  return { map: createdMaps[0], statuses };
}

function snapTargets(map: L.Map): L.Layer[] {
  const found: L.Layer[] = [];
  map.eachLayer((layer) => {
    if (
      (layer.options as { nsmtsSnapSource?: string })?.nsmtsSnapSource ===
        "nsprd-parcel" &&
      layer instanceof L.Polygon
    ) {
      found.push(layer);
    }
  });
  return found;
}

describe("ParcelSnapTargetsLayer", () => {
  afterEach(async () => {
    await new Promise((resolve) => setTimeout(resolve, 32));
    cleanup();
    createdMaps.length = 0;
    document.body.replaceChildren();
  });

  it("mounts viewport parcels with the load-bearing snap options", async () => {
    const { map, statuses } = mount({});
    await waitFor(() =>
      expect(statuses.at(-1)).toEqual({ status: "ready", count: 2 }),
    );
    const targets = snapTargets(map);
    expect(targets).toHaveLength(2);
    for (const target of targets) {
      const options = target.options as {
        snapIgnore?: boolean;
        interactive?: boolean;
        pmIgnore?: boolean;
        pane?: string;
      };
      expect(options.snapIgnore).toBe(false);
      expect(options.interactive).toBe(false);
      // Never opted in: global edit/drag/delete must not see these.
      expect(options.pmIgnore).toBeUndefined();
      expect(options.pane).toBe(SNAP_TARGET_PANE);
    }
    expect(map.getPane(SNAP_TARGET_PANE)).toBeTruthy();
  });

  it("gates below the contract zoom floor without fetching", async () => {
    const fetchParcels = vi.fn(async () => [parcel("10000001")]);
    const { statuses } = mount({ zoom: 14, fetchParcels });
    await waitFor(() =>
      expect(statuses.at(-1)).toEqual({ status: "zoom", minZoom: 16 }),
    );
    expect(fetchParcels).not.toHaveBeenCalled();
  });

  it("fails closed on a dense viewport: dense status, nothing mounted", async () => {
    const dense = Array.from({ length: 601 }, (_, index) =>
      parcel(String(10000000 + index), -61.001 + (index % 30) * 0.00001, 46.0),
    );
    const { map, statuses } = mount({ fetchParcels: async () => dense });
    await waitFor(() =>
      expect(statuses.at(-1)).toEqual({ status: "dense", count: 601, max: 600 }),
    );
    expect(snapTargets(map)).toHaveLength(0);
  });

  it("reports a failed load as error, distinctly", async () => {
    const { statuses } = mount({
      fetchParcels: async () => {
        throw new Error("service down");
      },
    });
    await waitFor(() => expect(statuses.at(-1)).toEqual({ status: "error" }));
  });

  it("removes its targets on unmount", async () => {
    const { map, statuses } = mount({});
    await waitFor(() =>
      expect(statuses.at(-1)).toEqual({ status: "ready", count: 2 }),
    );
    cleanup();
    expect(snapTargets(map)).toHaveLength(0);
  });
});
