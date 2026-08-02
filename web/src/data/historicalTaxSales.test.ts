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
  /^https:\/\/(?:(?:cdn\.)?halifax\.ca|victoriacounty\.com|cbrm\.ns\.ca|munpict\.ca|(?:www\.)?modl\.ca|web\.archive\.org)\//u;

describe("historical tax-sale records", () => {
  // Byte-level protection for this dataset lives in taxSaleCatalog.test.ts,
  // which pins historicalTaxSales.json against HISTORICAL_DATASET_SHA256. That
  // lets an automated ingest add a sale without hand-editing totals here, while
  // still going red on an unaccompanied data edit.
  it("keeps every event and record structurally sound as sources are added", () => {
    expect(historicalTaxSaleEvents.length).toBeGreaterThan(0);
    const eventIds = new Set(historicalTaxSaleEvents.map(({ id }) => id));
    expect(eventIds.size).toBe(historicalTaxSaleEvents.length);

    for (const event of historicalTaxSaleEvents) {
      const records = historicalTaxSaleRecords.filter(
        ({ eventId }) => eventId === event.id,
      );
      expect(records.length, `event ${event.id} has no records`).toBeGreaterThan(
        0,
      );
      for (const record of records) {
        expect(record.pids.length).toBeGreaterThan(0);
        expect(new Set(record.pids).size).toBe(record.pids.length);
      }
    }

    // Every ledger entry marked included must have a matching event.
    const municipalities = new Set(
      historicalTaxSaleEvents.map(({ municipality }) => municipality),
    );
    for (const entry of historicalSourceLedger.coverage) {
      if (entry.status === "included") {
        expect(municipalities).toContain(entry.municipality);
      }
    }
  });

  it("keeps assessed owners out of the public historical dataset", () => {
    const publicDataset = JSON.stringify({
      events: historicalTaxSaleEvents,
      records: historicalTaxSaleRecords,
    }).toLocaleLowerCase();
    expect(publicDataset).not.toMatch(/owner name|owners|bidder name/u);
    expect(Object.keys(historicalTaxSaleRecords[0])).not.toEqual(
      expect.arrayContaining(["owner", "ownerName", "bidder", "bidderName"]),
    );
  });

  it("uses only printed CBRM winning bids and keeps every other result unknown", () => {
    const cbrm = historicalTaxSaleEvents.find(
      ({ id }) => id === "cbrm-2026-07-21",
    );
    const records = historicalTaxSaleRecords.filter(
      ({ eventId }) => eventId === cbrm?.id,
    );

    expect(cbrm).toMatchObject({
      resultStatus: "verified",
      resultUrl:
        "https://cbrm.ns.ca/wp-content/uploads/2026/07/List-of-Sold-Properties-July-21-2026.pdf",
      resultSnapshotDate: "2026-07-27",
      resultSha256:
        "ae4f1b0b08528a6d7e90fb3c2e5816bde6ec593e63c44c02f5b4e9fae07d7d5d",
    });
    expect(records).toHaveLength(67);
    expect(records.filter(({ outcome }) => outcome === "sold")).toHaveLength(21);
    expect(records.filter(({ outcome }) => outcome === "unknown")).toHaveLength(
      46,
    );
    expect(
      records.filter(({ resultNote }) =>
        resultNote?.includes('reads "PAID AT SALE"'),
      ),
    ).toHaveLength(1);
    expect(
      records.filter(({ resultNote }) =>
        resultNote?.includes("publishes no winning bid or disposition"),
      ),
    ).toHaveLength(32);
    expect(
      records.filter(({ resultNote }) =>
        resultNote?.includes("does not carry this notice row"),
      ),
    ).toHaveLength(13);
  });

  it("keeps the March 2026 CBRM colour-only result out of the public model", () => {
    const researched = historicalSourceLedger.coverage.find(
      ({ event }) => event === "March 10, 2026 tax sale",
    );

    expect(researched).toMatchObject({
      municipality: "Cape Breton Regional Municipality",
      status: "researched-not-included",
      officialWinningBidsFound: false,
    });
    expect(researched?.fieldsAvailable).not.toContain("winning bid for some rows");
    expect(
      historicalTaxSaleEvents.some(({ id }) => id === "cbrm-2026-03-10"),
    ).toBe(false);
  });

  it("keeps the notice-less May 2026 Halifax result out of the public model", () => {
    const researched = historicalSourceLedger.coverage.find(
      ({ event }) => event === "May 12, 2026 tax sale",
    );

    expect(researched).toMatchObject({
      municipality: "Halifax Regional Municipality",
      status: "researched-not-included",
      officialWinningBidsFound: true,
    });
    expect(
      historicalTaxSaleEvents.some(({ id }) => id === "hrm-2026-05-12"),
    ).toBe(false);
  });

  it("keeps the result-only February 2026 Shelburne sale out of the public model", () => {
    const researched = historicalSourceLedger.coverage.find(
      ({ event }) => event === "February 9, 2026 tax sale by tender",
    );

    expect(researched).toMatchObject({
      municipality: "Municipality of the District of Shelburne",
      status: "researched-not-included",
      officialWinningBidsFound: true,
      documentSha256: [
        "71cbfdebc90e7758e9bfb37a4675a76bec6416f8c95d458e58a95dc4bb4836e4",
      ],
    });
    expect(
      historicalTaxSaleEvents.some(
        ({ id }) => id === "shelburne-2026-02-09",
      ),
    ).toBe(false);
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

  it("derives Lunenburg PIDs from assessment accounts and reports the method honestly", () => {
    const modlRecords = historicalTaxSaleRecords.filter(({ eventId }) =>
      eventId.startsWith("modl-"),
    );
    const modlEvents = historicalTaxSaleEvents.filter(({ id }) =>
      id.startsWith("modl-"),
    );

    expect(modlEvents).toHaveLength(6);
    expect(modlRecords).toHaveLength(145);
    // Lunenburg publishes assessment account numbers but no PIDs, so every
    // published PID is a deterministic reconciliation, never an exact official PID.
    expect(
      modlRecords.every(
        ({ nspMatchStatus, nspMatchMethod }) =>
          nspMatchStatus === "matched" &&
          nspMatchMethod === "deterministic-reconciliation",
      ),
    ).toBe(true);
    // The listing identifier is the assessment account, not a PID.
    expect(
      modlRecords.every(({ listingIdentifier }) =>
        /^\d{8}$/u.test(listingIdentifier),
      ),
    ).toBe(true);
    for (const event of modlEvents) {
      expect(event.municipalityId).toBe("modl");
      expect(event.saleMethod).toBe("sealed-tender");
      expect(event.advertisedAmountLabel).toBe("Minimum opening bid");
      expect(event.noticeUrl).toMatch(
        /^https:\/\/(?:web\.archive\.org|www\.modl\.ca)\//u,
      );
    }
  });

  it("publishes Lunenburg winning bids only from award documents and fails closed on conflicts", () => {
    const byId = (recordId: string) =>
      historicalTaxSaleRecords.find((record) => record.recordId === recordId);

    // A property whose top bid was withdrawn shows the standing lower award.
    const reawarded = byId("modl-2021-03-01-aan-02443511");
    expect(reawarded).toMatchObject({ outcome: "sold", winningBidCents: 850_100 });

    // Both marked bidders withdrew: no completed sale, so no winning bid.
    const bothWithdrew = byId("modl-2021-03-01-aan-01604112");
    expect(bothWithdrew).toMatchObject({
      outcome: "unknown",
      winningBidCents: null,
      reviewState: "needs-review",
    });

    // Award document and surplus record disagree: fail closed rather than guess.
    const conflicted = byId("modl-2021-03-01-aan-10107393");
    expect(conflicted?.outcome).toBe("unknown");
    expect(conflicted?.winningBidCents).toBeNull();
    expect(conflicted?.resultNote).toMatch(/disagree/u);

    // Withdrawn-before-sale listings never carry a winning bid.
    const withdrawn = historicalTaxSaleRecords.filter(
      ({ eventId, outcome }) =>
        eventId.startsWith("modl-") && outcome === "withdrawn",
    );
    expect(withdrawn.length).toBeGreaterThan(0);
    expect(withdrawn.every(({ winningBidCents }) => winningBidCents === null)).toBe(
      true,
    );
  });
});
