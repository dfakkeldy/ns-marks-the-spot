import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SOURCE_URL =
  "https://www.discovermiddleton.ca/property-tax-sale-information";
const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const SNAPSHOT_PATH = resolve(
  SCRIPT_DIR,
  "../src/data/middletonTaxSale.snapshot.json",
);
const MODEL_PATH = resolve(SCRIPT_DIR, "../src/data/middletonTaxSale.ts");

function decodeHtml(value) {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'")
    .replaceAll("&nbsp;", " ")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([\da-f]+);/gi, (_, code) =>
      String.fromCodePoint(Number.parseInt(code, 16)),
    );
}

function textContent(value) {
  return decodeHtml(value.replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

function parseMoneyCents(value) {
  const match = value.match(/^\$([\d,]+)\.(\d{2})$/);
  if (!match) {
    return null;
  }
  return Number(match[1].replaceAll(",", "")) * 100 + Number(match[2]);
}

function parseRows(tableHtml) {
  return Array.from(
    tableHtml.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi),
    ([, row]) =>
      Array.from(
        row.matchAll(/<t[hd]\b[^>]*>([\s\S]*?)<\/t[hd]>/gi),
        ([, cell]) => textContent(cell),
      ),
  );
}

export function parseMiddletonNotice(html) {
  const pageText = textContent(
    html
      .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[\s\S]*?<\/style>/gi, " "),
  );
  const dateMatch = pageText.match(
    /\b(January|February|March|April|May|June|July|August|September|October|November|December) (\d{1,2}), (\d{4}) Property Tax Sale\b/,
  );
  const timeMatch = pageText.match(/\bTime:\s*(\d{1,2}:\d{2})\s*(am|pm)\b/i);
  const venueMatch = pageText.match(/\bLocation:\s*(.+?)\s+Time:/i);
  if (!dateMatch || !timeMatch || !venueMatch) {
    throw new Error("Could not parse the Middleton sale date, time, and venue.");
  }

  const month = String(
    [
      "January",
      "February",
      "March",
      "April",
      "May",
      "June",
      "July",
      "August",
      "September",
      "October",
      "November",
      "December",
    ].indexOf(dateMatch[1]) + 1,
  ).padStart(2, "0");
  const eventDate = `${dateMatch[3]}-${month}-${dateMatch[2].padStart(2, "0")}`;
  const tableMatches = Array.from(
    html.matchAll(/<table\b[^>]*>([\s\S]*?)<\/table>/gi),
    ([, table]) => parseRows(table),
  );
  const requiredHeaders = [
    "Civic Address",
    "PID",
    "Assessed Owner",
    "Total Due",
    "AAN",
    "Redeemable",
  ];
  const tables = tableMatches.filter(
    ([headers]) => JSON.stringify(headers) === JSON.stringify(requiredHeaders),
  );
  if (tables.length !== 1) {
    throw new Error(
      `Expected one Middleton tax-sale property table, found ${tables.length}.`,
    );
  }

  const listings = [];
  for (const cells of tables[0].slice(1)) {
    if (cells.every((value) => value === "")) {
      continue;
    }
    const rowNumber = listings.length + 1;
    const [address, pid, , totalDue, aan, redeemable] = cells;
    const totalDueCents = parseMoneyCents(totalDue);
    if (
      cells.length !== requiredHeaders.length ||
      !address ||
      !/^\d{8}$/.test(pid) ||
      !/^\d{8}$/.test(aan) ||
      !Number.isSafeInteger(totalDueCents) ||
      !["Y", "N"].includes(redeemable)
    ) {
      throw new Error(
        `Could not parse all owner-free fields for Middleton row ${rowNumber}.`,
      );
    }
    listings.push({
      address,
      pid,
      aan,
      totalDueCents,
      redeemable: redeemable === "Y",
      listingStatus: "advertised",
    });
  }
  if (listings.length === 0) {
    throw new Error("The Middleton notice contained no complete property rows.");
  }

  const seenPids = new Set();
  const seenAans = new Set();
  for (const { pid, aan } of listings) {
    if (seenPids.has(pid)) {
      throw new Error(`Duplicate Middleton PID ${pid}.`);
    }
    if (seenAans.has(aan)) {
      throw new Error(`Duplicate Middleton AAN ${aan}.`);
    }
    seenPids.add(pid);
    seenAans.add(aan);
  }

  return {
    eventDate,
    saleTime: timeMatch[1],
    venue: venueMatch[1].trim(),
    listings,
  };
}

function sha256(contents) {
  return createHash("sha256").update(contents).digest("hex");
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

export function buildSnapshot(current, parsed, now = new Date()) {
  const sourceFactsSha256 = sha256(JSON.stringify(parsed));
  const changed = current?.sourceFactsSha256 !== sourceFactsSha256;
  return {
    schemaVersion: 1,
    municipality: "Town of Middleton",
    source: SOURCE_URL,
    retrievedDate: changed ? halifaxDate(now) : current.retrievedDate,
    sourceFactsSha256,
    sourceHashPolicy:
      "The official HTML varies per request; this receipt hashes normalized owner-free event and listing facts instead of unstable page bytes.",
    ownerNamesExcluded: true,
    eventDate: parsed.eventDate,
    saleTime: parsed.saleTime,
    venue: parsed.venue,
    listingCount: parsed.listings.length,
    parcelIdentifierCount: new Set(parsed.listings.map(({ pid }) => pid)).size,
    listings: parsed.listings.map((listing, index) => ({
      item: index + 1,
      address: listing.address,
      pids: [listing.pid],
      aan: listing.aan,
      totalDueCents: listing.totalDueCents,
      redeemable: listing.redeemable,
      listingStatus: listing.listingStatus,
    })),
  };
}

export function updateDatasetHash(modelSource, datasetHash) {
  const pattern =
    /(MIDDLETON_TAX_SALE_DATASET_SHA256\s*=\s*\n\s*")([a-f\d]{64})(";)/;
  if (!modelSource.match(pattern)) {
    throw new Error("Could not find MIDDLETON_TAX_SALE_DATASET_SHA256.");
  }
  return modelSource.replace(pattern, `$1${datasetHash}$3`);
}

async function main() {
  const response = await fetch(SOURCE_URL, {
    headers: {
      Accept: "text/html",
      "User-Agent": "NS-Marks-tax-sale-monitor/1.0",
    },
  });
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}: ${SOURCE_URL}`);
  }
  const html = await response.text();
  const parsed = parseMiddletonNotice(html);
  const [snapshotSource, modelSource] = await Promise.all([
    readFile(SNAPSHOT_PATH, "utf8"),
    readFile(MODEL_PATH, "utf8"),
  ]);
  const snapshot = buildSnapshot(JSON.parse(snapshotSource), parsed);
  const nextSnapshotSource = `${JSON.stringify(snapshot, null, 2)}\n`;
  const datasetHash = sha256(nextSnapshotSource);
  const nextModelSource = updateDatasetHash(modelSource, datasetHash);
  await Promise.all([
    writeFile(SNAPSHOT_PATH, nextSnapshotSource),
    writeFile(MODEL_PATH, nextModelSource),
  ]);
  console.log(
    `Checked ${snapshot.listingCount} owner-free Middleton listings from ${SOURCE_URL}; source-facts SHA-256 ${snapshot.sourceFactsSha256}; dataset SHA-256 ${datasetHash}.`,
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
