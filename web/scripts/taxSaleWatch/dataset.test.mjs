import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildEvent,
  buildLedgerEntry,
  buildRecords,
  eventIdFor,
  formatDataset,
  formatLedger,
} from "./dataset.mjs";
import { CUMBERLAND_SOURCE } from "./cumberland.mjs";

const DATA_DIR = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../src/data",
);

describe("byte-exact serializers", () => {
  it("round-trips the committed historical dataset unchanged", async () => {
    const source = await readFile(
      resolve(DATA_DIR, "historicalTaxSales.json"),
      "utf8",
    );
    expect(formatDataset(JSON.parse(source))).toBe(source);
  });

  it("round-trips the committed source ledger unchanged", async () => {
    const source = await readFile(
      resolve(DATA_DIR, "historicalSourceLedger.json"),
      "utf8",
    );
    expect(formatLedger(JSON.parse(source))).toBe(source);
  });
});

const SALE = {
  saleDate: "2026-10-20",
  heading: "OCTOBER 20, 2026 TAX SALE RESULTS",
  listingIdentifierLabel: "AAN",
  rows: [
    {
      listingIdentifier: "1234567",
      pid: "25000001",
      description: "MAIN ST SPRINGHILL LAND",
      redemptionLabel: "Redemption expiry - 6 month",
      advertisedAmountCents: 100_000,
      winningRaw: "$5,000.00",
    },
    {
      listingIdentifier: "7654321",
      pid: "25000002",
      description: "SHORE RD JOGGINS LAND",
      redemptionLabel: "Redemption expiry - Immediate",
      advertisedAmountCents: 250_000,
      winningRaw: "ADJORNED",
    },
  ],
};
const CAPTURE = {
  timestamp: "20261101120000",
  url: "https://web.archive.org/web/20261101120000id_/https://www.cumberlandcounty.ns.ca/tax-sales.html",
  sha256: "a".repeat(64),
};

describe("dataset builders", () => {
  it("derives a stable event id from the sale date", () => {
    expect(eventIdFor("cumberland", "2026-10-20")).toBe("cumberland-2026-10-20");
  });

  it("cites the archive capture as both notice and result receipt", () => {
    const event = buildEvent({
      source: CUMBERLAND_SOURCE,
      sale: SALE,
      capture: CAPTURE,
      retrievedOn: "2026-11-01",
    });
    expect(event).toMatchObject({
      id: "cumberland-2026-10-20",
      municipalityId: "cumberland",
      saleDate: "2026-10-20",
      resultStatus: "verified",
      noticeUrl: CAPTURE.url,
      resultUrl: CAPTURE.url,
      noticeSha256: CAPTURE.sha256,
      resultSha256: CAPTURE.sha256,
      landingPageUrl: CUMBERLAND_SOURCE.landingPageUrl,
      retrievedOn: "2026-11-01",
      noticeSnapshotDate: "2026-11-01",
    });
    expect(event.sourceNotes).toMatch(/overwritten each sale/u);
  });

  it("builds owner-free records with classified outcomes", () => {
    const records = buildRecords({
      source: CUMBERLAND_SOURCE,
      sale: SALE,
      eventId: "cumberland-2026-10-20",
    });
    expect(records).toHaveLength(2);
    expect(records[0]).toMatchObject({
      recordId: "cumberland-2026-10-20-aan-1234567",
      pids: ["25000001"],
      advertisedAmountCents: 100_000,
      winningBidCents: 500_000,
      outcome: "sold",
      nspMatchStatus: "matched",
      nspMatchMethod: "exact-official-pid",
      reviewState: "visually-verified",
    });
    expect(records[1]).toMatchObject({
      outcome: "withdrawn",
      winningBidCents: null,
    });
    expect(records[1].resultNote).toMatch(/ADJORNED/u);
  });

  it("keeps owner names out of every built record", () => {
    const records = buildRecords({
      source: CUMBERLAND_SOURCE,
      sale: SALE,
      eventId: "cumberland-2026-10-20",
    });
    expect(JSON.stringify(records)).not.toMatch(/name/iu);
  });

  it("records the live retrieval hash alongside the capture in the ledger", () => {
    const entry = buildLedgerEntry({
      source: CUMBERLAND_SOURCE,
      sale: SALE,
      capture: CAPTURE,
      retrievedOn: "2026-11-01",
      livePageSha256: "b".repeat(64),
    });
    expect(entry.status).toBe("included");
    expect(entry.officialWinningBidsFound).toBe(true);
    expect(entry.officialUrls).toContain(CUMBERLAND_SOURCE.landingPageUrl);
    expect(entry.officialUrls).toContain(CAPTURE.url);
    expect(entry.documentSha256).toEqual([CAPTURE.sha256, "b".repeat(64)]);
    expect(entry.notes).toMatch(/assessed-name column was discarded/u);
  });
});
