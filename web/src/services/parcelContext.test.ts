import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ADJACENT_ROAD_DISTANCE_METRES,
  fetchParcelContext,
  mappedAreaForPid,
  roadsNamedByCivicAddress,
  type ParcelContext,
} from "./parcelContext";
import type { CivicAddressProperties } from "./civicAddresses";
import type { NsprdFeatureCollection } from "./nsprd";

const parcels: NsprdFeatureCollection = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      properties: { PID: "50334317", "SHAPE.AREA": 100_000 },
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [-61.2, 46.4],
            [-61.1, 46.4],
            [-61.1, 46.3],
            [-61.2, 46.3],
            [-61.2, 46.4],
          ],
        ],
      },
    },
    {
      type: "Feature",
      properties: { PID: "50334317", "SHAPE.AREA": 11_057.27135 },
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [-61.3, 46.4],
            [-61.2, 46.4],
            [-61.2, 46.3],
            [-61.3, 46.3],
            [-61.3, 46.4],
          ],
        ],
      },
    },
  ],
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("parcel acreage and mapped context", () => {
  it("sums multi-part NSPRD parcels and formats acres", () => {
    expect(mappedAreaForPid(parcels, "50334317")).toEqual({
      squareMetres: 111_057.27135,
      acres: 27.44,
      label: "27.44 acres",
    });
    expect(mappedAreaForPid(parcels, "00000000")).toBeNull();
  });

  it("queries every relevant Province sublayer with the selected geometry", async () => {
    const responses: Record<string, { features: unknown[] }> = {
      "road:intersects:5": {
        features: [
          {
            attributes: {
              STREET: "Cabot Trail",
              ROADC_DESC: "Arterial",
              FEAT_DESC: "Bridge",
            },
          },
        ],
      },
      "road:intersects:8": {
        features: [
          {
            attributes: {
              STREET: "Cabot Trail",
              ROADC_DESC: "Arterial",
              FEAT_DESC: "Road",
            },
          },
        ],
      },
      "road:intersects:10": {
        features: [{ attributes: { FEAT_DESC: "CULVERT line" } }],
      },
      "road:adjacent:8": {
        features: [
          {
            attributes: {
              STREET: "Harbour Road",
              ROADC_DESC: "Local",
              FEAT_DESC: "Road",
            },
          },
        ],
      },
      "water:intersects:4": {
        features: [
          {
            attributes: {
              RIVNAME_1: "Mabou River",
              FEAT_DESC: "River or stream line",
            },
          },
        ],
      },
    };
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(String(input));
      const body = new URLSearchParams(String(init?.body));
      const layerId = url.pathname.match(/\/(\d+)\/query$/)?.[1];
      const source = url.pathname.includes("Water_WM84") ? "water" : "road";
      const relationship = body.has("distance") ? "adjacent" : "intersects";

      expect(init?.method).toBe("POST");
      expect(body.get("geometryType")).toBe("esriGeometryPolygon");
      expect(body.get("spatialRel")).toBe("esriSpatialRelIntersects");
      expect(JSON.parse(body.get("geometry") ?? "{}").rings).toHaveLength(2);
      if (relationship === "adjacent") {
        expect(body.get("distance")).toBe(String(ADJACENT_ROAD_DISTANCE_METRES));
        expect(body.get("units")).toBe("esriSRUnit_Meter");
      } else {
        expect(body.has("distance")).toBe(false);
      }

      return new Response(
        JSON.stringify(
          responses[`${source}:${relationship}:${layerId}`] ?? { features: [] },
        ),
        { status: 200 },
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const context: ParcelContext = await fetchParcelContext(parcels.features);

    expect(fetchMock).toHaveBeenCalledTimes(22);
    expect(context.roads).toEqual([
      { name: "Cabot Trail", kind: "Arterial", relationship: "intersects" },
      {
        name: "Culvert",
        kind: "Non-vehicle feature",
        relationship: "intersects",
      },
      { name: "Harbour Road", kind: "Local", relationship: "adjacent" },
    ]);
    expect(context.water).toEqual([
      {
        name: "Mabou River",
        kind: "River or stream",
        relationship: "intersects",
      },
    ]);
  });

  it("surfaces a Province intersection-service failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status: 503 })));

    await expect(fetchParcelContext(parcels.features)).rejects.toThrow(
      "mapped feature request failed with status 503",
    );
  });
});

describe("roads named by a civic address", () => {
  const address = (
    parts: Partial<CivicAddressProperties>,
  ): { properties: CivicAddressProperties } => ({
    properties: {
      pntid: "1", civicnum: "12", civsuffix: null, unit_num: null,
      add_loc: null, strprefix: null, strname: null, strsuffix: null,
      strdir: null, comm: "Mabou", mun: "Inverness", county: "Inverness",
      ...parts,
    },
  });

  it("returns only the addressed roads the mapped layers did not already name", () => {
    expect(
      roadsNamedByCivicAddress(
        [{ name: "Main St", kind: "Local", relationship: "intersects" }],
        [address({ strname: "MAIN", strsuffix: "ST" })],
      ),
    ).toEqual([]);
  });

  it("names one road for several addresses on the same street", () => {
    expect(
      roadsNamedByCivicAddress(
        [],
        [
          address({ strname: "Main", strsuffix: "St" }),
          address({ pntid: "2", strname: "Main", strsuffix: "St" }),
          address({ pntid: "3", strname: "Shore", strsuffix: "Rd" }),
        ],
      ),
    ).toEqual([
      { name: "Main St", kind: "Civic Address File", relationship: "civic-address" },
      { name: "Shore Rd", kind: "Civic Address File", relationship: "civic-address" },
    ]);
  });

  it("skips an address that names no road at all", () => {
    expect(roadsNamedByCivicAddress([], [address({})])).toEqual([]);
  });

  // The print appendix takes this branch when the road layers failed: the
  // address file still answered, and what it named still belongs on the page.
  it("still names the addressed roads when no mapped road was returned", () => {
    expect(
      roadsNamedByCivicAddress([], [address({ strname: "Shore", strsuffix: "Rd" })]),
    ).toEqual([
      { name: "Shore Rd", kind: "Civic Address File", relationship: "civic-address" },
    ]);
  });
});
