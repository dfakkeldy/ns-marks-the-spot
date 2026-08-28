import { describe, expect, it } from "vitest";
import {
  classifyOutcome,
  containsResultsTable,
  moneyToCents,
  parseResults,
} from "./cumberland.mjs";

const FIXTURE = `
<div><table>
<tr><td></td><td></td><td></td><td>MARCH 3, 2026 TAX SALE RESULTS</td><td></td><td></td><td></td></tr>
<tr><td>AAN</td><td>PID</td><td>NAME</td><td>DESCRIPTION</td><td>REDEMPTION EXPIRY</td><td>MIN BID</td><td>WINNING BID</td></tr>
<tr><td>7463308</td><td>25369646</td><td>DALE ALLAN CHAPMAN</td><td>4115 HIGHWAY 366 LOT 98-1 TIDNISH CROSS ROADS BUILDING GARAGE</td><td>6 MONTH</td><td>$2,728.33</td><td>$36,000.00</td></tr>
<tr><td>3849805</td><td>25147562</td><td>FLORENCE L PYE EST</td><td>9613 HIGHWAY 6 PUGWASH LAND</td><td>IMMEDIATE</td><td>$17,377.89</td><td>ADJORNED</td></tr>
</table></div>`;

describe("moneyToCents", () => {
  it("parses printed dollar amounts to integer cents", () => {
    expect(moneyToCents("$36,000.00")).toBe(3_600_000);
    expect(moneyToCents("$2,728.33")).toBe(272_833);
    expect(moneyToCents("$684.32")).toBe(68_432);
    expect(moneyToCents("$1,300")).toBe(130_000);
  });

  it("returns null for non-money cells", () => {
    expect(moneyToCents("ADJORNED")).toBeNull();
    expect(moneyToCents("")).toBeNull();
  });
});

describe("classifyOutcome", () => {
  it("maps a printed bid to a sold outcome", () => {
    expect(classifyOutcome("$36,000.00")).toEqual({
      outcome: "sold",
      winningBidCents: 3_600_000,
    });
  });

  it("maps the municipality's ADJORNED spelling to withdrawn with no bid", () => {
    const result = classifyOutcome("ADJORNED");
    expect(result.outcome).toBe("withdrawn");
    expect(result.winningBidCents).toBeNull();
    expect(result.resultNote).toMatch(/ADJORNED/u);
  });

  it("keeps NOT COMPLETED fail-closed as outcome unknown", () => {
    const result = classifyOutcome("NOT COMPLETED");
    expect(result.outcome).toBe("unknown");
    expect(result.winningBidCents).toBeNull();
    expect(result.resultNote).toMatch(/NOT COMPLETED/u);
  });

  it("refuses to guess at an unfamiliar status word", () => {
    expect(() => classifyOutcome("POSTPONED")).toThrow(
      /Unrecognized winning-bid value "POSTPONED"/u,
    );
  });
});

describe("parseResults", () => {
  it("reads the sale date, identifier label, and owner-free rows", () => {
    const parsed = parseResults(FIXTURE);
    expect(parsed.saleDate).toBe("2026-03-03");
    expect(parsed.listingIdentifierLabel).toBe("AAN");
    expect(parsed.rows).toHaveLength(2);
    expect(parsed.rows[0]).toEqual({
      listingIdentifier: "7463308",
      pid: "25369646",
      description:
        "4115 HIGHWAY 366 LOT 98-1 TIDNISH CROSS ROADS BUILDING GARAGE",
      redemptionLabel: "Redemption expiry - 6 month",
      advertisedAmountCents: 272_833,
      winningRaw: "$36,000.00",
    });
    expect(parsed.rows[1].redemptionLabel).toBe("Redemption expiry - Immediate");
  });

  it("discards the owner NAME column entirely", () => {
    expect(JSON.stringify(parseResults(FIXTURE)).toUpperCase()).not.toContain(
      "CHAPMAN",
    );
  });

  it("reads the October heading and ASSESSMENT identifier label", () => {
    const october = FIXTURE.replace(
      "MARCH 3, 2026 TAX SALE RESULTS",
      "OCTOBER 21, 2025 TAX SALE RESULTS",
    ).replace("<td>AAN</td>", "<td>ASSESSMENT</td>");
    const parsed = parseResults(october);
    expect(parsed.saleDate).toBe("2025-10-21");
    expect(parsed.listingIdentifierLabel).toBe("Assessment");
  });

  it("fails closed on a malformed PID", () => {
    expect(() => parseResults(FIXTURE.replace("25369646", "2536"))).toThrow(
      /invalid PID "2536"/u,
    );
  });

  it("fails closed when the sale heading is missing", () => {
    expect(() =>
      parseResults(FIXTURE.replace("MARCH 3, 2026 TAX SALE RESULTS", "RESULTS")),
    ).toThrow(/Could not find a dated tax-sale results heading/u);
  });

  it("fails closed when the page has no table", () => {
    expect(() => parseResults("<div>no results yet</div>")).toThrow(
      /Expected exactly one results table, found 0/u,
    );
  });

  it("fails closed on a non-positive minimum bid", () => {
    expect(() => parseResults(FIXTURE.replace("$2,728.33", "$0.00"))).toThrow(
      /non-positive minimum bid/u,
    );
  });
});

describe("containsResultsTable", () => {
  it("accepts a captured page carrying the table", () => {
    expect(containsResultsTable(FIXTURE)).toBe(true);
  });

  it("rejects a bot-verification interstitial", () => {
    expect(
      containsResultsTable(
        "<html><body>One moment, please... your request is being verified</body></html>",
      ),
    ).toBe(false);
  });
});
