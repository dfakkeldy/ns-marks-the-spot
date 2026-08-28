import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import * as watcher from "../watchTaxSaleSources.mjs";
import { runWatch } from "../watchTaxSaleSources.mjs";
import { CUMBERLAND_SOURCE } from "./cumberland.mjs";

const DATA_DIR = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../src/data",
);
const read = (name) => readFileSync(resolve(DATA_DIR, name), "utf8");

function fixture(heading, label, rows) {
  const rowMarkup = rows
    .map(
      (row) =>
        `<tr><td>${row.id}</td><td>${row.pid}</td><td>${row.name}</td><td>${row.description}</td><td>${row.redemption}</td><td>${row.minBid}</td><td>${row.winning}</td></tr>`,
    )
    .join("");
  return `<div><table>
<tr><td></td><td></td><td></td><td>${heading}</td><td></td><td></td><td></td></tr>
<tr><td>${label}</td><td>PID</td><td>NAME</td><td>DESCRIPTION</td><td>REDEMPTION EXPIRY</td><td>MIN BID</td><td>WINNING BID</td></tr>
${rowMarkup}
</table></div>`;
}

const MARCH_FIXTURE = fixture("MARCH 3, 2026 TAX SALE RESULTS", "AAN", [
  {
    id: "7463308",
    pid: "25369646",
    name: "DALE ALLAN CHAPMAN",
    description: "4115 HIGHWAY 366 TIDNISH LAND",
    redemption: "6 MONTH",
    minBid: "$2,728.33",
    winning: "$36,000.00",
  },
]);

const OCTOBER_FIXTURE = fixture("OCTOBER 20, 2026 TAX SALE RESULTS", "AAN", [
  {
    id: "1234567",
    pid: "25000001",
    name: "SOME OWNER",
    description: "MAIN ST SPRINGHILL LAND",
    redemption: "6 MONTH",
    minBid: "$1,000.00",
    winning: "$5,000.00",
  },
  {
    id: "7654321",
    pid: "25000002",
    name: "ANOTHER OWNER",
    description: "SHORE RD JOGGINS LAND",
    redemption: "IMMEDIATE",
    minBid: "$2,500.00",
    winning: "ADJORNED",
  },
]);

const SAVE_REDIRECT =
  "https://web.archive.org/web/20261101120000/https://www.cumberlandcounty.ns.ca/tax-sales.html";

function buildDeps({ live, captures = {} }) {
  const fetchImpl = async (url) => {
    if (url.startsWith("https://web.archive.org/save/")) {
      return { ok: true, url: SAVE_REDIRECT };
    }
    if (url.startsWith("https://web.archive.org/cdx/")) {
      // No prior captures beyond what Save Page Now just produced.
      return { ok: true, text: async () => "[]" };
    }
    const idMatch = url.match(/\/web\/(\d{14})id_\//u);
    if (idMatch) {
      const body = captures[idMatch[1]];
      if (body === undefined) {
        return { ok: false, status: 404, statusText: "Not Found" };
      }
      return { ok: true, text: async () => body };
    }
    if (url === CUMBERLAND_SOURCE.landingPageUrl) {
      return { ok: true, text: async () => live };
    }
    throw new Error(`Unexpected fetch: ${url}`);
  };

  return {
    fetchImpl,
    now: "2026-11-01",
    snapshot: JSON.parse(read("cumberlandTaxSale.snapshot.json")),
    dataset: read("historicalTaxSales.json"),
    ledger: read("historicalSourceLedger.json"),
  };
}

describe("runWatch", () => {
  it("checks both configured overwrite-prone municipal result pages", () => {
    expect(watcher.TAX_SALE_SOURCES.map(({ id }) => id)).toEqual([
      "cumberland",
      "richmond",
    ]);
  });

  it("reports unchanged when the live page still shows the ingested sale", async () => {
    const report = await runWatch(
      CUMBERLAND_SOURCE,
      buildDeps({ live: MARCH_FIXTURE }),
    );
    expect(report.status).toBe("unchanged");
    expect(report.dataset).toBeUndefined();
    expect(report.ledger).toBeUndefined();
  });

  it("defers ingest when no capture carries the results table", async () => {
    const report = await runWatch(
      CUMBERLAND_SOURCE,
      buildDeps({
        live: OCTOBER_FIXTURE,
        captures: { "20261101120000": "One moment, please... being verified" },
      }),
    );
    expect(report.status).toBe("pending-capture");
    expect(report.snapshot.pendingCapture).toBe(true);
    expect(report.snapshot.observedSale.saleDate).toBe("2026-10-20");
    expect(report.dataset).toBeUndefined();
  });

  it("ingests the new sale once a hashable capture exists", async () => {
    const report = await runWatch(
      CUMBERLAND_SOURCE,
      buildDeps({
        live: OCTOBER_FIXTURE,
        captures: { "20261101120000": OCTOBER_FIXTURE },
      }),
    );
    expect(report.status).toBe("ingested");
    expect(report.snapshot.pendingCapture).toBe(false);
    expect(report.snapshot.ingestedEventId).toBe("cumberland-2026-10-20");

    const dataset = JSON.parse(report.dataset);
    expect(dataset.events.at(-1).id).toBe("cumberland-2026-10-20");
    expect(
      dataset.records.filter((r) => r.eventId === "cumberland-2026-10-20"),
    ).toHaveLength(2);
    expect(JSON.stringify(dataset).toUpperCase()).not.toContain("SOME OWNER");

    const ledger = JSON.parse(report.ledger);
    expect(ledger.coverage.at(-1).municipality).toMatch(/Cumberland/u);
    expect(ledger.retrievedOn).toBe("2026-11-01");
  });

  it("refuses to ingest a sale already present in the dataset", async () => {
    const deps = buildDeps({
      live: MARCH_FIXTURE,
      captures: { "20261101120000": MARCH_FIXTURE },
    });
    deps.snapshot = { ...deps.snapshot, ingestedEventId: null, observedSale: null };
    await expect(runWatch(CUMBERLAND_SOURCE, deps)).rejects.toThrow(
      /cumberland-2026-03-03 is already in the dataset/u,
    );
  });

  it("propagates a parser guard failure instead of writing anything", async () => {
    const broken = OCTOBER_FIXTURE.replace("ADJORNED", "POSTPONED");
    await expect(
      runWatch(
        CUMBERLAND_SOURCE,
        buildDeps({ live: broken, captures: { "20261101120000": broken } }),
      ),
    ).rejects.toThrow(/Unrecognized winning-bid value "POSTPONED"/u);
  });
});
