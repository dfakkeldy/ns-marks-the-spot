import { execFile as execFileCallback } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFile = promisify(execFileCallback);
const LANDING_PAGE_URL = "https://www.halifax.ca/home-property/property-taxes/tax-sale";
const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const SNAPSHOT_PATH = resolve(SCRIPT_DIR, "../src/data/halifaxTaxSale.snapshot.json");
const MODEL_PATH = resolve(SCRIPT_DIR, "../src/data/halifaxTaxSale.ts");
const MONTHS = [
  "January", "February", "March", "April", "May", "June", "July",
  "August", "September", "October", "November", "December",
];
export const HALIFAX_GEOMETRY_EXCEPTIONS = [
  { aan: "09417036", pid: "41051889", reason: "no-nsprd-geometry", checkedOn: "2026-08-15" },
  { aan: "09417044", pid: "41051897", reason: "no-nsprd-geometry", checkedOn: "2026-08-15" },
];

function decodeHtml(value) {
  return value
    .replaceAll("&amp;", "&").replaceAll("&quot;", '"').replaceAll("&apos;", "'")
    .replace(/&#(\d+);/gu, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([\da-f]+);/giu, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)));
}

function textContent(value) {
  return decodeHtml(value.replace(/<[^>]+>/gu, " ")).replace(/\s+/gu, " ").trim();
}

function uniqueMatchingUrls(html, pattern) {
  return [...new Set(Array.from(
    html.matchAll(/href=["']([^"']+)["']/giu),
    ([, href]) => String(new URL(decodeHtml(href), LANDING_PAGE_URL)),
  ).filter((url) => pattern.test(new URL(url).pathname)))];
}

export function parseLandingPage(html) {
  const pageText = textContent(html.replace(/<script\b[\s\S]*?<\/script>/giu, " ").replace(/<style\b[\s\S]*?<\/style>/giu, " "));
  const tenderNumbers = [...new Set(pageText.match(/HRM-TaxSale\d+/gu) ?? [])];
  const tenderUrls = uniqueMatchingUrls(html, /\/tender-doc-sept15\.26\.pdf$/iu);
  const scheduleUrls = uniqueMatchingUrls(html, /\/sept15\.2026newspaper\.website-draft-aug-13\.26\.pdf$/iu);
  if (tenderNumbers.length !== 1 || tenderUrls.length !== 1 || scheduleUrls.length !== 1) {
    throw new Error(`Expected one current Halifax tender number, instructions PDF, and Schedule A PDF; found ${tenderNumbers.length}, ${tenderUrls.length}, and ${scheduleUrls.length}.`);
  }
  return { tenderNumber: tenderNumbers[0], tenderUrl: tenderUrls[0], scheduleUrl: scheduleUrls[0] };
}

function parseDate(monthName, day, year) {
  const month = MONTHS.indexOf(monthName) + 1;
  return month === 0 ? null : `${year}-${String(month).padStart(2, "0")}-${String(Number(day)).padStart(2, "0")}`;
}

export function parseTenderText(source, expectedTenderNumber) {
  const text = source.replace(/\s+/gu, " ").trim();
  const dateAndTime = text.match(/(January|February|March|April|May|June|July|August|September|October|November|December) (\d{1,2}), (\d{4}) at (\d{1,2}):(\d{2})\s*(?:a\.?m\.?|am)/iu);
  const tenderNumbers = [...new Set(text.match(/HRM-TaxSale\d+/gu) ?? [])];
  const venueMatch = text.match(/Alderney Customer Service Centre located at (40 Alderney Drive, Dartmouth, Nova Scotia)/iu);
  if (!dateAndTime || !venueMatch || tenderNumbers.length !== 1 || tenderNumbers[0] !== expectedTenderNumber) {
    throw new Error("Could not reconcile the Halifax tender number, deadline, and submission venue.");
  }
  return {
    eventDate: parseDate(dateAndTime[1], dateAndTime[2], dateAndTime[3]),
    bidDeadlineTime: `${dateAndTime[4].padStart(2, "0")}:${dateAndTime[5]}`,
    venue: `Online or Alderney Customer Service Centre, ${venueMatch[1]}`,
  };
}

function parseMoneyCents(value) {
  const match = value.match(/^\$([\d,]+)\.(\d{2})$/u);
  return match ? Number(match[1].replaceAll(",", "")) * 100 + Number(match[2]) : null;
}

export function parseScheduleText(source) {
  const candidateLines = source.split(/\r?\n/u).filter(
    (line) => (line.match(/\b\d{8}\b/gu) ?? []).length >= 2 && /\$[\d,]+\.\d{2}/u.test(line),
  );
  if (candidateLines.some((line) => !/^\d{8}/u.test(line))) {
    throw new Error("The fixed Schedule A columns shifted unexpectedly.");
  }
  const listings = candidateLines.map((line, index) => {
    const item = index + 1;
    const aan = line.slice(0, 8);
    const description = line.slice(130, 196).trim();
    const ownerFreeTail = line.slice(196);
    const pids = ownerFreeTail.match(/\b\d{8}\b/gu) ?? [];
    const amountText = ownerFreeTail.match(/\$[\d,]+\.\d{2}/u)?.[0];
    const flags = ownerFreeTail.match(/\b(?:Yes|No)\b/gu) ?? [];
    const openingBidCents = amountText ? parseMoneyCents(amountText) : null;
    if (!/^\d{8}$/u.test(aan) || !description || pids.length === 0 || !Number.isSafeInteger(openingBidCents) || flags.length !== 2) {
      throw new Error(`Could not parse owner-free Halifax row ${item}.`);
    }
    return {
      item, aan, pids, description, openingBidCents,
      hst: flags[0] === "Yes", redeemable: flags[1] === "Yes",
      listingStatus: "advertised",
    };
  });
  if (listings.length === 0) throw new Error("The Halifax Schedule A contained no complete rows.");
  const seenAans = new Set();
  const seenPids = new Set();
  for (const { aan, pids } of listings) {
    if (seenAans.has(aan)) throw new Error(`Duplicate Halifax AAN ${aan}.`);
    seenAans.add(aan);
    for (const pid of pids) {
      if (seenPids.has(pid)) throw new Error(`Duplicate Halifax PID ${pid}.`);
      seenPids.add(pid);
    }
  }
  return listings;
}

function sha256(contents) {
  return createHash("sha256").update(contents).digest("hex");
}

function halifaxDate(now = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Halifax", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(now).filter(({ type }) => type !== "literal").map(({ type, value }) => [type, value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function reconcileGeometryExceptions(listings) {
  for (const exception of HALIFAX_GEOMETRY_EXCEPTIONS) {
    const listing = listings.find(({ aan }) => aan === exception.aan);
    if (!listing || listing.pids.length !== 1 || listing.pids[0] !== exception.pid) {
      throw new Error(`Could not reconcile Halifax geometry exception AAN ${exception.aan} and PID ${exception.pid}.`);
    }
  }
  return HALIFAX_GEOMETRY_EXCEPTIONS;
}

export function buildSnapshot(current, receipt, tenderBytes, scheduleBytes, now = new Date()) {
  const geometryExceptions = reconcileGeometryExceptions(receipt.listings);
  const exceptionPids = new Set(geometryExceptions.map(({ pid }) => pid));
  const mappedListings = receipt.listings.filter(({ pids }) => pids.every((pid) => !exceptionPids.has(pid)));
  const tenderDocumentSha256 = sha256(tenderBytes);
  const scheduleDocumentSha256 = sha256(scheduleBytes);
  const sourceFactsSha256 = sha256(JSON.stringify(receipt));
  const changed = current?.sourceFactsSha256 !== sourceFactsSha256 || current?.tenderDocumentSha256 !== tenderDocumentSha256 || current?.scheduleDocumentSha256 !== scheduleDocumentSha256;
  return {
    schemaVersion: 1,
    municipality: "Halifax Regional Municipality",
    source: receipt.scheduleUrl,
    landingPage: LANDING_PAGE_URL,
    tenderInstructions: receipt.tenderUrl,
    retrievedDate: changed ? halifaxDate(now) : current.retrievedDate,
    tenderNumber: receipt.tenderNumber,
    tenderDocumentSha256,
    scheduleDocumentSha256,
    sourceFactsSha256,
    sourceHashPolicy: "Both dated official PDFs contain assessed-owner names. This receipt hashes the source bytes and normalized owner-free facts; the PDFs themselves are not committed.",
    ownerNamesExcluded: true,
    eventDate: receipt.eventDate,
    bidDeadlineTime: receipt.bidDeadlineTime,
    venue: receipt.venue,
    sourceRowCount: receipt.listings.length,
    listingCount: receipt.listings.length,
    parcelIdentifierCount: new Set(receipt.listings.flatMap(({ pids }) => pids)).size,
    mappedListingCount: mappedListings.length,
    mappedParcelIdentifierCount: new Set(mappedListings.flatMap(({ pids }) => pids)).size,
    hstYesCount: receipt.listings.filter(({ hst }) => hst).length,
    notRedeemableCount: receipt.listings.filter(({ redeemable }) => !redeemable).length,
    geometryExceptions,
    listings: receipt.listings.map(({ item, aan, pids, description, openingBidCents, redeemable, listingStatus }) => ({
      item, aan, pids, description, openingBidCents, redeemable, listingStatus,
    })),
  };
}

export function updateDatasetHash(modelSource, datasetHash) {
  const pattern = /(HALIFAX_TAX_SALE_DATASET_SHA256\s*=\s*\n\s*")([a-f\d]{64})(";)/u;
  if (!pattern.test(modelSource)) throw new Error("Could not find HALIFAX_TAX_SALE_DATASET_SHA256.");
  return modelSource.replace(pattern, `$1${datasetHash}$3`);
}

async function pdfText(pdfBytes) {
  const directory = await mkdtemp(join(tmpdir(), "ns-marks-halifax-tax-sale-"));
  const pdfPath = join(directory, "source.pdf");
  try {
    await writeFile(pdfPath, pdfBytes);
    return (await execFile("pdftotext", ["-layout", pdfPath, "-"])).stdout;
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

async function fetchBytes(url) {
  const response = await fetch(url, {
    headers: { Accept: "application/pdf", "User-Agent": "NS-Marks-tax-sale-monitor/1.0" },
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}: ${url}`);
  return Buffer.from(await response.arrayBuffer());
}

async function main() {
  const landingResponse = await fetch(LANDING_PAGE_URL, {
    headers: { Accept: "text/html", "User-Agent": "NS-Marks-tax-sale-monitor/1.0" },
    signal: AbortSignal.timeout(30_000),
  });
  if (!landingResponse.ok) throw new Error(`${landingResponse.status} ${landingResponse.statusText}: ${LANDING_PAGE_URL}`);
  const landing = parseLandingPage(await landingResponse.text());
  const [tenderBytes, scheduleBytes, currentSource, modelSource] = await Promise.all([
    fetchBytes(landing.tenderUrl), fetchBytes(landing.scheduleUrl),
    readFile(SNAPSHOT_PATH, "utf8").catch((error) => {
      if (error?.code === "ENOENT") return null;
      throw error;
    }),
    readFile(MODEL_PATH, "utf8"),
  ]);
  const [tenderText, scheduleText] = await Promise.all([pdfText(tenderBytes), pdfText(scheduleBytes)]);
  const tender = parseTenderText(tenderText, landing.tenderNumber);
  const listings = parseScheduleText(scheduleText);
  if (listings.length !== 31) throw new Error(`Expected 31 Halifax Schedule A rows, found ${listings.length}.`);
  const pidCount = new Set(listings.flatMap(({ pids }) => pids)).size;
  if (pidCount !== 32) throw new Error(`Expected 32 Halifax Schedule A PIDs, found ${pidCount}.`);
  const receipt = { ...landing, ...tender, listings };
  const current = currentSource ? JSON.parse(currentSource) : null;
  const snapshot = buildSnapshot(current, receipt, tenderBytes, scheduleBytes);
  const nextSnapshotSource = `${JSON.stringify(snapshot, null, 2)}\n`;
  const datasetHash = sha256(nextSnapshotSource);
  await Promise.all([
    writeFile(SNAPSHOT_PATH, nextSnapshotSource),
    writeFile(MODEL_PATH, updateDatasetHash(modelSource, datasetHash)),
  ]);
  console.log(`Checked ${snapshot.listingCount} owner-free Halifax listings with ${snapshot.parcelIdentifierCount} official PIDs; ${snapshot.mappedListingCount} rows / ${snapshot.mappedParcelIdentifierCount} PIDs mapped and ${snapshot.geometryExceptions.length} rows declared unavailable in NSPRD; tender SHA-256 ${snapshot.tenderDocumentSha256}; schedule SHA-256 ${snapshot.scheduleDocumentSha256}; dataset SHA-256 ${datasetHash}.`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
