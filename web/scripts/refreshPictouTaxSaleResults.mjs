const MONTHS = [
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
];

function moneyToCents(value) {
  const match = String(value).match(/\$?\s*([\d,]+)\.(\d{2})/u);
  return match
    ? Number(match[1].replaceAll(",", "")) * 100 + Number(match[2])
    : null;
}

function saleDateFromText(value) {
  const match = String(value).match(
    /([A-Za-z]+)[-\s]+(\d{1,2})[-,\s]+(\d{4})/u,
  );
  if (!match) return null;
  const month = MONTHS.indexOf(match[1].toLowerCase());
  if (month < 0) return null;
  return `${match[3]}-${String(month + 1).padStart(2, "0")}-${String(
    Number(match[2]),
  ).padStart(2, "0")}`;
}

export function classifyPictouResult(raw) {
  const value = String(raw).trim();
  const winningBidCents = moneyToCents(value);
  if (winningBidCents !== null) {
    return { outcome: "sold", winningBidCents };
  }
  if (value.toUpperCase() === "REMOVED") {
    return {
      outcome: "withdrawn",
      winningBidCents: null,
      resultNote:
        'Official selling-price column reads "Removed"; the property was taken out of this tender and no selling price is published.',
    };
  }
  throw new Error(`Unrecognized Pictou selling-price value "${value}".`);
}

export function parsePictouResultText(text) {
  const rows = [];
  for (const line of String(text).replaceAll("\r", "").split("\n")) {
    const match = line.match(
      /^\s*(\d{8})\s+(\d{8})\s+(\d{2})\s+(.+?)\s+\$([\d,]+\.\d{2})\s+(Yes|No)\s+(Yes|No)\s+(\$[\d,]+\.\d{2}|Removed)\s*$/u,
    );
    if (!match) continue;
    const advertisedAmountCents = moneyToCents(match[5]);
    classifyPictouResult(match[8]);
    rows.push({
      listingIdentifier: match[1],
      pid: match[2],
      district: match[3],
      description: match[4],
      advertisedAmountCents,
      redemptionLabel: `Redeemable - ${match[6]}`,
      hst: match[7] === "Yes",
      sellingRaw: match[8],
    });
  }
  if (rows.length === 0) {
    throw new Error("The Pictou result PDF contained no parsable rows.");
  }
  if (new Set(rows.map(({ listingIdentifier }) => listingIdentifier)).size !== rows.length) {
    throw new Error("The Pictou result PDF contains duplicate AAN rows.");
  }
  return { rows };
}

export function extractLatestPictouResultsPdfUrl(html, landingPageUrl) {
  const candidates = Array.from(
    String(html).matchAll(/<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/giu),
    ([, href, label]) => {
      const text = label.replace(/<[^>]+>/gu, " ").replace(/\s+/gu, " ").trim();
      const url = new URL(href, landingPageUrl).toString();
      if (!/result/iu.test(url) || !/\.pdf(?:$|\?)/iu.test(url)) return null;
      const saleDate = saleDateFromText(`${text} ${url}`);
      return saleDate ? { saleDate, url } : null;
    },
  ).filter(Boolean);
  if (candidates.length === 0) {
    throw new Error("The Pictou landing page links no dated result PDF.");
  }
  candidates.sort((left, right) => left.saleDate.localeCompare(right.saleDate));
  const latest = candidates.at(-1);
  const sameDate = candidates.filter(({ saleDate }) => saleDate === latest.saleDate);
  if (new Set(sameDate.map(({ url }) => url)).size !== 1) {
    throw new Error(
      `The Pictou landing page links multiple result PDFs for ${latest.saleDate}.`,
    );
  }
  return latest;
}

