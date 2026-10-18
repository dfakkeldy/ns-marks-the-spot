import { afterEach, describe, expect, it, vi } from "vitest";
import {
  OLD_GROWTH_POLICY_PAGE_SIZE,
  buildOldGrowthPolicyQueryUrl,
  describeOldGrowthPolicyFeature,
  fetchOldGrowthPolicyPolygons,
} from "./oldGrowthPolicy";

const bounds = {
  north: 46.9,
  east: -60,
  south: 46,
  west: -61.8,
};

function feature(id: string, oldGrowth: string) {
  return {
    type: "Feature" as const,
    geometry: {
      type: "Polygon" as const,
      coordinates: [
        [
          [-61.4, 46.1],
          [-61.3, 46.1],
          [-61.3, 46.2],
          [-61.4, 46.1],
        ],
      ],
    },
    properties: {
      ":id": id,
      selmethod: "1",
      old_growth: oldGrowth,
      selmethtxt: "Desktop analysis",
      oldgrowtxt:
        oldGrowth === "1"
          ? "Confirmed old growth"
          : oldGrowth === "2"
            ? "Restoration opportunity"
            : "Unknown",
      hectares: "12.45",
    },
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("old-growth policy source contract", () => {
  it("builds a bounded, stable, paginated Socrata query", () => {
    const url = new URL(buildOldGrowthPolicyQueryUrl(bounds, 1_000));

    expect(`${url.origin}${url.pathname}`).toBe(
      "https://data.novascotia.ca/resource/wanf-acts.geojson",
    );
    expect(url.searchParams.get("$select")).toBe(
      ":id,the_geom,selmethod,old_growth,selmethtxt,oldgrowtxt,hectares",
    );
    expect(url.searchParams.get("$where")).toBe(
      "within_box(the_geom,46.9,-61.8,46,-60)",
    );
    expect(url.searchParams.get("$order")).toBe(":id");
    expect(url.searchParams.get("$limit")).toBe(
      String(OLD_GROWTH_POLICY_PAGE_SIZE),
    );
    expect(url.searchParams.get("$offset")).toBe("1000");
  });

  it("keeps confirmed, restoration, and unknown policy statuses distinct", () => {
    expect(
      describeOldGrowthPolicyFeature(feature("1", "1").properties),
    ).toEqual({
      status: "confirmed-old-growth",
      statusLabel: "Confirmed old growth",
      hectares: 12.45,
      selectionMethod: "Desktop analysis",
    });
    expect(
      describeOldGrowthPolicyFeature(feature("2", "2").properties),
    ).toEqual({
      status: "restoration-opportunity",
      statusLabel: "Restoration opportunity",
      hectares: 12.45,
      selectionMethod: "Desktop analysis",
    });
    expect(
      describeOldGrowthPolicyFeature(feature("3", "0").properties),
    ).toEqual({
      status: "unknown",
      statusLabel: "Status unknown",
      hectares: 12.45,
      selectionMethod: "Desktop analysis",
    });
  });

  it("paginates the visible extent until the source returns a short page", async () => {
    const firstPage = Array.from(
      { length: OLD_GROWTH_POLICY_PAGE_SIZE },
      (_, index) => feature(String(index), "1"),
    );
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          type: "FeatureCollection",
          features: firstPage,
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          type: "FeatureCollection",
          features: [feature("last", "2")],
        }),
      });
    vi.stubGlobal("fetch", fetchMock);

    const collection = await fetchOldGrowthPolicyPolygons(bounds);

    expect(collection.features).toHaveLength(
      OLD_GROWTH_POLICY_PAGE_SIZE + 1,
    );
    expect(collection.features.at(-1)?.properties.old_growth).toBe("2");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(
      new URL(String(fetchMock.mock.calls[1]?.[0])).searchParams.get("$offset"),
    ).toBe(String(OLD_GROWTH_POLICY_PAGE_SIZE));
  });

  it("reports a source failure instead of converting it to an empty result", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
      }),
    );

    await expect(fetchOldGrowthPolicyPolygons(bounds)).rejects.toThrow(
      "Old-growth policy source returned HTTP 503",
    );
  });

  it("reports malformed source geometry instead of filtering it into an empty result", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          type: "FeatureCollection",
          features: [
            {
              type: "Feature",
              geometry: { type: "Point", coordinates: [-61.4, 46.1] },
              properties: { old_growth: "1" },
            },
          ],
        }),
      }),
    );

    await expect(fetchOldGrowthPolicyPolygons(bounds)).rejects.toThrow(
      "Old-growth policy source returned an invalid feature",
    );
  });
});
