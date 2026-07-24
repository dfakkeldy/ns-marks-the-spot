import { describe, expect, it } from "vitest";
import historicalMatchExceptions from "./historicalMatchExceptions.json";
import historicalSourceLedger from "./historicalSourceLedger.json";
import {
  calculateFinancialComparison,
  historicalContextsForPid,
  historicalOutcomeLabel,
  historicalTaxSaleEvents,
  historicalTaxSaleRecords,
  matchedHistoricalPids,
  validateHistoricalTaxSaleDataset,
  type HistoricalTaxSaleEvent,
  type HistoricalTaxSaleRecord,
} from "./historicalTaxSales";

// Verified receipts must come from a municipality that published them or from an
// archive replaying that municipality, never from an arbitrary host.
const verifiedResultHost =
  /^https:\/\/(?:(?:cdn\.)?halifax\.ca|victoriacounty\.com|cbrm\.ns\.ca|web\.archive\.org)\//u;

describe("historical tax-sale records", () => {
  it("preserves verified Halifax, Victoria County, CBRM, and Cumberland results alongside the outcome-pending CBRM event", () => {
    expect(historicalTaxSaleEvents).toHaveLength(14);
    expect(historicalTaxSaleRecords).toHaveLength(280);
    expect(matchedHistoricalPids()).toHaveLength(278);
    expect(
      historicalTaxSaleRecords.filter(({ outcome }) => outcome === "sold"),
    ).toHaveLength(165);
    expect(
      historicalTaxSaleRecords.filter(({ outcome }) => outcome === "unsold"),
    ).toHaveLength(7);
    expect(
      historicalTaxSaleRecords.filter(({ outcome }) => outcome === "withdrawn"),
    ).toHaveLength(7);
    expect(
      historicalTaxSaleRecords.filter(({ outcome }) => outcome === "redeemed"),
    ).toHaveLength(1);
    expect(
      historicalTaxSaleRecords.filter(({ outcome }) => outcome === "unknown"),
    ).toHaveLength(100);
    expect(
      historicalTaxSaleEvents.map(({ id }) => {
        const records = historicalTaxSaleRecords.filter(
          ({ eventId }) => eventId === id,
        );
        return {
          id,
          records: records.length,
          pids: records.flatMap(({ pids }) => pids).length,
        };
      }),
    ).toEqual([
      { id: "hrm-2022-03-08", records: 11, pids: 11 },
      { id: "hrm-2023-09-12", records: 10, pids: 10 },
      { id: "hrm-2024-01-16", records: 8, pids: 9 },
      { id: "hrm-2024-05-14", records: 7, pids: 8 },
      { id: "hrm-2024-09-24", records: 9, pids: 10 },
      { id: "hrm-2025-03-25", records: 5, pids: 7 },
      { id: "hrm-2025-09-16", records: 37, pids: 38 },
      { id: "victoria-2025-08-26", records: 12, pids: 13 },
      { id: "victoria-2025-11-25", records: 2, pids: 2 },
      { id: "victoria-2026-03-24", records: 5, pids: 5 },
      { id: "cbrm-2025-07-22", records: 73, pids: 75 },
      { id: "cumberland-2025-10-21", records: 20, pids: 20 },
      { id: "cumberland-2026-03-03", records: 14, pids: 14 },
      { id: "cbrm-2026-07-21", records: 67, pids: 68 },
    ]);

    const publicDataset = JSON.stringify({
      events: historicalTaxSaleEvents,
      records: historicalTaxSaleRecords,
    }).toLocaleLowerCase();
    expect(publicDataset).not.toMatch(/owner name|owners|bidder name/u);
    expect(Object.keys(historicalTaxSaleRecords[0])).not.toEqual(
      expect.arrayContaining(["owner", "ownerName", "bidder", "bidderName"]),
    );
  });

  it("keeps every CBRM parcel outcome unknown until an official result is linked", () => {
    const cbrm = historicalTaxSaleEvents.find(
      ({ id }) => id === "cbrm-2026-07-21",
    );
    const records = historicalTaxSaleRecords.filter(
      ({ eventId }) => eventId === cbrm?.id,
    );

    expect(cbrm).toMatchObject({
      resultStatus: "awaiting-official-results",
      resultCheckedOn: "2026-07-21",
    });
    expect(cbrm?.resultUrl).toBeUndefined();
    expect(records).toHaveLength(67);
    expect(records.every(({ outcome }) => outcome === "unknown")).toBe(true);
    expect(records.every(({ winningBidCents }) => winningBidCents === null)).toBe(true);
    expect(records.every(({ reviewState }) => reviewState === "notice-verified")).toBe(
      true,
    );
  });

  it("keeps blank-status Victoria County rows outcome-unknown", () => {
    const august = historicalTaxSaleRecords.filter(
      ({ eventId }) => eventId === "victoria-2025-08-26",
    );
    const blankStatusRows = august.filter(({ outcome }) => outcome === "unknown");

    expect(august).toHaveLength(12);
    expect(blankStatusRows).toHaveLength(9);
    expect(
      blankStatusRows.every(({ winningBidCents }) => winningBidCents === null),
    ).toBe(true);
    expect(
      blankStatusRows.every(({ resultNote }) =>
        resultNote?.includes("no status or successful bid published"),
      ),
    ).toBe(true);

    const twoPidListing = august.find(
      ({ recordId }) => recordId === "victoria-2025-08-26-aan-00453706",
    );
    expect(twoPidListing).toMatchObject({
      pids: ["85010866", "85074276"],
      advertisedAmountCents: 159_971,
      winningBidCents: 1_210_100,
    });
    expect(historicalContextsForPid("85074276")[0]?.record).toBe(twoPidListing);
  });

  it("keeps the contradictory March 2026 REMOVED-with-bid row fail-closed", () => {
    const contexts = historicalContextsForPid("85142388");

    expect(contexts).toHaveLength(2);
    expect(contexts[0].record).toMatchObject({
      eventId: "victoria-2025-08-26",
      outcome: "unsold",
      winningBidCents: null,
    });
    expect(contexts[1].record).toMatchObject({
      eventId: "victoria-2026-03-24",
      outcome: "withdrawn",
      winningBidCents: null,
      resultNote:
        "Official result: REMOVED, printed beside a successful bid of $17,500.00. The contradiction is preserved as published and no completed sale is inferred.",
    });
    expect(
      calculateFinancialComparison(contexts[1].event, contexts[1].record),
    ).toBeNull();
  });

  it("maps CBRM July 2025 dispositions fail-closed onto the outcome vocabulary", () => {
    const event = historicalTaxSaleEvents.find(
      ({ id }) => id === "cbrm-2025-07-22",
    );
    const records = historicalTaxSaleRecords.filter(
      ({ eventId }) => eventId === "cbrm-2025-07-22",
    );

    expect(event).toMatchObject({
      saleMethod: "public-auction",
      resultStatus: "verified",
      resultSha256:
        "b6a549fc8c0c49482246946b24eb4f8182694c23bf8e9342565bba8263da44f3",
    });
    expect(records).toHaveLength(73);
    expect(records.filter(({ outcome }) => outcome === "sold")).toHaveLength(50);

    // PAID AT SALE and WALKED AWAY are published dispositions, but neither says
    // whether the parcel changed hands, so neither may claim a completed sale.
    const paidAtSale = records.filter(({ resultNote }) =>
      resultNote?.includes("PAID AT SALE"),
    );
    const walkedAway = records.filter(({ resultNote }) =>
      resultNote?.includes("WALKED AWAY"),
    );
    expect(paidAtSale).toHaveLength(5);
    expect(walkedAway).toHaveLength(4);
    expect(
      [...paidAtSale, ...walkedAway].every(
        ({ outcome, winningBidCents }) =>
          outcome === "unknown" && winningBidCents === null,
      ),
    ).toBe(true);

    const redeemed = records.filter(({ outcome }) => outcome === "redeemed");
    expect(redeemed).toHaveLength(1);
    expect(redeemed[0]).toMatchObject({
      listingIdentifier: "25-143",
      winningBidCents: null,
      resultNote: "Official result: REDEEMED.",
    });

    const twoPid = records.find(
      ({ recordId }) => recordId === "cbrm-2025-07-22-lien-25-177",
    );
    expect(twoPid).toMatchObject({
      pids: ["15406051", "15704067"],
      advertisedAmountCents: 60_000,
      winningBidCents: 1_600_000,
      outcome: "sold",
    });
    expect(historicalContextsForPid("15704067")[0]?.record).toBe(twoPid);
  });

  it("keeps the two-PID East Dover amount at listing level", () => {
    const listing = historicalTaxSaleRecords.find(
      ({ recordId }) => recordId === "hrm-2025-09-16-aan-00924547",
    );

    expect(listing).toMatchObject({
      pids: ["40657074", "40657165"],
      advertisedAmountCents: 245_294,
      winningBidCents: 1_392_600,
    });
    expect(historicalContextsForPid("40657074")[0]?.record).toBe(listing);
    expect(historicalContextsForPid("40657165")[0]?.record).toBe(listing);
  });

  it("keeps the published September 2024 pending result fail-closed", () => {
    const pending = historicalContextsForPid("40441354")[0];

    expect(pending.record).toMatchObject({
      eventId: "hrm-2024-09-24",
      outcome: "unknown",
      winningBidCents: null,
      resultNote: "Official result: PENDING - Property is still being offered.",
    });
    expect(calculateFinancialComparison(pending.event, pending.record)).toBeNull();
  });

  it("retains duplicate PIDs across different events as separate records", () => {
    const event = historicalTaxSaleEvents[0];
    const record = historicalTaxSaleRecords[0];
    const laterEvent = { ...event, id: "later-event" };
    const laterRecord = {
      ...record,
      eventId: laterEvent.id,
      recordId: "later-event-record",
    };

    expect(() =>
      validateHistoricalTaxSaleDataset({
        schemaVersion: 1,
        events: [event, laterEvent],
        records: [record, laterRecord],
      }),
    ).not.toThrow();
  });

  it("rejects ambiguous or malformed records from the matched dataset", () => {
    const event = historicalTaxSaleEvents[0];
    const record = historicalTaxSaleRecords[0];
    const invalidRecord = {
      ...record,
      recordId: "bad-pid",
      pids: ["123"],
    };

    expect(() =>
      validateHistoricalTaxSaleDataset({
        schemaVersion: 1,
        events: [event],
        records: [invalidRecord],
      }),
    ).toThrow("invalid PID");
    expect(
      matchedHistoricalPids([
        {
          ...record,
          nspMatchStatus: "ambiguous",
          nspMatchMethod: "none",
        },
      ]),
    ).toEqual([]);
    expect(historicalMatchExceptions.exceptions).toEqual([
      expect.objectContaining({
        eventId: "cbrm-2025-07-22",
        listingIdentifier: "25-178",
        pid: "15440050",
        reason: "unmatched",
      }),
    ]);
    expect(matchedHistoricalPids()).not.toContain("15440050");
    expect(historicalContextsForPid("15440050")).toEqual([]);
  });

  it("calculates integer-cent comparisons only for published winning bids", () => {
    const sold = historicalContextsForPid("00542589")[0];
    const unsold = historicalContextsForPid("40538464")[0];

    expect(calculateFinancialComparison(sold.event, sold.record)).toEqual({
      differenceCents: 1_060_095,
      percentageAbove: 558.22,
      winningBidMultiple: 6.58,
    });
    expect(calculateFinancialComparison(unsold.event, unsold.record)).toBeNull();

    expect(
      calculateFinancialComparison(
        { ...sold.event, currency: "USD" } as unknown as HistoricalTaxSaleEvent,
        sold.record,
      ),
    ).toBeNull();

    const unknownRecord: HistoricalTaxSaleRecord = {
      ...sold.record,
      recordId: "unknown-winning-bid",
      outcome: "unknown",
      winningBidCents: null,
    };
    expect(calculateFinancialComparison(sold.event, unknownRecord)).toBeNull();
  });

  it("rejects sold-without-bid and unsold-with-bid contradictions", () => {
    const event: HistoricalTaxSaleEvent = historicalTaxSaleEvents[0];
    const sold = historicalTaxSaleRecords.find(({ outcome }) => outcome === "sold")!;
    const unsold = historicalTaxSaleRecords.find(
      ({ outcome }) => outcome === "unsold",
    )!;

    expect(() =>
      validateHistoricalTaxSaleDataset({
        schemaVersion: 1,
        events: [event],
        records: [{ ...sold, winningBidCents: null }],
      }),
    ).toThrow("requires a winning bid");
    expect(() =>
      validateHistoricalTaxSaleDataset({
        schemaVersion: 1,
        events: [event],
        records: [{ ...unsold, winningBidCents: 1 }],
      }),
    ).toThrow("cannot have a winning bid");
  });

  it("labels the complete fail-closed outcome vocabulary", () => {
    expect(historicalOutcomeLabel("sold")).toBe("Sold");
    expect(historicalOutcomeLabel("unsold")).toBe("Unsold - no bids");
    expect(historicalOutcomeLabel("withdrawn")).toBe("Withdrawn");
    expect(historicalOutcomeLabel("cancelled")).toBe("Cancelled");
    expect(historicalOutcomeLabel("redeemed")).toBe("Redeemed");
    expect(historicalOutcomeLabel("unknown")).toBe("Outcome unknown");
  });

  it("pins official receipts without requiring a result before publication", () => {
    for (const event of historicalTaxSaleEvents) {
      expect(event.noticeUrl).toMatch(/^https:\/\//u);
      expect(event.noticeSha256).toMatch(/^[a-f0-9]{64}$/u);
      if (event.resultStatus === "verified") {
        expect(event.resultUrl).toMatch(verifiedResultHost);
        expect(event.resultSha256).toMatch(/^[a-f0-9]{64}$/u);
      } else {
        expect(event.resultUrl).toBeUndefined();
        expect(event.landingPageUrl).toMatch(/^https:\/\/cbrm\.ns\.ca\//u);
      }
    }
    expect(historicalSourceLedger.coverage).toHaveLength(16);
  });

  it("pins Cumberland to archive captures because its result page is overwritten", () => {
    const events = historicalTaxSaleEvents.filter(
      ({ municipalityId }) => municipalityId === "cumberland",
    );
    expect(events.map(({ id }) => id)).toEqual([
      "cumberland-2025-10-21",
      "cumberland-2026-03-03",
    ]);

    for (const event of events) {
      // Cumberland republishes one page per sale and overwrites the previous
      // results, so an immutable archive capture is the only durable receipt and
      // stands in for both the notice and the result.
      expect(event.noticeUrl).toBe(event.resultUrl);
      expect(event.noticeSha256).toBe(event.resultSha256);
      expect(event.resultUrl).toMatch(
        /^https:\/\/web\.archive\.org\/web\/\d{14}id_\//u,
      );
      expect(event.landingPageUrl).toBe(
        "https://www.cumberlandcounty.ns.ca/tax-sales.html",
      );
    }

    // Rows printed as ADJORNED are recorded as withdrawn and never carry a bid.
    const adjourned = historicalTaxSaleRecords.filter(
      ({ eventId, outcome }) =>
        eventId === "cumberland-2026-03-03" && outcome === "withdrawn",
    );
    expect(adjourned).toHaveLength(6);
    expect(
      adjourned.every(({ winningBidCents }) => winningBidCents === null),
    ).toBe(true);

    // One parcel spans both sales: NOT COMPLETED in October 2025, sold in March 2026.
    const carriedForward = historicalContextsForPid("25049271");
    expect(
      carriedForward.map(({ event, record }) => [event.id, record.outcome]),
    ).toEqual([
      ["cumberland-2025-10-21", "unknown"],
      ["cumberland-2026-03-03", "sold"],
    ]);
    expect(carriedForward[0].record.winningBidCents).toBeNull();
    expect(carriedForward[1].record.winningBidCents).toBe(1_600_000);
  });

  it("drops the Cumberland owner column before it reaches the public dataset", () => {
    const cumberland = JSON.stringify(
      historicalTaxSaleRecords.filter(({ eventId }) =>
        eventId.startsWith("cumberland"),
      ),
    ).toUpperCase();

    // Surnames printed in the official NAME column, none of which appear in any
    // location description.
    for (const surname of [
      "BLANCHARD",
      "CHAPMAN",
      "MACKINNON",
      "ARSENEAU",
      "BERGERON",
      "RIPLEY",
    ]) {
      expect(cumberland).not.toContain(surname);
    }
  });
});