export function buildPictouAddition({
  saleDate,
  rows,
  landingPageUrl,
  noticeUrl,
  noticeSha256,
  resultUrl,
  resultSha256,
  retrievedOn,
}) {
  const eventId = `pictou-${saleDate}`;
  const classified = rows.map((row) => ({
    row,
    result: classifyPictouResult(row.sellingRaw),
  }));
  const sold = classified.filter(({ result }) => result.outcome === "sold").length;
  const withdrawn = classified.filter(
    ({ result }) => result.outcome === "withdrawn",
  ).length;

  const event = {
    id: eventId,
    municipalityId: "pictou",
    municipality: "Municipality of the County of Pictou",
    shortMunicipality: "Pictou",
    saleDate,
    saleMethod: "public-tender",
    listingIdentifierLabel: "AAN",
    advertisedAmountLabel: "Minimum bid",
    currency: "CAD",
    resultStatus: "verified",
    noticeUrl,
    resultUrl,
    landingPageUrl,
    retrievedOn,
    noticeSnapshotDate: retrievedOn,
    resultSnapshotDate: retrievedOn,
    noticeSha256,
    resultSha256,
    sourceNotes:
      `The dated official result PDF publishes ${rows.length} exact AAN/PID rows: ${sold} numeric selling prices and ${withdrawn} rows printed Removed. Removed rows are recorded as withdrawn with no selling price. All result rows publish the same $1,200 minimum bid; post-sale redeemability and HST remain printed source fields. Only the public map fields in the result table enter this dataset.`,
  };

  const records = classified.map(({ row, result }) => ({
    eventId,
    recordId: `${eventId}-aan-${row.listingIdentifier}`,
    listingIdentifier: row.listingIdentifier,
    pids: [row.pid],
    civicDescription: row.description,
    advertisedAmountCents: row.advertisedAmountCents,
    winningBidCents: result.winningBidCents,
    outcome: result.outcome,
    ...(result.resultNote ? { resultNote: result.resultNote } : {}),
    redemptionLabel: row.redemptionLabel,
    nspMatchStatus: "matched",
    nspMatchMethod: "exact-official-pid",
    reviewState: "visually-verified",
  }));

  const ledgerEntry = {
    municipality: event.municipality,
    event: `April 10, 2026 Tax Sale 2026-01 (public tender)`,
    status: "included",
    officialUrls: [landingPageUrl, noticeUrl, resultUrl],
    documentSha256: [noticeSha256, resultSha256],
    fieldsAvailable: [
      "AAN",
      "PID",
      "district",
      "description",
      "minimum bid",
      "post-sale redeemable",
      "HST",
      "selling price",
    ],
    officialWinningBidsFound: sold > 0,
    notes:
      `${rows.length} result rows were reconciled from the dated official PDF; ${sold} publish a numeric selling price and ${withdrawn} print Removed. Removed is preserved as withdrawn with no selling-price claim. Every exact eight-digit PID returned from NSPRD on ${retrievedOn}.`,
  };

  return { event, records, ledgerEntry };
}

function sha256(input) {
  return createHash("sha256").update(input).digest("hex");
}

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

function updateHistoricalDatasetHash(modelSource, datasetHash) {
  const pattern =
    /(HISTORICAL_DATASET_SHA256\s*=\s*\n\s*")([a-f\d]{64})(";)/u;
  if (!pattern.test(modelSource)) {
    throw new Error("Could not find HISTORICAL_DATASET_SHA256 in the model.");
  }
  return modelSource.replace(pattern, `$1${datasetHash}$3`);
}

