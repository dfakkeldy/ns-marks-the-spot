import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  findHashableCapture,
  listCaptures,
  sha256,
  submitToWayback,
} from "./taxSaleWatch/archive.mjs";
import { CUMBERLAND_SOURCE } from "./taxSaleWatch/cumberland.mjs";
import { RICHMOND_SOURCE } from "./taxSaleWatch/richmond.mjs";
import {
  buildEvent,
  buildLedgerEntry,
  buildRecords,
  eventIdFor,
  formatDataset,
  formatLedger,
} from "./taxSaleWatch/dataset.mjs";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = resolve(SCRIPT_DIR, "../src/data");
const DATASET_PATH = resolve(DATA_DIR, "historicalTaxSales.json");
const LEDGER_PATH = resolve(DATA_DIR, "historicalSourceLedger.json");
const MODEL_PATH = resolve(DATA_DIR, "historicalTaxSales.ts");

export const TAX_SALE_SOURCES = [CUMBERLAND_SOURCE, RICHMOND_SOURCE];

function halifaxDate(now = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Halifax",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
      .formatToParts(now)
      .filter(({ type }) => type !== "literal")
      .map(({ type, value }) => [type, value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function updateHistoricalDatasetHash(modelSource, datasetHash) {
  const pattern =
    /(HISTORICAL_DATASET_SHA256\s*=\s*\n\s*")([a-f\d]{64})(";)/u;
  if (!pattern.test(modelSource)) {
    throw new Error("Could not find HISTORICAL_DATASET_SHA256 in the model.");
  }
  return modelSource.replace(pattern, `$1${datasetHash}$3`);
}

function replayUrl(timestamp, url) {
  return `https://web.archive.org/web/${timestamp}/${url}`;
}

export async function runWatch(
  source,
  { fetchImpl = fetch, now, snapshot, dataset, ledger },
) {
  const response = await fetchImpl(source.landingPageUrl, {
    headers: { "User-Agent": "NS-Marks-tax-sale-monitor/1.0" },
  });
  if (!response.ok) {
    throw new Error(
      `${response.status} ${response.statusText}: ${source.landingPageUrl}`,
    );
  }
  const html = await response.text();
  const livePageSha256 = sha256(html);
  const sale = source.parseResults(html);
  const eventId = eventIdFor(source.id, sale.saleDate);

  if (eventId === snapshot.ingestedEventId) {
    return { status: "unchanged", snapshot, summary: `${source.id}: unchanged (${eventId} already ingested).` };
  }

  const datasetObject = JSON.parse(dataset);
  if (datasetObject.events.some((event) => event.id === eventId)) {
    throw new Error(
      `${eventId} is already in the dataset but the snapshot does not record it as ingested; refusing to double-ingest.`,
    );
  }

  // Preserve the evidence first: archiving a changed page is the irreversible-loss
  // guard and must run even for a page we might not be able to fully classify.
  const saveTimestamp = await submitToWayback(source.landingPageUrl, {
    fetchImpl,
  });
  const cdxTimestamps = await listCaptures(source.landingPageUrl, { fetchImpl });
  const candidates = [...new Set([saveTimestamp, ...cdxTimestamps])].filter(
    Boolean,
  );
  const capture = await findHashableCapture(source.landingPageUrl, {
    fetchImpl,
    verify: source.containsResultsTable,
    timestamps: candidates,
  });

  const observedSale = {
    saleDate: sale.saleDate,
    heading: sale.heading,
    rowCount: sale.rows.length,
  };

  if (!capture) {
    // A new sale is live but no capture carries the table yet. Record the pending
    // state so the next run retries, and cite nothing hashable.
    return {
      status: "pending-capture",
      snapshot: {
        ...snapshot,
        retrievedDate: now,
        observedSale,
        livePageSha256,
        archive: {
          captureTimestamp: saveTimestamp ?? null,
          captureUrl: saveTimestamp
            ? replayUrl(saveTimestamp, source.landingPageUrl)
            : null,
          captureSha256: null,
        },
        pendingCapture: true,
      },
      summary: `${source.id}: detected ${eventId} but no hashable capture yet; ingest deferred.`,
    };
  }

  const event = buildEvent({ source, sale, capture, retrievedOn: now });
  const records = buildRecords({ source, sale, eventId });
  const ledgerEntry = buildLedgerEntry({
    source,
    sale,
    capture,
    retrievedOn: now,
    livePageSha256,
  });

  datasetObject.events.push(event);
  datasetObject.records.push(...records);
  const ledgerObject = JSON.parse(ledger);
  ledgerObject.retrievedOn = now;
  ledgerObject.coverage.push(ledgerEntry);

  return {
    status: "ingested",
    snapshot: {
      ...snapshot,
      retrievedDate: now,
      observedSale,
      livePageSha256,
      archive: {
        captureTimestamp: capture.timestamp,
        captureUrl: capture.url,
        captureSha256: capture.sha256,
      },
      pendingCapture: false,
      ingestedEventId: eventId,
    },
    dataset: formatDataset(datasetObject),
    ledger: formatLedger(ledgerObject),
    summary: `${source.id}: ingested ${eventId} with ${records.length} records from capture ${capture.timestamp}.`,
  };
}

async function main() {
  const now = halifaxDate();
  let datasetText = await readFile(DATASET_PATH, "utf8");
  let ledgerText = await readFile(LEDGER_PATH, "utf8");
  let datasetChanged = false;

  for (const source of TAX_SALE_SOURCES) {
    const snapshotPath = resolve(DATA_DIR, source.snapshotPath);
    const snapshot = JSON.parse(await readFile(snapshotPath, "utf8"));
    const report = await runWatch(source, {
      fetchImpl: fetch,
      now,
      snapshot,
      dataset: datasetText,
      ledger: ledgerText,
    });

    console.log(report.summary);
    if (report.status === "unchanged") {
      continue;
    }

    await writeFile(
      snapshotPath,
      `${JSON.stringify(report.snapshot, null, 2)}\n`,
    );
    if (report.status === "ingested") {
      datasetText = report.dataset;
      ledgerText = report.ledger;
      datasetChanged = true;
    }
  }

  if (datasetChanged) {
    await writeFile(DATASET_PATH, datasetText);
    await writeFile(LEDGER_PATH, ledgerText);
    const modelSource = await readFile(MODEL_PATH, "utf8");
    await writeFile(
      MODEL_PATH,
      updateHistoricalDatasetHash(modelSource, sha256(datasetText)),
    );
    console.log(`Updated the dataset receipt to ${sha256(datasetText)}.`);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
