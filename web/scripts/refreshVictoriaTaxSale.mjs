import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  findHashableCapture,
  listCaptures,
  submitToWayback,
} from "./taxSaleWatch/archive.mjs";

const SOURCE_URL = "https://victoriacounty.com/property-tax-sale-notice/";
const LANDING_PAGE_URL =
  "https://victoriacounty.com/residents/property-taxation-services/tax-sales/";
const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const SNAPSHOT_PATH = resolve(SCRIPT_DIR, "../src/data/victoriaTaxSale.snapshot.json");
const MODEL_PATH = resolve(SCRIPT_DIR, "../src/data/victoriaTaxSale.ts");
const MONTHS = [
  "January", "February", "March", "April", "May", "June", "July",
  "August", "September", "October", "November", "December",
];

function decodeHtml(value) {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'")
    .replaceAll("&nbsp;", " ")
    .replace(/&#(\d+);/gu, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([\da-f]+);/giu, (_, code) =>
      String.fromCodePoint(Number.parseInt(code, 16)),
    );
}

function textContent(value) {
  return decodeHtml(value.replace(/<[^>]+>/gu, " "))
    .replace(/\s+/gu, " ")
    .trim();
}

function parseRows(tableHtml) {
  return Array.from(
    tableHtml.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/giu),
    ([, row]) =>
      Array.from(
        row.matchAll(/<t[hd]\b[^>]*>([\s\S]*?)<\/t[hd]>/giu),
        ([, cell]) => textContent(cell),
      ),
  );
}

function parseDate(monthName, day, year) {
  const month = MONTHS.indexOf(monthName) + 1;
  return month === 0
    ? null
    : `${year}-${String(month).padStart(2, "0")}-${String(Number(day)).padStart(2, "0")}`;
}

function parseMoneyCents(value) {
  // Official Victoria totals are `$digits.cents`, with ` + hst` on HST-applicable land.
  const match = value.match(/^\$([\d,]+)\.(\d{2})(?:\s*\+\s*hst)?$/iu);
  return match
    ? Number(match[1].replaceAll(",", "")) * 100 + Number(match[2])
    : null;
}

export function parseVictoriaNotice(html) {
  const pageText = textContent(
    html
      .replace(/<script\b[\s\S]*?<\/script>/giu, " ")
      .replace(/<style\b[\s\S]*?<\/style>/giu, " "),
  );
  const eventDateMatch = pageText.match(
    /TAX SALE BY TENDER\s+(January|February|March|April|May|June|July|August|September|October|November|December) (\d{1,2}), (\d{4})/u,
  );
  const deadlineMatch = pageText.match(
    /received by (\d{1,2}):(\d{2}) noon at the Municipal Administration Building \(([^)]+)\)/iu,
  );
  const publishedMatch = pageText.match(
    /Dated at Baddeck, N\.S\. (January|February|March|April|May|June|July|August|September|October|November|December) (\d{1,2}), (\d{4})/u,
  );
  if (!eventDateMatch || !deadlineMatch || !publishedMatch) {
    throw new Error("Could not parse the Victoria sale date, bid deadline, venue, and publication date.");
  }

  const requiredHeaders = [
    "#", "AAN", "PID", "ASSESSED TO", "PROPERTY DESCRIPTION", "REDEEMABLE",
    "LAND REGISTERED", "TOTAL OWING",
  ];
  const tables = Array.from(
    html.matchAll(/<table\b[^>]*>([\s\S]*?)<\/table>/giu),
    ([, table]) => parseRows(table),
  ).filter(([headers]) => JSON.stringify(headers) === JSON.stringify(requiredHeaders));
  if (tables.length !== 1) {
    throw new Error(`Expected one Victoria tax-sale property table, found ${tables.length}.`);
  }

  const sourceRows = tables[0].slice(1).filter((cells) => cells.some(Boolean));
  const listings = [];
  let opaqueRemovedRowCount = 0;
  for (const cells of sourceRows) {
    const item = Number(cells[0]);
    if (!Number.isSafeInteger(item) || cells.length !== requiredHeaders.length) {
      throw new Error(`Could not reconcile Victoria row ${cells[0] || "unknown"}.`);
    }
    const ownerFreeCells = cells.slice(1, 3).concat(cells.slice(4));
    if (ownerFreeCells.some((value) => value === "REMOVED")) {
      if (!ownerFreeCells.every((value) => value === "REMOVED")) {
        throw new Error(`Could not reconcile Victoria row ${item}.`);
      }
      opaqueRemovedRowCount += 1;
      continue;
    }
    const [, aan, pid, , description, redeemable, landRegistered, totalOwing] = cells;
    const totalOwingCents = parseMoneyCents(totalOwing);
    if (
      !/^\d{8}$/u.test(aan) || !/^\d{8}$/u.test(pid) || !description ||
      !["YES", "NO"].includes(redeemable) ||
      !["YES", "NO"].includes(landRegistered) ||
      !Number.isSafeInteger(totalOwingCents)
    ) {
      throw new Error(`Could not parse all owner-free fields for Victoria row ${item}.`);
    }
    listings.push({
      item, aan, pid, description,
      redeemable: redeemable === "YES",
      landRegistered: landRegistered === "YES",
      totalOwingCents,
      listingStatus: "advertised",
    });
  }
  if (sourceRows.length === 0 || listings.length === 0) {
    throw new Error("The Victoria notice contained no complete property rows.");
  }

  const seenItems = new Set();
  const seenAans = new Set();
  const seenPids = new Set();
  for (const { item, aan, pid } of listings) {
    if (seenItems.has(item)) throw new Error(`Duplicate Victoria item ${item}.`);
    if (seenAans.has(aan)) throw new Error(`Duplicate Victoria AAN ${aan}.`);
    if (seenPids.has(pid)) throw new Error(`Duplicate Victoria PID ${pid}.`);
    seenItems.add(item);
    seenAans.add(aan);
    seenPids.add(pid);
  }

  return {
    eventDate: parseDate(eventDateMatch[1], eventDateMatch[2], eventDateMatch[3]),
    bidDeadlineTime: `${deadlineMatch[1].padStart(2, "0")}:${deadlineMatch[2]}`,
    venue: `Municipal Administration Building, ${deadlineMatch[3]}`,
    publishedOn: parseDate(publishedMatch[1], publishedMatch[2], publishedMatch[3]),
    sourceRowCount: sourceRows.length,
    opaqueRemovedRowCount,
    listings,
  };
}