async function fetchBytes(url, accept) {
  const response = await fetch(url, {
    headers: { Accept: accept, "User-Agent": "NS-Marks-tax-sale-monitor/1.0" },
  });
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}: ${url}`);
  }
  return Buffer.from(await response.arrayBuffer());
}

async function validateExactPids(pids) {
  const url = new URL(
    "https://nsgiwa2.novascotia.ca/arcgis/rest/services/PLAN/PLAN_NSPRD_WM84/MapServer/0/query",
  );
  url.search = new URLSearchParams({
    where: `PID IN (${pids.map((pid) => `'${pid}'`).join(",")})`,
    outFields: "PID",
    returnGeometry: "false",
    f: "json",
  }).toString();
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`NSPRD validation failed with HTTP ${response.status}.`);
  }
  const payload = await response.json();
  if (payload.error) {
    throw new Error(payload.error.message ?? "NSPRD validation failed.");
  }
  const returned = new Set(
    payload.features.map(({ attributes }) =>
      String(attributes.PID).padStart(8, "0"),
    ),
  );
  const missing = pids.filter((pid) => !returned.has(pid));
  if (missing.length > 0 || returned.size !== new Set(pids).size) {
    throw new Error(
      `Pictou PID reconciliation failed: missing ${missing.join(", ") || "none"}; expected ${new Set(pids).size}, returned ${returned.size}.`,
    );
  }
}

async function main() {
  const temporaryDirectory = await mkdtemp(
    resolve(tmpdir(), "pictou-tax-sale-results-"),
  );
  try {
    const landingHtml = (
      await fetchBytes(LANDING_PAGE_URL, "text/html")
    ).toString("utf8");
    const latest = extractLatestPictouResultsPdfUrl(
      landingHtml,
      LANDING_PAGE_URL,
    );
    const [resultBytes, noticeBytes] = await Promise.all([
      fetchBytes(latest.url, "application/pdf"),
      fetchBytes(NOTICE_URL, "application/pdf"),
    ]);
    const resultPath = resolve(temporaryDirectory, "result.pdf");
    const textPath = resolve(temporaryDirectory, "result.txt");
    await writeFile(resultPath, resultBytes);
    await execFile("pdftotext", ["-layout", resultPath, textPath]);
    const sale = parsePictouResultText(await readFile(textPath, "utf8"));

    const datasetText = await readFile(DATASET_PATH, "utf8");
    const ledgerText = await readFile(LEDGER_PATH, "utf8");
    const dataset = JSON.parse(datasetText);
    const ledger = JSON.parse(ledgerText);
    const eventId = `pictou-${latest.saleDate}`;
    const existingEvent = dataset.events.find(({ id }) => id === eventId);
    const addition = buildPictouAddition({
      saleDate: latest.saleDate,
      rows: sale.rows,
      landingPageUrl: LANDING_PAGE_URL,
      noticeUrl: NOTICE_URL,
      noticeSha256: sha256(noticeBytes),
      resultUrl: latest.url,
      resultSha256: sha256(resultBytes),
      retrievedOn: existingEvent?.retrievedOn ?? halifaxDate(),
    });

    if (existingEvent) {
      const existingRecords = dataset.records.filter(
        ({ eventId: recordEventId }) => recordEventId === eventId,
      );
      if (
        existingEvent.noticeSha256 !== addition.event.noticeSha256 ||
        existingEvent.resultSha256 !== addition.event.resultSha256 ||
        JSON.stringify(existingRecords) !== JSON.stringify(addition.records)
      ) {
        throw new Error(
          `${eventId} changed after ingestion; refusing to rewrite the verified event automatically.`,
        );
      }
      console.log(
        `pictou: unchanged (${eventId}; ${sale.rows.length} rows; result SHA-256 ${addition.event.resultSha256}).`,
      );
      return;
    }

    await validateExactPids(sale.rows.map(({ pid }) => pid));
    dataset.events.push(addition.event);
    dataset.records.push(...addition.records);
    ledger.retrievedOn = halifaxDate();
    ledger.coverage.push(addition.ledgerEntry);
    const updatedDataset = formatDataset(dataset);
    await Promise.all([
      writeFile(DATASET_PATH, updatedDataset),
      writeFile(LEDGER_PATH, formatLedger(ledger)),
      readFile(MODEL_PATH, "utf8").then((source) =>
        writeFile(
          MODEL_PATH,
          updateHistoricalDatasetHash(source, sha256(updatedDataset)),
        ),
      ),
    ]);
    console.log(
      `pictou: ingested ${eventId}; ${sale.rows.length} rows, ${addition.records.filter(({ outcome }) => outcome === "sold").length} sold, ${addition.records.filter(({ outcome }) => outcome === "withdrawn").length} removed; result SHA-256 ${addition.event.resultSha256}.`,
    );
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
import { execFile as execFileCallback } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import {
  formatDataset,
  formatLedger,
} from "./taxSaleWatch/dataset.mjs";

const execFile = promisify(execFileCallback);
const LANDING_PAGE_URL =
  "https://munpict.ca/departments-and-services/finance/tax-sale/";
const NOTICE_URL =
  "https://munpict.ca/assets/Tax-Sale-2026-01-Final-Advertisement-Posted-revised-April-10.pdf";
const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = resolve(SCRIPT_DIR, "../src/data");
const DATASET_PATH = resolve(DATA_DIR, "historicalTaxSales.json");
const LEDGER_PATH = resolve(DATA_DIR, "historicalSourceLedger.json");
const MODEL_PATH = resolve(DATA_DIR, "historicalTaxSales.ts");
