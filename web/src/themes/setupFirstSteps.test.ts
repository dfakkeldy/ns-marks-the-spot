import { describe, expect, it } from "vitest";
import type { TaxSaleEvent } from "../data/taxSaleCatalog";
import { fletcherSheets } from "../layers/fletcherLayer";
import { geometryBounds, nearestSheet, nextDatedTaxSale, shortSaleDate } from "./setupFirstSteps";

const event = (id: string, saleStartsAt: string | undefined, status = "upcoming") => ({
  id,
  saleStartsAt,
  status,
  shortMunicipality: id,
  listings: [],
}) as unknown as TaxSaleEvent;

const now = Date.parse("2026-11-08T12:00:00-04:00");

describe("a setup's first step", () => {
  it("names the soonest recorded future sale", () => {
    const next = nextDatedTaxSale([
      event("late", "2027-02-01T10:00:00-04:00"),
      event("soon", "2026-11-23T10:00:00-04:00"),
    ], now);
    expect(next?.id).toBe("soon");
    expect(shortSaleDate("2026-11-23T10:00:00-04:00")).toBe("Nov 23");
  });

  it("never invents a next sale from passed or undated notices", () => {
    expect(nextDatedTaxSale([
      event("passed", "2026-10-01T10:00:00-03:00"),
      event("undated", undefined),
    ], now)).toBeNull();
    expect(nextDatedTaxSale([], now)).toBeNull();
  });

  it("finds the published sheet nearest the view", () => {
    const sheet = nearestSheet(fletcherSheets, { latitude: 47.05, longitude: -60.55 });
    expect(sheet?.sheet).toBe(1);
  });

  it("boxes real geometry and reports none when there is none", () => {
    expect(geometryBounds([
      { type: "Point", coordinates: [-61, 46] },
      { type: "Polygon", coordinates: [[[-60, 45], [-60.5, 45.5], [-60, 45.5], [-60, 45]]] },
    ])).toEqual([[45, -61], [46, -60]]);
    expect(geometryBounds([null, undefined])).toBeNull();
  });
});
