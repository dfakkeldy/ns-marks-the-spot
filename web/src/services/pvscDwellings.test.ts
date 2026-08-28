import { afterEach, describe, expect, it, vi } from "vitest";
import {
  PVSC_DWELLING_DATASET_URL,
  buildDwellingQueryUrl,
  fetchDwellingCharacteristics,
} from "./pvscDwellings";

const row = (overrides: Record<string, unknown> = {}) => ({
  aan: "04165829",
  year_built: "2018",
  style: "Manufactured Home",
  square_foot_living_area: "1056",
  living_units: "1",
  bathrooms: "2",
  garage: "N",
  under_construction: "N",
  ...overrides,
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("PVSC dwelling characteristic queries", () => {
  it("builds a bounded multi-account query against the open dataset", () => {
    const url = new URL(buildDwellingQueryUrl(["4165829", "00603988"]));

    expect(`${url.origin}${url.pathname}`).toBe(
      "https://www.thedatazone.ca/resource/a859-xvcs.json",
    );
    expect(url.searchParams.get("$where")).toBe(
      "aan in('04165829','00603988')",
    );
    expect(url.searchParams.get("$order")).toBe("aan,year_built DESC");
    expect(url.searchParams.get("$limit")).toBe("100");
    expect(url.searchParams.get("$offset")).toBe("0");
    expect(url.toString()).not.toContain("webapi.pvsc.ca");
  });

  it("rejects queries without a single valid account", () => {
    expect(() => buildDwellingQueryUrl([])).toThrow();
    expect(() => buildDwellingQueryUrl(["account 123"])).toThrow();
  });

  it("groups dwelling records by account, newest built first", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify([
          row({ year_built: "1962", style: "1 Storey", square_foot_living_area: "480", bathrooms: "0" }),
          row(),
          row({ aan: "00999999", year_built: "1990", style: "Bungalow" }),
        ]),
        { status: 200 },
      ),
    );

    const accounts = await fetchDwellingCharacteristics([
      "04165829",
      "00999999",
    ]);

    expect(accounts.map(({ aan }) => aan)).toEqual(["00999999", "04165829"]);
    const [, second] = accounts;
    expect(second.dwellings.map(({ yearBuilt }) => yearBuilt)).toEqual([
      2018, 1962,
    ]);
    expect(second.dwellings[0]).toEqual({
      yearBuilt: 2018,
      style: "Manufactured Home",
      squareFeetLivingArea: 1056,
      livingUnits: 1,
      bathrooms: 2,
      garage: false,
      underConstruction: false,
    });
  });

  it("pages past a full first page instead of rendering the cut as absence", async () => {
    // 100 rows exactly fill a page; an account sorted after them must still
    // surface rather than reading as "no dwelling record returned".
    const fullPage = Array.from({ length: 100 }, (_, index) =>
      row({ aan: String(10_000_000 + index) }),
    );
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(JSON.stringify(fullPage), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify([row({ aan: "99999999", year_built: "1970" })]),
          { status: 200 },
        ),
      );

    const accounts = await fetchDwellingCharacteristics(["4165829"]);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(
      new URL(fetchMock.mock.calls[0][0] as string).searchParams.get("$offset"),
    ).toBe("0");
    expect(
      new URL(fetchMock.mock.calls[1][0] as string).searchParams.get("$offset"),
    ).toBe("100");
    expect(accounts).toHaveLength(101);
    expect(accounts.map(({ aan }) => aan)).toContain("99999999");
  });

  it("keeps accounts with no rows out and tolerates partial rows", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify([
          row({
            year_built: undefined,
            style: undefined,
            square_foot_living_area: "not-a-number",
            living_units: undefined,
            bathrooms: undefined,
            garage: "Y",
            under_construction: undefined,
          }),
          { nonsense: true },
        ]),
        { status: 200 },
      ),
    );

    const accounts = await fetchDwellingCharacteristics(["04165829"]);

    expect(accounts).toEqual([
      {
        aan: "04165829",
        dwellings: [
          {
            yearBuilt: null,
            style: null,
            squareFeetLivingArea: null,
            livingUnits: null,
            bathrooms: null,
            garage: true,
            underConstruction: null,
          },
        ],
      },
    ]);
  });

  it("returns an empty list without a request when no accounts are given", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    await expect(fetchDwellingCharacteristics([])).resolves.toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("surfaces HTTP and shape failures as errors", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response("[]", { status: 503 }),
    );
    await expect(fetchDwellingCharacteristics(["04165829"])).rejects.toThrow(
      /status 503/,
    );

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ error: true }), { status: 200 }),
    );
    await expect(fetchDwellingCharacteristics(["04165829"])).rejects.toThrow(
      /unexpected response/,
    );
  });

  it("exposes the public dataset page for provenance links", () => {
    expect(PVSC_DWELLING_DATASET_URL).toContain("thedatazone.ca");
  });
});
