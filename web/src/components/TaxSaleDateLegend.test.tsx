import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { TaxSaleEvent } from "../data/taxSaleCatalog";
import { TaxSaleDateLegend } from "./TaxSaleDateLegend";

function event(id: string, saleStartsAt?: string): TaxSaleEvent {
  return {
    id,
    municipalityId: id,
    municipality: id,
    shortMunicipality: id,
    eventType: "public-auction",
    eventStatus: "upcoming",
    saleStartsAt,
    sourceUrl: "https://example.invalid/notice",
    sourceLabel: "Notice",
    retrievedOn: "2026-11-01",
    listings: [],
  };
}

describe("TaxSaleDateLegend", () => {
  it("names every band, counts sales, and says the bands are relative to today", () => {
    render(
      <TaxSaleDateLegend
        now={Date.parse("2026-11-06T12:00:00-04:00")}
        events={[
          event("a", "2026-11-23T11:00:00-04:00"),
          event("b", "2026-08-11T09:30:00-03:00"),
          event("c", "2026-08-31T13:00:00-03:00"),
          event("d"),
        ]}
      />,
    );
    const legend = screen.getByRole("figure", { name: "Dot colour by sale date" });
    const rows = [...legend.querySelectorAll("li")].map((row) => [
      row.dataset.band,
      row.textContent,
    ]);
    expect(rows).toEqual([
      ["within-7-days", "Within 7 days0 sales"],
      ["within-30-days", "Within 30 days1 sale"],
      ["later", "Later0 sales"],
      ["sale-date-passed", "Sale date passed — verify results2 sales"],
      ["date-not-stated", "Date not stated1 sale"],
    ]);
    expect(legend.textContent).toContain("relative to today’s date in Atlantic time");
  });
});
