import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fetchMineralProximityParcels,
  MINERAL_PROXIMITY_DISTANCE_METRES,
  MINERAL_PROXIMITY_MIN_ZOOM,
} from "./mineralProximity";

const bounds = { west: -62, south: 45, east: -60, north: 47 };

const requestUrl = (input: string | URL | Request): URL =>
  new URL(input instanceof Request ? input.url : input);

const occurrence = (id: number, longitude: number) => ({
  type: "Feature" as const,
  id,
  geometry: { type: "Point" as const, coordinates: [longitude, 45.8122] },
  properties: {
    geo_id: id,
    Occ_num: `F14-${String(id).padStart(3, "0")}`,
    Name: `Occurrence ${id}`,
    Status: "Occurrence",
    Comm_list: "Au",
  },
});

const parcel = (pid: string) => ({
  type: "Feature" as const,
  properties: { PID: pid },
  geometry: {
    type: "Polygon" as const,
    coordinates: [[
      [-61.48, 45.81],
      [-61.47, 45.81],
      [-61.47, 45.82],
      [-61.48, 45.82],
      [-61.48, 45.81],
    ]],
  },
});

describe("mineral proximity parcels", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("queries nearby parcels with a bounded multipoint request", async () => {
    const fetchMock = vi.fn(async (_input: string | URL | Request, init?: RequestInit) =>
      init?.method === "POST"
        ? new Response(JSON.stringify({ type: "FeatureCollection", features: [parcel("90000001")] }))
        : new Response(JSON.stringify({
            type: "FeatureCollection",
            features: [occurrence(1, -61.4786), occurrence(2, -61.4762)],
          })),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchMineralProximityParcels(bounds);

    expect(MINERAL_PROXIMITY_DISTANCE_METRES).toBe(1_000);
    expect(MINERAL_PROXIMITY_MIN_ZOOM).toBe(12);
    const mineralUrl = requestUrl(fetchMock.mock.calls[0][0]);
    expect(mineralUrl.searchParams.get("distance")).toBe("1000");
    expect(mineralUrl.searchParams.get("units")).toBe("esriSRUnit_Meter");
    expect(mineralUrl.searchParams.get("outFields")).toContain("Comm_list");

    const nsprdCall = fetchMock.mock.calls[1];
    const body = nsprdCall[1]?.body as URLSearchParams;
    expect(body.get("geometryType")).toBe("esriGeometryMultipoint");
    expect(body.get("distance")).toBe("1000");
    expect(body.get("units")).toBe("esriSRUnit_Meter");
    expect(JSON.parse(body.get("geometry") ?? "{}").points).toEqual([
      [-61.4786, 45.8122],
      [-61.4762, 45.8122],
    ]);
    expect(result.features.map(({ properties }) => properties.PID)).toEqual([
      "90000001",
    ]);
  });

  it("skips NSPRD when the occurrence viewport is empty", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ type: "FeatureCollection", features: [] })),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchMineralProximityParcels(bounds);

    expect(result).toEqual({ type: "FeatureCollection", features: [] });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("batches 501 points into two NSPRD requests", async () => {
    const occurrences = Array.from({ length: 501 }, (_, index) =>
      occurrence(index + 1, -61.5 + index / 100_000),
    );
    const fetchMock = vi.fn(async (_input: string | URL | Request, init?: RequestInit) =>
      init?.method === "POST"
        ? new Response(JSON.stringify({ type: "FeatureCollection", features: [] }))
        : new Response(JSON.stringify({ type: "FeatureCollection", features: occurrences })),
    );
    vi.stubGlobal("fetch", fetchMock);

    await fetchMineralProximityParcels(bounds);

    const postCalls = fetchMock.mock.calls.filter(([, init]) => init?.method === "POST");
    expect(postCalls).toHaveLength(2);
    expect(JSON.parse((postCalls[0][1]?.body as URLSearchParams).get("geometry") ?? "{}").points)
      .toHaveLength(500);
    expect(JSON.parse((postCalls[1][1]?.body as URLSearchParams).get("geometry") ?? "{}").points)
      .toHaveLength(1);
  });

  it("pages full NSPRD responses and deduplicates PIDs", async () => {
    const fullPage = Array.from({ length: 2_000 }, (_, index) =>
      parcel(String(90_000_000 + index)),
    );
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        type: "FeatureCollection",
        features: [occurrence(1, -61.4786)],
      })))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        type: "FeatureCollection",
        features: fullPage,
      })))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        type: "FeatureCollection",
        features: [fullPage[1_999], parcel("99999999")],
      })));
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchMineralProximityParcels(bounds);

    expect(result.features).toHaveLength(2_001);
    const finalBody = fetchMock.mock.calls[2][1]?.body as URLSearchParams;
    expect(finalBody.get("resultOffset")).toBe("2000");
  });

  it("rejects an NSPRD failure without partial geometry", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        type: "FeatureCollection",
        features: [occurrence(1, -61.4786)],
      })))
      .mockResolvedValueOnce(new Response("unavailable", { status: 503 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchMineralProximityParcels(bounds)).rejects.toThrow(
      "NSPRD proximity query failed (503)",
    );
  });

  it("forwards abort signals to both source queries", async () => {
    const controller = new AbortController();
    const fetchMock = vi.fn(async (_input: string | URL | Request, init?: RequestInit) =>
      init?.method === "POST"
        ? new Response(JSON.stringify({ type: "FeatureCollection", features: [] }))
        : new Response(JSON.stringify({
            type: "FeatureCollection",
            features: [occurrence(1, -61.4786)],
          })),
    );
    vi.stubGlobal("fetch", fetchMock);

    await fetchMineralProximityParcels(bounds, controller.signal);

    expect(fetchMock.mock.calls[0][1]?.signal).toBe(controller.signal);
    expect(fetchMock.mock.calls[1][1]?.signal).toBe(controller.signal);
  });
});