function sha256(contents) {
  return createHash("sha256").update(contents).digest("hex");
}

function halifaxDate(now = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Halifax", year: "numeric", month: "2-digit", day: "2-digit",
    }).formatToParts(now).filter(({ type }) => type !== "literal").map(({ type, value }) => [type, value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function buildSnapshot(current, parsed, archiveReceipt, now = new Date()) {
  const sourceFactsSha256 = sha256(JSON.stringify(parsed));
  const changed = current?.sourceFactsSha256 !== sourceFactsSha256;
  if (changed && !archiveReceipt) {
    throw new Error("A verified Victoria archive receipt is required before changed notice facts can be written.");
  }
  return {
    schemaVersion: 1,
    municipality: "Municipality of the County of Victoria",
    source: SOURCE_URL,
    landingPage: LANDING_PAGE_URL,
    retrievedDate: changed ? halifaxDate(now) : current.retrievedDate,
    publishedOn: parsed.publishedOn,
    sourceFactsSha256,
    sourceHashPolicy: "The overwrite-prone official HTML contains assessed-owner names. This receipt hashes normalized owner-free event and row facts; the external Wayback receipt preserves the full official page bytes before ingestion.",
    archiveReceipt: changed ? archiveReceipt : current.archiveReceipt,
    ownerNamesExcluded: true,
    eventDate: parsed.eventDate,
    bidDeadlineTime: parsed.bidDeadlineTime,
    venue: parsed.venue,
    sourceRowCount: parsed.sourceRowCount,
    opaqueRemovedRowCount: parsed.opaqueRemovedRowCount,
    listingCount: parsed.listings.length,
    parcelIdentifierCount: new Set(parsed.listings.map(({ pid }) => pid)).size,
    listings: parsed.listings.map(
      ({ item, aan, pid, description, redeemable, totalOwingCents, listingStatus }) => ({
        item, aan, pids: [pid], description, redeemable, totalOwingCents, listingStatus,
      }),
    ),
  };
}

export function updateDatasetHash(modelSource, datasetHash) {
  const pattern = /(VICTORIA_TAX_SALE_DATASET_SHA256\s*=\s*\n\s*")([a-f\d]{64})(";)/u;
  if (!pattern.test(modelSource)) throw new Error("Could not find VICTORIA_TAX_SALE_DATASET_SHA256.");
  return modelSource.replace(pattern, `$1${datasetHash}$3`);
}

async function main() {
  const fetchWithTimeout = (url, options = {}) =>
    fetch(url, { ...options, signal: AbortSignal.timeout(20_000) });
  const response = await fetchWithTimeout(SOURCE_URL, {
    headers: { Accept: "text/html", "User-Agent": "NS-Marks-tax-sale-monitor/1.0" },
  });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}: ${SOURCE_URL}`);
  const parsed = parseVictoriaNotice(await response.text());
  const [snapshotSource, modelSource] = await Promise.all([
    readFile(SNAPSHOT_PATH, "utf8").catch((error) => {
      if (error?.code === "ENOENT") return null;
      throw error;
    }),
    readFile(MODEL_PATH, "utf8"),
  ]);
  const current = snapshotSource ? JSON.parse(snapshotSource) : null;
  const sourceFactsSha256 = sha256(JSON.stringify(parsed));
  let archiveReceipt = null;
  if (current?.sourceFactsSha256 !== sourceFactsSha256) {
    const verify = (body) => {
      try {
        return sha256(JSON.stringify(parseVictoriaNotice(body))) === sourceFactsSha256;
      } catch {
        return false;
      }
    };
    let timestamps = await listCaptures(SOURCE_URL, { fetchImpl: fetchWithTimeout });
    archiveReceipt = await findHashableCapture(SOURCE_URL, { fetchImpl: fetchWithTimeout, verify, timestamps });
    if (!archiveReceipt) {
      await submitToWayback(SOURCE_URL, { fetchImpl: fetchWithTimeout });
      timestamps = await listCaptures(SOURCE_URL, { fetchImpl: fetchWithTimeout });
      archiveReceipt = await findHashableCapture(SOURCE_URL, { fetchImpl: fetchWithTimeout, verify, timestamps });
    }
  }
  const snapshot = buildSnapshot(current, parsed, archiveReceipt);
  const nextSnapshotSource = `${JSON.stringify(snapshot, null, 2)}\n`;
  const datasetHash = sha256(nextSnapshotSource);
  await Promise.all([
    writeFile(SNAPSHOT_PATH, nextSnapshotSource),
    writeFile(MODEL_PATH, updateDatasetHash(modelSource, datasetHash)),
  ]);
  console.log(`Checked ${snapshot.listingCount} owner-free Victoria listings plus ${snapshot.opaqueRemovedRowCount} opaque removed row from ${SOURCE_URL}; source-facts SHA-256 ${snapshot.sourceFactsSha256}; dataset SHA-256 ${datasetHash}.`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
