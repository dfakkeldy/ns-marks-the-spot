import { afterEach, describe, expect, it, vi } from "vitest";
import {
  NSPRD_LAYER_URL,
  buildPointQueryUrl,
  buildPidQueryUrl,
  fetchParcelAtPoint,
  fetchParcels,
  hasQueryablePolygon,
  identifyParcelsAtPoint,
  normalizePid,
  type NsprdFeatureCollection,
} from "./nsprd";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("NSPRD PID queries", () => {
  it("normalizes common PID formatting without guessing missing digits", () => {
    expect(normalizePid("50 20-3256")).toBe("50203256");
    expect(normalizePid("5020325")).toBeNull();
    expect(normalizePid("50203256 extra")).toBeNull();
  });

  it("builds a geometry-enabled GeoJSON query with unique PIDs", () => {
    const url = new URL(
      buildPidQueryUrl(["50203256", "50000462", "50203256"]),
    );

    expect(`${url.origin}${url.pathname}`).toBe(`${NSPRD_LAYER_URL}/query`);
    expect(url.searchParams.get("where")).toBe(
      "PID IN ('50203256','50000462')",
    );
    expect(url.searchParams.get("outFields")).toBe(
      "PID,UPDAT_DATE,SHAPE.AREA",
    );
    expect(url.searchParams.get("returnGeometry")).toBe("true");
    expect(url.searchParams.get("outSR")).toBe("4326");
    expect(url.searchParams.get("f")).toBe("geojson");
  });

  it("rejects an empty or malformed PID query", () => {
    expect(() => buildPidQueryUrl([])).toThrow("at least one valid PID");
    expect(() => buildPidQueryUrl(["not-a-pid"])).toThrow(
      "at least one valid PID",
    );
  });

  it("builds a point-intersection query for a tapped map coordinate", () => {
    const url = new URL(buildPointQueryUrl(46.059488, -61.414138));

    expect(`${url.origin}${url.pathname}`).toBe(`${NSPRD_LAYER_URL}/query`);
    expect(url.searchParams.get("geometry")).toBe("-61.414138,46.059488");
    expect(url.searchParams.get("geometryType")).toBe("esriGeometryPoint");
    expect(url.searchParams.get("inSR")).toBe("4326");
    expect(url.searchParams.get("spatialRel")).toBe(
      "esriSpatialRelIntersects",
    );
    expect(url.searchParams.get("outFields")).toBe(
      "PID,UPDAT_DATE,SHAPE.AREA",
    );
    expect(url.searchParams.get("returnGeometry")).toBe("true");
    expect(url.searchParams.get("outSR")).toBe("4326");
    expect(url.searchParams.get("f")).toBe("geojson");
  });

  it("rejects invalid map coordinates before querying NSPRD", () => {
    expect(() => buildPointQueryUrl(91, -61)).toThrow("valid latitude");
    expect(() => buildPointQueryUrl(46, -181)).toThrow("valid longitude");
  });

  it("returns the parcel containing a tapped map point", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          type: "FeatureCollection",
          features: [
            {
              type: "Feature",
              properties: { PID: "50251750" },
              geometry: {
                type: "Polygon",
                coordinates: [],
              },
            },
          ],
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const collection = await fetchParcelAtPoint(46.059488, -61.414138);

    expect(collection.features.map(({ properties }) => properties.PID)).toEqual([
      "50251750",
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("batches large exact-PID catalogs and merges returned geometry", async () => {
    const pids = Array.from({ length: 81 }, (_, index) =>
      String(10_000_000 + index),
    );
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = new URL(String(input));
      const requestedPids = url.searchParams.get("where")?.match(/\d{8}/g) ?? [];

      return new Response(
        JSON.stringify({
          type: "FeatureCollection",
          features: requestedPids.map((pid) => ({
            type: "Feature",
            properties: { PID: pid },
            geometry: { type: "Point", coordinates: [-60, 46] },
          })),
        }),
        { status: 200 },
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const collection = await fetchParcels(pids);

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(collection.features).toHaveLength(81);
    expect(collection.features.map(({ properties }) => properties.PID)).toEqual(
      pids,
    );
  });

  it("reports a completed PID batch while a slower batch is still pending", async () => {
    const pids = Array.from({ length: 41 }, (_, index) =>
      String(10_000_000 + index),
    );
    let resolveFirstBatch!: (response: Response) => void;
    let resolveSecondBatch!: (response: Response) => void;
    const firstBatch = new Promise<Response>((resolve) => {
      resolveFirstBatch = resolve;
    });
    const secondBatch = new Promise<Response>((resolve) => {
      resolveSecondBatch = resolve;
    });
    const fetchMock = vi
      .fn()
      .mockReturnValueOnce(firstBatch)
      .mockReturnValueOnce(secondBatch);
    vi.stubGlobal("fetch", fetchMock);
    const onBatch = vi.fn();

    const collectionPromise = fetchParcels(pids, undefined, onBatch);
    resolveSecondBatch(
      new Response(
        JSON.stringify({
          type: "FeatureCollection",
          features: [
            {
              type: "Feature",
              properties: { PID: pids[40] },
              geometry: { type: "Point", coordinates: [-60, 46] },
            },
          ],
        }),
        { status: 200 },
      ),
    );

    await vi.waitFor(() => expect(onBatch).toHaveBeenCalledTimes(1));
    expect(onBatch).toHaveBeenCalledWith(
      expect.objectContaining({
        features: [
          expect.objectContaining({
            properties: expect.objectContaining({ PID: pids[40] }),
          }),
        ],
      }),
    );

    resolveFirstBatch(
      new Response(
        JSON.stringify({
          type: "FeatureCollection",
          features: pids.slice(0, 40).map((pid) => ({
            type: "Feature",
            properties: { PID: pid },
            geometry: { type: "Point", coordinates: [-60, 46] },
          })),
        }),
        { status: 200 },
      ),
    );
    await expect(collectionPromise).resolves.toEqual(
      expect.objectContaining({ features: expect.any(Array) }),
    );
  });
});

describe("NSPRD point replies", () => {
  // NSPRD may answer with a null, blank, or numeric PID. The declared
  // `PID: string` says what a stored parcel may be assumed to carry, not what
  // the wire is allowed to send, and the cast is that gap in one place.
  const pointFeature = (pid: unknown) =>
    ({
      type: "Feature",
      properties: { PID: pid },
      geometry: { type: "Point", coordinates: [-61.414138, 46.059488] },
    }) as unknown as NsprdFeatureCollection["features"][number];

  const reply = (
    ...features: NsprdFeatureCollection["features"]
  ): NsprdFeatureCollection => ({ type: "FeatureCollection", features });

  it("tells an empty reply apart from one carrying no readable PID", () => {
    expect(identifyParcelsAtPoint(reply())).toEqual({
      identified: { type: "FeatureCollection", features: [] },
      pids: [],
      unidentifiedCount: 0,
    });

    // A padded or non-canonical PID is a gap too: the selection, the share
    // URL and the evidence requests all key on the eight-digit form, and
    // repairing the wire value would put a PID the user never saw on the page.
    const unreadable = identifyParcelsAtPoint(
      reply(
        pointFeature(null),
        pointFeature(""),
        pointFeature(50251750),
        pointFeature("   "),
        pointFeature("50251750 "),
        pointFeature("unknown"),
      ),
    );
    expect(unreadable.pids).toEqual([]);
    expect(unreadable.identified.features).toEqual([]);
    expect(unreadable.unidentifiedCount).toBe(6);
  });

  it("counts a feature with no properties at all as unidentified", () => {
    const result = identifyParcelsAtPoint(
      reply(
        { type: "Feature", properties: null, geometry: null } as unknown as
          NsprdFeatureCollection["features"][number],
        pointFeature("50251750"),
      ),
    );

    expect(result.pids).toEqual(["50251750"]);
    expect(result.unidentifiedCount).toBe(1);
  });

  it("keeps every distinct PID where parcels meet, in the order NSPRD listed", () => {
    const result = identifyParcelsAtPoint(
      reply(
        pointFeature("50251750"),
        pointFeature("50334317"),
        pointFeature("50251750"),
      ),
    );

    expect(result.pids).toEqual(["50251750", "50334317"]);
    expect(result.identified.features).toHaveLength(3);
    expect(result.unidentifiedCount).toBe(0);
  });

  it("does not let one unreadable shape hide the parcels behind it", () => {
    const result = identifyParcelsAtPoint(
      reply(pointFeature(null), pointFeature("50251750")),
    );

    expect(result.pids).toEqual(["50251750"]);
    expect(result.identified.features).toHaveLength(1);
    expect(result.unidentifiedCount).toBe(1);
  });
});

describe("queryable parcel geometry", () => {
  const parcel = (geometry: unknown) =>
    ({
      type: "Feature",
      properties: { PID: "50251750", "SHAPE.AREA": 100 },
      geometry,
    }) as unknown as NsprdFeatureCollection["features"][number];

  it("accepts a closed polygon with area", () => {
    expect(
      hasQueryablePolygon(
        parcel({
          type: "Polygon",
          coordinates: [[[-61, 46], [-60.9, 46], [-60.9, 46.1], [-61, 46]]],
        }),
      ),
    ).toBe(true);
  });

  // Each of these answers "outside" for every point on the map, so every
  // spatial lookup would come back empty — a negative about the ground
  // produced by a shape that encloses nothing.
  it.each([
    ["null", null],
    ["a point", { type: "Point", coordinates: [-61, 46] }],
    ["a line", { type: "LineString", coordinates: [[-61, 46], [-60.9, 46]] }],
    ["an unclosed ring", {
      type: "Polygon",
      coordinates: [[[-61, 46], [-60.9, 46], [-60.9, 46.1]]],
    }],
    ["a collinear ring", {
      type: "Polygon",
      coordinates: [[[-61, 46], [-60.999, 46.001], [-60.998, 46.002], [-61, 46]]],
    }],
    ["a ring off the globe", {
      type: "Polygon",
      coordinates: [[[-361, 46], [-60.9, 46], [-60.9, 46.1], [-361, 46]]],
    }],
    ["a ring with a non-finite position", {
      type: "Polygon",
      coordinates: [[[-61, 46], [Number.NaN, 46], [-60.9, 46.1], [-61, 46]]],
    }],
  ])("refuses %s", (_label, geometry) => {
    expect(hasQueryablePolygon(parcel(geometry))).toBe(false);
  });

  it("accepts a MultiPolygon with one usable part", () => {
    expect(
      hasQueryablePolygon(
        parcel({
          type: "MultiPolygon",
          coordinates: [
            [[[-61, 46], [-60.9, 46], [-60.9, 46.1]]],
            [[[-61, 46], [-60.9, 46], [-60.9, 46.1], [-61, 46]]],
          ],
        }),
      ),
    ).toBe(true);
  });
});
