import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchParcelResourceIntersections } from "./parcelResources";

const parcel = {
  type: "Feature" as const,
  properties: { PID: "15234636" },
  geometry: {
    type: "Polygon" as const,
    coordinates: [[
      [-60.02, 46.18],
      [-60.01, 46.18],
      [-60.01, 46.19],
      [-60.02, 46.19],
      [-60.02, 46.18],
    ]],
  },
};

afterEach(() => vi.unstubAllGlobals());

describe("parcel resource intersections", () => {
  it("queries every official resource source with the exact parcel polygon", async () => {
    const fetchMock = vi.fn(async (
      input: string | URL | Request,
      init?: RequestInit,
    ) => {
      const url = String(input);
      if (url.includes("mineral_occurrence_database")) {
        const body = init?.body as URLSearchParams;
        if (body.get("distance") === "1000") {
          return new Response(JSON.stringify({
            features: [
              { attributes: {
                geo_id: 7,
                Occ_num: "A01-001",
                Name: "Exact occurrence",
                Status: "Occurrence",
                Comm_list: "Au, Ag",
              } },
              { attributes: {
                geo_id: 8,
                Occ_num: "A01-002",
                Name: "Nearby occurrence",
                Status: "Placer",
                Comm_prim: "Au",
              } },
            ],
          }));
        }
        return new Response(JSON.stringify({
          features: [{ attributes: {
            geo_id: 7,
            Occ_num: "A01-001",
            Name: "Exact occurrence",
            Status: "Occurrence",
            Comm_list: "Au, Ag",
          } }],
        }));
      }
      if (url.includes("NovaRoc/MapServer/1")) {
        return new Response(JSON.stringify({
          features: [{ attributes: {
            OBJECTID: 11,
            TENURE_NUMBER_ID: "EL-1001",
            MTA_TENURE_TYPE_CODE: "Exploration Licence",
            MINERAL_TENURE_STATUS_CODE: "Active",
          } }],
        }));
      }
      return new Response(JSON.stringify({ features: [] }));
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchParcelResourceIntersections([parcel]);

    expect(result["mineral-occurrences"]).toEqual({
      status: "ready",
      intersections: [
        {
          id: "A01-001",
          name: "Exact occurrence",
          detail: "Occurrence · Au, Ag",
          relationship: "on-parcel",
        },
        {
          id: "A01-002",
          name: "Nearby occurrence",
          detail: "Placer · Au",
          relationship: "within-1km",
        },
      ],
    });
    expect(result["mineral-tenure"]).toMatchObject({
      status: "ready",
      intersections: [{ id: "EL-1001", name: "Exploration Licence EL-1001" }],
    });
    expect(result["abandoned-mines"]).toMatchObject({
      status: "ready",
      intersections: [],
    });
    expect(fetchMock).toHaveBeenCalledTimes(5);

    const mineralBodies = fetchMock.mock.calls
      .filter(([input]) => String(input).includes("mineral_occurrence_database"))
      .map(([, options]) => options?.body as URLSearchParams);
    expect(mineralBodies).toHaveLength(2);
    expect(mineralBodies[0].has("distance")).toBe(false);
    expect(mineralBodies[1].get("distance")).toBe("1000");
    expect(mineralBodies[1].get("units")).toBe("esriSRUnit_Meter");

    for (const [, options] of fetchMock.mock.calls) {
      const body = options?.body as URLSearchParams;
      expect(body.get("spatialRel")).toBe("esriSpatialRelIntersects");
      expect(body.get("geometryType")).toBe("esriGeometryPolygon");
      expect(body.get("geometry")).toContain("-60.02");
    }
  });

  it("reports a failed source separately from valid empty results", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.includes("Abandoned_Mine")) {
        return new Response("unavailable", { status: 503 });
      }
      return new Response(JSON.stringify({ features: [] }));
    }));

    const result = await fetchParcelResourceIntersections([parcel]);

    expect(result["mineral-occurrences"].status).toBe("ready");
    expect(result["mineral-occurrences"].intersections).toEqual([]);
    expect(result["abandoned-mines"].status).toBe("error");
  });
});
