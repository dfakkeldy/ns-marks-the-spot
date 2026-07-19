import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CIVIC_ADDRESS_FIELDS,
  CIVIC_ADDRESS_PAGE_SIZE,
  CIVIC_ADDRESS_SEARCH_LIMIT,
  buildCivicAddressQueryUrl,
  buildCivicAddressSearchUrl,
  fetchCivicAddresses,
  formatCivicAddress,
  formatCivicRoadName,
  searchCivicAddresses,
  type CivicAddressProperties,
} from "./civicAddresses";
import type { NsprdFeatureCollection } from "./nsprd";

type ParcelFeature = NsprdFeatureCollection["features"][number];

const completeProperties = (
  overrides: Partial<CivicAddressProperties> = {},
): CivicAddressProperties => ({
  pntid: "100",
  civicnum: "12",
  civsuffix: null,
  unit_num: null,
  add_loc: "Unknown",
  strprefix: null,
  strname: "Main",
  strsuffix: "St",
  strdir: null,
  comm: "Mabou",
  mun: "Municipality of the County of Inverness",
  county: "Inverness County",
  ...overrides,
});

const civicPoint = (
  pntid: string,
  coordinates: [number, number],
  overrides: Partial<CivicAddressProperties> = {},
) => ({
  type: "Feature" as const,
  geometry: { type: "Point" as const, coordinates },
  properties: completeProperties({ pntid, ...overrides }),
});

const geoJsonResponse = (features: ReturnType<typeof civicPoint>[]) =>
  new Response(
    JSON.stringify({
      type: "FeatureCollection",
      features,
      crs: {
        type: "name",
        properties: { name: "urn:ogc:def:crs:OGC:1.3:CRS84" },
      },
    }),
    { status: 200 },
  );

