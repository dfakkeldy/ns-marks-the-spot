import { afterEach, describe, expect, it, vi } from "vitest";
import {
  PVSC_ASSESSMENT_DATASET_URL,
  buildPvscAanQueryUrl,
  buildPvscSpatialQueryUrl,
  fetchParcelAssessments,
  normalizeAan,
} from "./pvscAssessments";
import type { NsprdFeatureCollection } from "./nsprd";

const polygonParcel = (
  coordinates: GeoJSON.Position[][],
): NsprdFeatureCollection["features"][number] => ({
  type: "Feature",
  properties: { PID: "12345678" },
  geometry: { type: "Polygon", coordinates },
});

const row = (
  aan: string,
  taxYear: number,
  assessedValue: number,
  taxableAssessedValue: number,
  longitude: number,
  latitude: number,
) => ({
  aan,
  tax_year: String(taxYear),
  assessed_value: String(assessedValue),
  taxable_assessed_value: String(taxableAssessedValue),
  x_coord: String(longitude),
  y_coord: String(latitude),
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("PVSC assessment account queries", () => {
  it("normalizes notice AANs to the eight-digit public account key", () => {
    expect(normalizeAan("578134")).toBe("00578134");
    expect(normalizeAan("0060 3988")).toBe("00603988");
    expect(normalizeAan("006-03988")).toBe("00603988");
    expect(normalizeAan("123456789")).toBeNull();
    expect(normalizeAan("account 123")).toBeNull();
  });

  it("builds a bounded five-year account query without using the PVSC search site", () => {
    const url = new URL(buildPvscAanQueryUrl("578134"));

    expect(`${url.origin}${url.pathname}`).toBe(
      "https://www.thedatazone.ca/resource/bt58-qu28.json",
    );
    expect(url.searchParams.get("$where")).toBe("aan='00578134'");
    expect(url.searchParams.get("$order")).toBe("tax_year DESC");
    expect(url.searchParams.get("$limit")).toBe("10");
    expect(url.toString()).not.toContain("webapi.pvsc.ca");
  });

  it("builds north-west-south-east bounding-box queries for a parcel part", () => {
    const url = new URL(
      buildPvscSpatialQueryUrl(
        { north: 46.08, west: -61.4, south: 46.06, east: -61.38 },
        1_000,
        2_000,
      ),
    );

    expect(url.searchParams.get("$where")).toBe(
      "within_box(location,46.08,-61.4,46.06,-61.38)",
    );
    expect(url.searchParams.get("$limit")).toBe("1000");
    expect(url.searchParams.get("$offset")).toBe("2000");
  });

  it("uses a notice AAN directly and returns its history newest first", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify([
          row("00603988", 2025, 40_000, 40_000, -61.391318, 46.071925),
          row("00603988", 2026, 41_000, 39_500, -61.391318, 46.071925),
        ]),
        { status: 200 },
      ),
    );

    const result = await fetchParcelAssessments([], "00603988");

    expect(result.matchMethod).toBe("notice-aan");
    expect(result.accounts).toEqual([
      {
        aan: "00603988",
        records: [
          {
            taxYear: 2026,
            assessedValue: 41_000,
            taxableAssessedValue: 39_500,
            coordinates: [-61.391318, 46.071925],
          },
          {
            taxYear: 2025,
            assessedValue: 40_000,
            taxableAssessedValue: 40_000,
            coordinates: [-61.391318, 46.071925],
          },
        ],
      },
    ]);
  });

  it("spatially associates account points with multipart parcel geometry and excludes holes", async () => {
    const parcels: NsprdFeatureCollection["features"] = [
      polygonParcel([
        [[0, 0], [4, 0], [4, 4], [0, 4], [0, 0]],
        [[1, 1], [3, 1], [3, 3], [1, 3], [1, 1]],
      ]),
      {
        type: "Feature",
        properties: { PID: "12345678" },
        geometry: {
          type: "MultiPolygon",
          coordinates: [
            [[[10, 10], [12, 10], [12, 12], [10, 12], [10, 10]]],
          ],
        },
      },
    ];
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify([
        row("00000001", 2026, 100_000, 90_000, 0.5, 0.5),
        row("00000001", 2025, 95_000, 85_000, 0.5, 0.5),
        row("00000002", 2026, 200_000, 180_000, 2, 2),
        row("00000003", 2026, 300_000, 280_000, 0, 2),
        row("00000004", 2026, 400_000, 380_000, 5, 5),
      ]), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify([
        row("00000005", 2026, 500_000, 480_000, 11, 11),
      ]), { status: 200 }));

    const result = await fetchParcelAssessments(parcels);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.matchMethod).toBe("spatial");
    expect(result.accounts.map(({ aan }) => aan)).toEqual([
      "00000001",
      "00000003",
      "00000005",
    ]);
    expect(result.accounts[0].records.map(({ taxYear }) => taxYear)).toEqual([
      2026,
      2025,
    ]);
  });

  it("keeps returned-empty and source failure distinguishable", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify([]), { status: 200 }),
    );
    await expect(fetchParcelAssessments([], "00603988")).resolves.toEqual({
      matchMethod: "notice-aan",
      accounts: [],
    });

    fetchMock.mockResolvedValueOnce(
      new Response("unavailable", { status: 503 }),
    );
    await expect(fetchParcelAssessments([], "00603988")).rejects.toThrow(
      "PVSC assessment request failed with status 503",
    );
  });

  it("exports the open-data source rather than the restricted search site", () => {
    expect(PVSC_ASSESSMENT_DATASET_URL).toBe(
      "https://www.thedatazone.ca/Assessment/Assessed-Value-and-Taxable-Assessed-Value-History/bt58-qu28",
    );
  });
});
