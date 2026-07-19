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

describe("historical tax-sale outcomes", () => {
  it("preserves seven supported Halifax events as 87 owner-free records", () => {
    expect(historicalTaxSaleEvents).toHaveLength(7);
    expect(historicalTaxSaleRecords).toHaveLength(87);
    expect(matchedHistoricalPids()).toHaveLength(93);
    expect(
      historicalTaxSaleRecords.filter(({ outcome }) => outcome === "sold"),
    ).toHaveLength(82);
    expect(
      historicalTaxSaleRecords.filter(({ outcome }) => outcome === "unsold"),
    ).toHaveLength(4);
    expect(
      historicalTaxSaleRecords.filter(({ outcome }) => outcome === "unknown"),
    ).toHaveLength(1);
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
    expect(historicalMatchExceptions.exceptions).toEqual([]);
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

  it("pins direct official notice/result links and document hashes", () => {
    for (const event of historicalTaxSaleEvents) {
      expect(event.noticeUrl).toMatch(/^https:\/\/(?:cdn\.)?halifax\.ca\//u);
      expect(event.resultUrl).toMatch(/^https:\/\/(?:cdn\.)?halifax\.ca\//u);
      expect(event.noticeSha256).toMatch(/^[a-f0-9]{64}$/u);
      expect(event.resultSha256).toMatch(/^[a-f0-9]{64}$/u);
    }
    expect(historicalSourceLedger.coverage).toHaveLength(9);
  });
});
