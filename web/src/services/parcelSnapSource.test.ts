import { describe, expect, it, vi } from "vitest";
import type { fetchArcGISFeatureOverlay } from "./arcGISFeatureOverlay";
import { NSPRD_LAYER_URL } from "./nsprd";
import {
  PARCEL_SNAP_MOUNT_MAX,
  ParcelSnapCache,
  fetchSnapParcels,
  type ParcelSnapFeature,
} from "./parcelSnapSource";
import { FIELD_CAPTURE_SPEC } from "../location/captureSpec";
import { PARCEL_SNAP_MIN_ZOOM } from "./parcelSnapSource";

function parcel(pid: string, west: number, south: number, size = 0.001): ParcelSnapFeature {
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

describe("fetchSnapParcels", () => {
  it("queries NSPRD by envelope with PID paging and keeps only polygons", async () => {
    const fetchOverlay = vi.fn(
      async () =>
        ({
          type: "FeatureCollection" as const,
          features: [
            parcel("10000001", -61.001, 46.0),
            {
              type: "Feature" as const,
              geometry: { type: "Point" as const, coordinates: [-61, 46] },
              properties: { PID: "10000002" },
            },
          ],
        }) as never,
    ) as unknown as typeof fetchArcGISFeatureOverlay;

    const bounds = { west: -61.01, south: 45.99, east: -60.99, north: 46.01 };
    const parcels = await fetchSnapParcels(bounds, { fetchOverlay });

    expect(fetchOverlay).toHaveBeenCalledWith({
      serviceUrl: NSPRD_LAYER_URL,
      bounds,
      outFields: ["PID"],
      orderByFields: "PID",
      idField: "PID",
      signal: undefined,
    });
    expect(parcels.map(({ properties }) => properties?.PID)).toEqual(["10000001"]);
  });
});

describe("parcel snap constants", () => {
  it("come from the parity-pinned contract, not local restatements", () => {
    expect(PARCEL_SNAP_MIN_ZOOM).toBe(FIELD_CAPTURE_SPEC.snap.minZoom);
    expect(PARCEL_SNAP_MOUNT_MAX).toBe(FIELD_CAPTURE_SPEC.snap.maxParcels);
  });
});

describe("ParcelSnapCache", () => {
  it("dedupes by PID, keeping the newest feature", () => {
    const cache = new ParcelSnapCache();
    const stale = parcel("10000001", -61.001, 46.0);
    const fresh = parcel("10000001", -61.002, 46.0);
    cache.add([stale]);
    cache.add([fresh]);
    expect(cache.size).toBe(1);
    const selection = cache.inViewport({
      west: -61.01,
      south: 45.9,
      east: -60.9,
      north: 46.1,
    });
    expect(selection.status === "ready" && selection.parcels[0]).toBe(fresh);
  });

  it("evicts the least recently added past the cap; re-adding rescues", () => {
    const cache = new ParcelSnapCache(3);
    cache.add([
      parcel("1", -61.001, 46.0),
      parcel("2", -61.002, 46.0),
      parcel("3", -61.003, 46.0),
    ]);
    // Touch parcel 1 (a moveend refetch re-adds what is still in view)…
    cache.add([parcel("1", -61.001, 46.0)]);
    // …so the fourth entry evicts parcel 2, the oldest untouched one.
    cache.add([parcel("4", -61.004, 46.0)]);
    expect(cache.size).toBe(3);
    const selection = cache.inViewport({
      west: -62,
      south: 45,
      east: -60,
      north: 47,
    });
    expect(
      selection.status === "ready" &&
        selection.parcels.map(({ properties }) => properties?.PID).sort(),
    ).toEqual(["1", "3", "4"]);
  });

  it("selects only parcels whose envelope intersects the viewport", () => {
    const cache = new ParcelSnapCache();
    cache.add([
      parcel("in", -61.0005, 46.0005),
      parcel("out", -60.5, 46.5),
    ]);
    const selection = cache.inViewport({
      west: -61.01,
      south: 45.99,
      east: -60.99,
      north: 46.01,
    });
    expect(
      selection.status === "ready" &&
        selection.parcels.map(({ properties }) => properties?.PID),
    ).toEqual(["in"]);
  });

  it("fails closed over the mount cap: dense state, no partial subset", () => {
    const cache = new ParcelSnapCache(100, 2);
    cache.add([
      parcel("1", -61.001, 46.0),
      parcel("2", -61.002, 46.0),
      parcel("3", -61.003, 46.0),
    ]);
    const selection = cache.inViewport({
      west: -62,
      south: 45,
      east: -60,
      north: 47,
    });
    expect(selection).toEqual({ status: "dense", count: 3, max: 2 });
  });

  it("drops features without a usable PID instead of caching them unkeyed", () => {
    const cache = new ParcelSnapCache();
    const orphan = parcel("x", -61.001, 46.0);
    orphan.properties = {};
    cache.add([orphan]);
    expect(cache.size).toBe(0);
  });

  it("clears completely when the session ends", () => {
    const cache = new ParcelSnapCache();
    cache.add([parcel("1", -61.001, 46.0)]);
    cache.clear();
    expect(cache.size).toBe(0);
  });
});
