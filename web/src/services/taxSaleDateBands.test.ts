import { describe, expect, it } from "vitest";
import type { TaxSaleEvent, TaxSaleListing } from "../data/taxSaleCatalog";
import { taxSaleEvents } from "../data/taxSaleCatalog";
import {
  TAX_SALE_DATE_BAND_ORDER,
  TAX_SALE_DATE_BAND_STYLE,
  taxSaleDateBand,
  taxSaleDateBandsByPid,
  taxSaleEventsByUrgency,
} from "./taxSaleDateBands";

function listing(pids: string[], overrides: Partial<TaxSaleListing> = {}): TaxSaleListing {
  return {
    eventId: "e",
    recordId: pids.join("-"),
    pids,
    location: "Somewhere",
    financial: { kind: "minimum-bid", label: "Minimum bid", amountCents: 100 },
    redemptionCategory: "six-month",
    redemptionLabel: "Six months",
    listingStatus: "advertised",
    ...overrides,
  };
}

function event(saleStartsAt: string | undefined, overrides: Partial<TaxSaleEvent> = {}): TaxSaleEvent {
  return {
    id: `event-${saleStartsAt ?? "none"}`,
    municipalityId: "m",
    municipality: "Municipality",
    shortMunicipality: "M",
    eventType: "public-auction",
    eventStatus: "upcoming",
    saleStartsAt,
    sourceUrl: "https://example.invalid/notice",
    sourceLabel: "Notice",
    retrievedOn: "2026-11-01",
    listings: [],
    ...overrides,
  };
}

const at = (iso: string) => Date.parse(iso);

describe("taxSaleDateBand", () => {
  it("keeps a missing or unparseable date distinct from a passed sale", () => {
    expect(taxSaleDateBand(event(undefined), at("2026-11-06T12:00:00-04:00"))).toBe("date-not-stated");
    expect(taxSaleDateBand(event(""), at("2026-11-06T12:00:00-04:00"))).toBe("date-not-stated");
    expect(taxSaleDateBand(event("sometime in November"), at("2026-11-06T12:00:00-04:00"))).toBe("date-not-stated");
  });

  it("flips to passed at the recorded sale minute, matching the panel label", () => {
    const sale = event("2026-11-23T11:00:00-04:00");
    expect(taxSaleDateBand(sale, at("2026-11-23T10:59:00-04:00"))).toBe("within-7-days");
    expect(taxSaleDateBand(sale, at("2026-11-23T11:00:00-04:00"))).toBe("sale-date-passed");
    expect(taxSaleDateBand(sale, at("2026-11-23T11:01:00-04:00"))).toBe("sale-date-passed");
  });

  it("treats a historical notice as passed whatever its date", () => {
    expect(
      taxSaleDateBand(
        event("2027-01-01T10:00:00-04:00", { eventStatus: "historical" }),
        at("2026-11-06T12:00:00-04:00"),
      ),
    ).toBe("sale-date-passed");
  });

  it("counts calendar days in Atlantic time, not UTC", () => {
    const sale = event("2026-11-23T11:00:00-04:00");
    // 03:30 UTC on Nov 16 is still Nov 15 in Halifax: 8 Atlantic days away.
    expect(taxSaleDateBand(sale, at("2026-11-16T03:30:00Z"))).toBe("within-30-days");
    // 04:30 UTC on Nov 16 is Nov 16 in Halifax: 7 days away.
    expect(taxSaleDateBand(sale, at("2026-11-16T04:30:00Z"))).toBe("within-7-days");
  });

  it("is not thrown off by the spring DST change", () => {
    // Clocks go forward 2027-03-14 in Halifax; the sale is 7 calendar days on.
    const sale = event("2027-03-17T00:30:00-03:00");
    expect(taxSaleDateBand(sale, at("2027-03-10T23:45:00-04:00"))).toBe("within-7-days");
    expect(taxSaleDateBand(sale, at("2027-03-09T23:45:00-04:00"))).toBe("within-30-days");
  });

  it("bands 30 and 31 days out", () => {
    const now = at("2026-11-06T12:00:00-04:00");
    expect(taxSaleDateBand(event("2026-12-06T10:00:00-04:00"), now)).toBe("within-30-days");
    expect(taxSaleDateBand(event("2026-12-07T10:00:00-04:00"), now)).toBe("later");
  });

  it("bands the shipped notices from their recorded dates", () => {
    const now = at("2026-11-06T12:00:00-04:00");
    const byId = new Map(taxSaleEvents.map((entry) => [entry.id, taxSaleDateBand(entry, now)]));
    for (const entry of taxSaleEvents) {
      if (entry.eventStatus === "historical") {
        expect(byId.get(entry.id)).toBe("sale-date-passed");
      }
    }
    const victoria = taxSaleEvents.find(({ municipalityId }) => municipalityId.includes("victoria"));
    expect(victoria && byId.get(victoria.id)).toBe("within-30-days");
  });
});

describe("taxSaleDateBandsByPid", () => {
  const now = at("2026-11-06T12:00:00-04:00");

  it("maps only advertised listings that pass the filter", () => {
    const sale = event("2026-11-10T10:00:00-04:00", {
      listings: [
        listing(["111"]),
        listing(["222"], { listingStatus: "withdrawn" }),
        listing(["333"], { redemptionCategory: "immediate-deed" }),
      ],
    });
    const bands = taxSaleDateBandsByPid(
      [sale],
      now,
      ({ redemptionCategory }) => redemptionCategory === "six-month",
    );
    expect([...bands]).toEqual([["111", "within-7-days"]]);
  });

  it("gives a PID in two notices the soonest recorded band", () => {
    const passed = event("2026-08-11T09:30:00-03:00", { listings: [listing(["444"])] });
    const later = event("2027-02-01T10:00:00-04:00", { listings: [listing(["444"])] });
    const unknown = event(undefined, { listings: [listing(["444", "555"])] });
    const bands = taxSaleDateBandsByPid([unknown, passed, later], now);
    expect(bands.get("444")).toBe("later");
    expect(bands.get("555")).toBe("date-not-stated");
  });
});

describe("band styles", () => {
  it("styles every band, and only the unknown date is dashed", () => {
    for (const band of TAX_SALE_DATE_BAND_ORDER) {
      expect(TAX_SALE_DATE_BAND_STYLE[band].dashed).toBe(band === "date-not-stated");
    }
    const fills = TAX_SALE_DATE_BAND_ORDER.map((band) => TAX_SALE_DATE_BAND_STYLE[band].fill);
    expect(new Set(fills).size).toBe(fills.length);
  });
});

describe("taxSaleEventsByUrgency", () => {
  it("puts the nearest upcoming sale first and parks past dates, newest first", () => {
    const now = Date.parse("2026-11-08T12:00:00-04:00");
    const past = event("2026-08-11T10:00:00-03:00");
    const recentPast = event("2026-08-31T10:00:00-03:00");
    const near = event("2026-11-23T10:00:00-04:00");
    const far = event("2027-02-01T10:00:00-04:00");
    const undated = event(undefined);
    const { upcoming, past: parked } = taxSaleEventsByUrgency([past, far, undated, recentPast, near], now);
    expect(upcoming).toEqual([near, far, undated]);
    expect(parked).toEqual([recentPast, past]);
  });
});