const parcelFeature = (
  geometry: ParcelFeature["geometry"],
  pid = "50334317",
): ParcelFeature => ({
  type: "Feature",
  properties: { PID: pid, "SHAPE.AREA": 1_000 },
  geometry,
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Nova Scotia Civic Address File lookup", () => {
  it("formats a road name separately for parcel-access context", () => {
    expect(
      formatCivicRoadName(
        completeProperties({
          strprefix: "West",
          strname: "Lawrencetown",
          strsuffix: "Road",
          strdir: null,
        }),
      ),
    ).toBe("West Lawrencetown Road");
    expect(
      formatCivicRoadName(
        completeProperties({
          strprefix: null,
          strname: null,
          strsuffix: null,
          strdir: null,
        }),
      ),
    ).toBeNull();
  });

  it("filters a leading civic number separately from full-text street terms", () => {
    const value = buildCivicAddressSearchUrl("  11064 Highway 19   Mabou  ");
    const url = new URL(value);

    expect(url.searchParams.get("$q")).toBe("Highway 19 Mabou");
    expect(url.searchParams.get("$where")).toBe("civicnum=11064");
    expect(url.searchParams.get("$select")).toBe(CIVIC_ADDRESS_FIELDS.join(","));
    expect(url.searchParams.get("$limit")).toBe(
      String(CIVIC_ADDRESS_SEARCH_LIMIT),
    );
    expect(url.searchParams.get("$order")).toBe("pntid");
    expect(value).toContain("%24q=Highway+19+Mabou");
    expect(value).toContain("%24where=civicnum%3D11064");
  });

  it("keeps searches without a leading civic number entirely full text", () => {
    const url = new URL(buildCivicAddressSearchUrl("Highway 19 Mabou"));

    expect(url.searchParams.get("$q")).toBe("Highway 19 Mabou");
    expect(url.searchParams.has("$where")).toBe(false);
  });

  it("returns unique formatted civic-address search results", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        geoJsonResponse([
          civicPoint("27700002", [-61.414138, 46.059488], {
            civicnum: "11064",
            strname: "Highway 19",
            strsuffix: null,
            comm: "Southwest Mabou",
            mun: "Inverness County",
          }),
          civicPoint("27700002", [-61.414138, 46.059488]),
        ]),
      ),
    );

    const results = await searchCivicAddresses("11064 Highway 19 Mabou");

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      pntid: "27700002",
      coordinates: [-61.414138, 46.059488],
      label: "11064 Highway 19, Southwest Mabou, Inverness County",
    });
  });

  it("finds an initialled possessive road when periods are omitted", async () => {
    const fetchMock = vi.fn((input: string | URL | Request) => {
      const fullTextQuery = new URL(String(input)).searchParams.get("$q");

      if (fullTextQuery === "dr's") {
        return Promise.resolve(
          geoJsonResponse([
            civicPoint("68501173", [-59.95, 46.2], {
              civicnum: "16",
              strname: "Tanya",
              strsuffix: "Dr",
              comm: "Glace Bay",
            }),
          ]),
        );
      }

      if (fullTextQuery === "D.R.'s") {
        return Promise.resolve(
          geoJsonResponse([
            civicPoint("32300086", [-61.49, 45.89], {
              civicnum: "20",
              strname: "D.R.'s",
              strsuffix: "Lane",
              comm: "Judique",
              mun: "Inverness County",
            }),
            civicPoint("400166262", [-62.1, 45.6], {
              civicnum: "67",
              strname: "Johnny D.R. #2",
              strsuffix: "Dr",
              comm: "McArras Brook",
              mun: "Pictou County",
              county: "Pictou County",
            }),
          ]),
        );
      }

      throw new Error(`Unexpected full-text query: ${fullTextQuery}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const results = await searchCivicAddresses("dr's");

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(results.map(({ label }) => label)).toEqual([
      "20 D.R.'s Lane, Judique, Inverness County",
    ]);
  });

  it("does not present civic-point placement metadata as part of the address", () => {
    expect(
      formatCivicAddress(
        completeProperties({
          civicnum: "11064",
          strname: "Highway 19",
          strsuffix: null,
          add_loc: "Building Centroid",
          comm: "Southwest Mabou",
          mun: "Inverness County",
        }),
      ),
    ).toBe("11064 Highway 19, Southwest Mabou, Inverness County");
  });

  it("builds an encoded bounded Socrata query in north, west, south, east order", () => {
    const value = buildCivicAddressQueryUrl(
      { north: 46.4, west: -61.2, south: 46.3, east: -61.1 },
      25,
      50,
    );
    const url = new URL(value);

    expect(url.searchParams.get("$where")).toBe(
      "within_box(the_geom,46.4,-61.2,46.3,-61.1)",
    );
    expect(url.searchParams.get("$select")).toBe(CIVIC_ADDRESS_FIELDS.join(","));
    expect(url.searchParams.get("$limit")).toBe("25");
    expect(url.searchParams.get("$offset")).toBe("50");
    expect(url.searchParams.get("$order")).toBe("pntid");
    expect(value).toContain(
      "%24where=within_box%28the_geom%2C46.4%2C-61.2%2C46.3%2C-61.1%29",
    );
    expect(value).not.toContain("within_box(the_geom,");
  });

  it("paginates each bounding-box query until Socrata returns a short page", async () => {
    const firstPage = Array.from({ length: CIVIC_ADDRESS_PAGE_SIZE }, (_, index) =>
      civicPoint(String(index), [-60.9 + index / 100_000, 45.5]),
    );
    const finalPoint = civicPoint("last", [-60.5, 45.6]);
    const controller = new AbortController();
    const fetchMock = vi.fn(
      async (input: string | URL | Request, init?: RequestInit) => {
        const url = new URL(String(input));
        expect(init?.signal).toBe(controller.signal);
        return Number(url.searchParams.get("$offset")) === 0
          ? geoJsonResponse(firstPage)
          : geoJsonResponse([finalPoint]);
      },
    );
    vi.stubGlobal("fetch", fetchMock);

    const addresses = await fetchCivicAddresses(
      [
        parcelFeature({
          type: "Polygon",
          coordinates: [
            [
              [-61, 45],
              [-60, 45],
              [-60, 46],
              [-61, 46],
              [-61, 45],
            ],
          ],
        }),
      ],
      controller.signal,
    );

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(
      fetchMock.mock.calls.map(([input]) =>
        new URL(String(input)).searchParams.get("$offset"),
      ),
    ).toEqual(["0", String(CIVIC_ADDRESS_PAGE_SIZE)]);
    expect(addresses).toHaveLength(CIVIC_ADDRESS_PAGE_SIZE + 1);
    expect(addresses.at(-1)?.pntid).toBe("last");
  });

  it("keeps polygon points and rejects bounding-box false positives", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        geoJsonResponse([
          civicPoint("inside", [0.5, 0.5]),
          civicPoint("bbox-only", [1.8, 1.8]),
        ]),
      ),
    );

    const addresses = await fetchCivicAddresses([
      parcelFeature({
        type: "Polygon",
        coordinates: [
          [
            [0, 0],
            [2, 0],
            [0, 2],
            [0, 0],
          ],
        ],
      }),
    ]);

    expect(addresses.map(({ pntid }) => pntid)).toEqual(["inside"]);
  });

  it("excludes points in holes while treating ring boundary points as inside", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        geoJsonResponse([
          civicPoint("parcel-interior", [0.5, 0.5]),
          civicPoint("hole-interior", [2, 2]),
          civicPoint("outer-boundary", [0, 2]),
          civicPoint("hole-boundary", [1, 2]),
        ]),
      ),
    );

    const addresses = await fetchCivicAddresses([
      parcelFeature({
        type: "Polygon",
        coordinates: [
          [
            [0, 0],
            [4, 0],
            [4, 4],
            [0, 4],
            [0, 0],
          ],
          [
            [1, 1],
            [3, 1],
            [3, 3],
            [1, 3],
            [1, 1],
          ],
        ],
      }),
    ]);

    expect(addresses.map(({ pntid }) => pntid)).toEqual([
      "parcel-interior",
      "outer-boundary",
      "hole-boundary",
    ]);
  });

  it("queries every MultiPolygon part and deduplicates matches by pntid", async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const where = new URL(String(input)).searchParams.get("$where");
      return where === "within_box(the_geom,1,0,0,1)"
        ? geoJsonResponse([civicPoint("first", [0.5, 0.5])])
        : geoJsonResponse([
            civicPoint("second", [10.5, 10.5]),
            civicPoint("first", [0.5, 0.5]),
          ]);
    });
    vi.stubGlobal("fetch", fetchMock);

    const addresses = await fetchCivicAddresses([
      parcelFeature({
        type: "MultiPolygon",
        coordinates: [
          [
            [
              [0, 0],
              [1, 0],
              [1, 1],
              [0, 1],
              [0, 0],
            ],
          ],
          [
            [
              [10, 10],
              [11, 10],
              [11, 11],
              [10, 11],
              [10, 10],
            ],
          ],
        ],
      }),
    ]);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(addresses.map(({ pntid }) => pntid)).toEqual(["first", "second"]);
  });

  it("formats all optional components without duplicate locality or placeholder text", () => {
    expect(
      formatCivicAddress(
        completeProperties({
          civicnum: " 12 ",
          civsuffix: " A ",
          unit_num: " 4 ",
          add_loc: "Unknown",
          strprefix: " N ",
          strname: " Main ",
          strsuffix: " St ",
          strdir: " W ",
          comm: " Mabou ",
          mun: "Mabou",
          county: " Inverness County ",
        }),
      ),
    ).toBe("Unit 4, 12A N Main St W, Mabou, Inverness County");

    expect(
      formatCivicAddress(
        completeProperties({
          civicnum: null,
          civsuffix: null,
          unit_num: null,
          add_loc: "Community Hall",
          strprefix: null,
          strname: null,
          strsuffix: null,
          strdir: null,
          comm: null,
          mun: null,
          county: null,
        }),
      ),
    ).toBe("");
  });

  it("surfaces Civic Points service failures", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("", { status: 503 })),
    );

    await expect(
      fetchCivicAddresses([
        parcelFeature({
          type: "Polygon",
          coordinates: [
            [
              [0, 0],
              [1, 0],
              [1, 1],
              [0, 1],
              [0, 0],
            ],
          ],
        }),
      ]),
    ).rejects.toThrow("Civic Points request failed with status 503");
  });
});
