import { afterEach, describe, expect, it, vi } from "vitest";
import type { NsprdFeatureCollection } from "./nsprd";
import {
  COASTAL_SCENARIO_TIMEOUT_MS,
  fetchCoastalFloodEvidence,
  fetchPublishedRiverFloodEvidence,
  summarizeRasterAlpha,
} from "./floodHazard";

const parcelFeatures: NsprdFeatureCollection["features"] = [
  {
    type: "Feature",
    properties: { PID: "12345678", "SHAPE.AREA": 800 },
    geometry: {
      type: "Polygon",
      coordinates: [
        [[-63.7, 44.74], [-63.68, 44.74], [-63.68, 44.76], [-63.7, 44.76], [-63.7, 44.74]],
        [[-63.695, 44.745], [-63.69, 44.745], [-63.69, 44.75], [-63.695, 44.75], [-63.695, 44.745]],
      ],
    },
  },
];

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("published river flood evidence", () => {
  it("preserves parcel rings and reports published AEP intersections without inventing a parcel probability", async () => {
    const requests: URLSearchParams[] = [];
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL, init?: RequestInit) => {
      const body = new URLSearchParams(String(init?.body));
      requests.push(body);
      const layerId = Number(new URL(String(input)).pathname.split("/").at(-2));
      return new Response(JSON.stringify({
        features: layerId === 8 || layerId === 10 ? [{ attributes: { OBJECTID: 1 } }] : [],
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    }));

    const result = await fetchPublishedRiverFloodEvidence(parcelFeatures);

    expect(result.status).toBe("published-intersection");
    expect(result.aep).toEqual([
      { annualExceedanceProbabilityPercent: 5, relationship: "area", places: ["Bedford / Sackville"] },
      { annualExceedanceProbabilityPercent: 1, relationship: "area", places: ["Bedford / Sackville"] },
    ]);
    const geometry = JSON.parse(requests[0].get("geometry") ?? "{}") as { rings: number[][][] };
    expect(geometry.rings).toHaveLength(2);
    expect(geometry.rings[1]).toHaveLength(5);
    expect(requests[0].get("resultRecordCount")).toBeNull();
    expect(result).not.toHaveProperty("probability");
  });

  it("keeps boundary-only 5% mapping distinct from polygon exposure", async () => {
    const pictouFeatures: NsprdFeatureCollection["features"] = [
      {
        ...parcelFeatures[0],
        geometry: {
          type: "Polygon",
          coordinates: [[
            [-62.67, 45.52], [-62.65, 45.52], [-62.65, 45.54],
            [-62.67, 45.54], [-62.67, 45.52],
          ]],
        },
      },
    ];
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL) => {
      const layerId = Number(new URL(String(input)).pathname.split("/").at(-2));
      return new Response(JSON.stringify({
        features: layerId === 12 ? [{ attributes: { OBJECTID: 7 } }] : [],
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    }));

    const result = await fetchPublishedRiverFloodEvidence(pictouFeatures);

    expect(result.status).toBe("published-intersection");
    expect(result.aep).toEqual([
      { annualExceedanceProbabilityPercent: 5, relationship: "boundary", places: ["Pictou"] },
    ]);
  });

  it("does not query study layers for a parcel outside every published extent", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const outsideFeatures: NsprdFeatureCollection["features"] = [
      {
        ...parcelFeatures[0],
        geometry: {
          type: "Polygon",
          coordinates: [[
            [-61.3, 46.1], [-61.2, 46.1], [-61.2, 46.2],
            [-61.3, 46.2], [-61.3, 46.1],
          ]],
        },
      },
    ];

    await expect(fetchPublishedRiverFloodEvidence(outsideFeatures)).resolves.toEqual({
      status: "outside-published-layer-extents",
      aep: [],
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not turn a service failure into no flood hazard", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("unavailable", { status: 503 })));

    await expect(fetchPublishedRiverFloodEvidence(parcelFeatures)).resolves.toMatchObject({
      status: "error",
    });
  });
});

describe("coastal raster sampling", () => {
  it("counts only parcel pixels, including holes, and measures flooded exposure", () => {
    const alpha = new Uint8ClampedArray(4 * 4 * 4);
    for (let pixel = 0; pixel < 16; pixel += 1) {
      alpha[pixel * 4 + 3] = pixel % 2 === 0 ? 255 : 0;
    }

    const result = summarizeRasterAlpha({
      rgba: alpha,
      width: 4,
      height: 4,
      bounds: { west: -63.7, south: 44.74, east: -63.68, north: 44.76 },
      features: parcelFeatures,
      mappedAreaSquareMetres: 800,
    });

    expect(result.sampledParcelPixels).toBeGreaterThan(0);
    expect(result.floodedParcelPixels).toBeLessThan(result.sampledParcelPixels);
    expect(result.approximateAffectedPercent).toBeGreaterThan(0);
    expect(result.approximateAffectedPercent).toBeLessThan(100);
    expect(result.approximateAffectedSquareMetres).toBe(
      Math.round(800 * result.approximateAffectedPercent) / 100,
    );
  });

  it("keeps current, 2050, and 2100 source states independent", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL) => {
      const url = String(input);
      if (url.includes("2050")) return new Response("unavailable", { status: 503 });
      return new Response(url.includes("Current_Day") ? "flooded" : "clear", { status: 200 });
    }));

    const result = await fetchCoastalFloodEvidence(
      parcelFeatures,
      800,
      undefined,
      async (blob) => {
        const flooded = (await blob.text()) === "flooded";
        const rgba = new Uint8ClampedArray(4 * 4 * 4);
        if (flooded) {
          for (let pixel = 0; pixel < 4; pixel += 1) rgba[pixel * 4 + 3] = 255;
        }
        return { rgba, width: 4, height: 4 };
      },
    );

    expect(result.map(({ scenario, status }) => ({ scenario, status }))).toEqual([
      { scenario: "current", status: "intersects" },
      { scenario: "2050", status: "error" },
      { scenario: "2100", status: "no-intersection" },
    ]);
    expect(result[0]).toMatchObject({
      stormAnnualExceedanceProbabilityPercent: 1,
    });
    expect(result[0].status === "intersects" && result[0].approximateAffectedSquareMetres)
      .toBeGreaterThan(0);
    expect(result[2]).not.toHaveProperty("probability");
  });

  // A request that never settled used to hang the whole join: two answered
  // scenarios went unreported, and the print capture then sealed all three as
  // a source that had not answered.
  it("lets the scenarios that answered stand while the one that never replied says it ran out of time", async () => {
    vi.useFakeTimers();
    try {
      vi.stubGlobal("fetch", vi.fn((input: string | URL, init?: RequestInit) => {
        if (String(input).includes("2100")) {
          // The service that never comes back. Only this scenario's own
          // deadline ends it.
          return new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () => {
              reject(new DOMException("The operation was aborted.", "AbortError"));
            });
          });
        }
        return Promise.resolve(new Response("clear", { status: 200 }));
      }));

      const pending = fetchCoastalFloodEvidence(
        parcelFeatures,
        800,
        undefined,
        async () => ({ rgba: new Uint8ClampedArray(4 * 4 * 4), width: 4, height: 4 }),
      );
      await vi.advanceTimersByTimeAsync(COASTAL_SCENARIO_TIMEOUT_MS);
      const result = await pending;

      expect(result.map(({ scenario, status }) => ({ scenario, status }))).toEqual([
        { scenario: "current", status: "no-intersection" },
        { scenario: "2050", status: "no-intersection" },
        { scenario: "2100", status: "unanswered" },
      ]);
      expect(result[2]).toMatchObject({ stage: "request" });
      // Nothing was measured, so nothing about the ground is reported.
      expect(result[2]).not.toHaveProperty("approximateAffectedPercent");
      expect(result[2]).not.toHaveProperty("approximateAffectedSquareMetres");
      expect(result[2]).not.toHaveProperty("sampledParcelPixels");
    } finally {
      vi.useRealTimers();
    }
  });

  // A raster that landed no sample inside the outline measured nothing. The
  // old code called that "no-intersection" with 0% affected, which reads as
  // the scenario missing the lot.
  // The deadline has to cover the decode too: a service that answers and then
  // hands back bytes nothing finishes with held the whole set exactly as a
  // silent fetch did.
  it("gives up on a scenario whose raster never finishes decoding", async () => {
    vi.useFakeTimers();
    try {
      vi.stubGlobal(
        "fetch",
        vi.fn(() => Promise.resolve(new Response("clear", { status: 200 }))),
      );
      let decoded = 0;
      const pending = fetchCoastalFloodEvidence(
        parcelFeatures,
        800,
        undefined,
        async () => {
          decoded += 1;
          // The last scenario's decoder never answers.
          if (decoded === 3) return new Promise(() => {});
          return { rgba: new Uint8ClampedArray(4 * 4 * 4), width: 4, height: 4 };
        },
      );
      await vi.advanceTimersByTimeAsync(COASTAL_SCENARIO_TIMEOUT_MS);

      const settled = await pending;
      expect(settled.map(({ status }) => status)).toEqual([
        "no-intersection",
        "no-intersection",
        "unanswered",
      ]);
      // The province replied; this browser could not read the reply in time.
      // Calling that a service that did not answer blames somebody else's
      // system for what happened here.
      expect(settled[2]).toMatchObject({ stage: "processing" });
    } finally {
      vi.useRealTimers();
    }
  });

  // A connection the network stack drops answers with a failure. Reading that
  // as silence would collapse the two states this split exists to keep apart.
  it("calls a dropped request a failure rather than a silence", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((input: string | URL) =>
        String(input).includes("2100")
          ? Promise.reject(new DOMException("connection aborted", "AbortError"))
          : Promise.resolve(new Response("clear", { status: 200 })),
      ),
    );

    const result = await fetchCoastalFloodEvidence(parcelFeatures, 800, undefined, async () => ({
      rgba: new Uint8ClampedArray(4 * 4 * 4),
      width: 4,
      height: 4,
    }));

    expect(result[2].status).toBe("error");
  });

  // A selection that has moved on must not have an older geometry's
  // measurement land on it, and the effect that tore down must not wait out
  // the whole scenario deadline first.
  it("gives up at once when the caller abandons it mid-decode", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(new Response("clear", { status: 200 }))),
    );
    const controller = new AbortController();

    const pending = fetchCoastalFloodEvidence(
      parcelFeatures,
      800,
      controller.signal,
      () => new Promise(() => {}),
    );
    controller.abort();

    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  });

  it("does not call an unsampled parcel a scenario miss", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("clear", { status: 200 })));

    const result = await fetchCoastalFloodEvidence(
      parcelFeatures,
      800,
      undefined,
      async () => ({ rgba: new Uint8ClampedArray(4 * 4 * 4), width: 4, height: 4 }),
    );

    // Two small far-apart parts: the only sampled centre falls in the gap
    // between them, so no pixel centre lands inside the parcel at all.
    const twoParts: NsprdFeatureCollection["features"] = [
      {
        ...parcelFeatures[0],
        geometry: {
          type: "Polygon",
          coordinates: [[
            [-63.7, 44.74],
            [-63.699, 44.74],
            [-63.699, 44.741],
            [-63.7, 44.741],
            [-63.7, 44.74],
          ]],
        },
      },
      {
        ...parcelFeatures[0],
        geometry: {
          type: "Polygon",
          coordinates: [[
            [-63.6, 44.84],
            [-63.599, 44.84],
            [-63.599, 44.841],
            [-63.6, 44.841],
            [-63.6, 44.84],
          ]],
        },
      },
    ];
    const unsampled = await fetchCoastalFloodEvidence(
      twoParts,
      800,
      undefined,
      async () => ({ rgba: new Uint8ClampedArray(4), width: 1, height: 1 }),
    );

    expect(result.every(({ status }) => status !== "not-sampled")).toBe(true);
    expect(unsampled.map(({ status }) => status)).toEqual([
      "not-sampled",
      "not-sampled",
      "not-sampled",
    ]);
    expect(unsampled[0]).not.toHaveProperty("approximateAffectedPercent");
    expect(unsampled[0]).not.toHaveProperty("approximateAffectedSquareMetres");
  });

  it("reports a parcel with no usable outline as not evaluated, not as a miss", async () => {
    const result = await fetchCoastalFloodEvidence([], 800, undefined, async () => {
      throw new Error("no scenario should be requested without an outline");
    });

    expect(result.map(({ scenario, status }) => ({ scenario, status }))).toEqual([
      { scenario: "current", status: "geometry-unavailable" },
      { scenario: "2050", status: "geometry-unavailable" },
      { scenario: "2100", status: "geometry-unavailable" },
    ]);
    expect(result[0]).not.toHaveProperty("approximateAffectedPercent");
  });
});
