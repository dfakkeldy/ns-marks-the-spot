import { execFile as execFileCallback } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import {
  findHashableCapture,
  listCaptures,
  submitToWayback,
} from "./taxSaleWatch/archive.mjs";
import {
  formatDataset,
  formatLedger,
} from "./taxSaleWatch/dataset.mjs";

const execFile = promisify(execFileCallback);
const SOURCE_URL = "https://victoriacounty.com/property-tax-sale-notice/";
const LANDING_PAGE_URL =
  "https://victoriacounty.com/residents/property-taxation-services/tax-sales/";
const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const SNAPSHOT_PATH = resolve(SCRIPT_DIR, "../src/data/victoriaTaxSale.snapshot.json");
const RESULT_SNAPSHOT_PATH = resolve(
  SCRIPT_DIR,
  "../src/data/victoriaTaxSaleResults.snapshot.json",
);
const MODEL_PATH = resolve(SCRIPT_DIR, "../src/data/victoriaTaxSale.ts");
const HISTORICAL_DATASET_PATH = resolve(
  SCRIPT_DIR,
  "../src/data/historicalTaxSales.json",
);
const HISTORICAL_LEDGER_PATH = resolve(
  SCRIPT_DIR,
  "../src/data/historicalSourceLedger.json",
);
const HISTORICAL_MODEL_PATH = resolve(
  SCRIPT_DIR,
  "../src/data/historicalTaxSales.ts",
);
const MONTHS = [
  "January", "February", "March", "April", "May", "June", "July",
  "August", "September", "October", "November", "December",
];
const REQUIRED_HEADERS = [
  "#", "AAN", "PID", "ASSESSED TO", "PROPERTY DESCRIPTION", "REDEEMABLE",
  "LAND REGISTERED", "TOTAL OWING",
];
const EMPTY_NOTICE_PATTERN =
  /There are no property tax sale notices at this time/iu;

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

function pageText(html) {
  return textContent(
    html
      .replace(/<script\b[\s\S]*?<\/script>/giu, " ")
      .replace(/<style\b[\s\S]*?<\/style>/giu, " "),
  );
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
  const match = String(value).match(/^\$?\s*([\d,]+)\.(\d{2})(?:\s*\+\s*hst)?$/iu);
  return match
    ? Number(match[1].replaceAll(",", "")) * 100 + Number(match[2])
    : null;
}

function noticeTables(html) {
  return Array.from(
    html.matchAll(/<table\b[^>]*>([\s\S]*?)<\/table>/giu),
    ([, table]) => parseRows(table),
  ).filter(([headers]) => JSON.stringify(headers) === JSON.stringify(REQUIRED_HEADERS));
}

export function parseVictoriaNotice(html) {
  const page = pageText(html);
  const eventDateMatch = page.match(
    /TAX SALE BY TENDER\s+(January|February|March|April|May|June|July|August|September|October|November|December) (\d{1,2}), (\d{4})/u,
  );
  const deadlineMatch = page.match(
    /received by (\d{1,2}):(\d{2}) noon at the Municipal Administration Building \(([^)]+)\)/iu,
  );
  const publishedMatch = page.match(
    /Dated at Baddeck, N\.S\. (January|February|March|April|May|June|July|August|September|October|November|December) (\d{1,2}), (\d{4})/u,
  );
  if (!eventDateMatch || !deadlineMatch || !publishedMatch) {
    throw new Error("Could not parse the Victoria sale date, bid deadline, venue, and publication date.");
  }

  const tables = noticeTables(html);
  if (tables.length !== 1) {
    throw new Error(`Expected one Victoria tax-sale property table, found ${tables.length}.`);
  }

  const sourceRows = tables[0].slice(1).filter((cells) => cells.some(Boolean));
  const listings = [];
  let opaqueRemovedRowCount = 0;
  for (const cells of sourceRows) {
    const item = Number(cells[0]);
    if (!Number.isSafeInteger(item) || cells.length !== REQUIRED_HEADERS.length) {
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

export function classifyVictoriaPage(html) {
  const empty = EMPTY_NOTICE_PATTERN.test(pageText(html));
  const tables = noticeTables(html);
  if (empty && tables.length === 0) {
    return { kind: "empty-notice" };
  }
  if (empty) {
    throw new Error(
      "Victoria page mixes an empty-notice statement with a property table; refusing to guess.",
    );
  }
  return { kind: "current-notice", parsed: parseVictoriaNotice(html) };
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

export function updateResultDatasetHash(modelSource, datasetHash) {
  const existing =
    /(VICTORIA_TAX_SALE_RESULT_DATASET_SHA256\s*=\s*\n\s*")([a-f\d]{64})(";)/u;
  if (existing.test(modelSource)) {
    return modelSource.replace(existing, `$1${datasetHash}$3`);
  }
  const notice =
    /(VICTORIA_TAX_SALE_DATASET_SHA256\s*=\s*\n\s*")([a-f\d]{64})(";\n)/u;
  if (!notice.test(modelSource)) {
    throw new Error("Could not find VICTORIA_TAX_SALE_DATASET_SHA256.");
  }
  return modelSource.replace(
    notice,
    `$1$2$3export const VICTORIA_TAX_SALE_RESULT_DATASET_SHA256 =\n  "${datasetHash}";\n`,
  );
}

export function updateEventStatus(modelSource, status) {
  const pattern = /(eventStatus:\s*")(upcoming|historical)(")/u;
  if (!pattern.test(modelSource)) {
    throw new Error("Could not find Victoria eventStatus.");
  }
  return modelSource.replace(pattern, `$1${status}$3`);
}

function updateHistoricalDatasetHash(modelSource, datasetHash) {
  const pattern = /(HISTORICAL_DATASET_SHA256\s*=\s*\n\s*")([a-f\d]{64})(";)/u;
  if (!pattern.test(modelSource)) {
    throw new Error("Could not find HISTORICAL_DATASET_SHA256.");
  }
  return modelSource.replace(pattern, `$1${datasetHash}$3`);
}

export function parseBboxWords(bboxHtml) {
  return Array.from(
    bboxHtml.matchAll(
      /<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">([\s\S]*?)<\/word>/gu,
    ),
    ([, xMin, yMin, xMax, yMax, value]) => ({
      xMin: Number(xMin),
      yMin: Number(yMin),
      xMax: Number(xMax),
      yMax: Number(yMax),
      value: decodeHtml(value.replace(/<[^>]+>/gu, "")),
    }),
  );
}

function headerWord(words, label) {
  const matches = words.filter(({ value }) => value === label);
  if (matches.length !== 1) {
    throw new Error(`Expected one Victoria results header "${label}", found ${matches.length}.`);
  }
  return matches[0];
}

function clusterRows(words) {
  const rows = [];
  for (const word of [...words].sort((left, right) => left.yMin - right.yMin || left.xMin - right.xMin)) {
    const current = rows.at(-1);
    if (!current || word.yMin - current.yMin > 3) {
      rows.push({ yMin: word.yMin, words: [word] });
    } else {
      current.words.push(word);
    }
  }
  return rows;
}

function columnOf(x, headers) {
  const locOwingSplit = headers.location.xMin + (headers.hst.xMin - headers.location.xMin) * 0.55;
  if (x < locOwingSplit) return "location";
  if (x < headers.hst.xMin - 10) return "owing";
  if (x < (headers.hst.xMin + headers.status.xMin) / 2) return "hst";
  if (x < (headers.status.xMin + headers.redeemable.xMin) / 2) return "status";
  if (x < (headers.redeemable.xMin + headers.successful.xMin) / 2) return "redeemable";
  return "bid";
}

function joinColumn(row, column) {
  return row.words
    .filter((word) => word.column === column)
    .sort((left, right) => left.xMin - right.xMin)
    .map(({ value }) => value)
    .join(" ")
    .replace(/\s+/gu, " ")
    .trim();
}

function parseBidCents(value) {
  if (!value || value === "$ -" || value === "-" || value === "$") return null;
  const cents = parseMoneyCents(value.replace(/^\$\s+/u, "$"));
  if (cents === null) {
    throw new Error(`Unrecognized Victoria successful-bid value "${value}".`);
  }
  return cents;
}

function parseOwingCents(value) {
  if (!value || value === "N/A") return null;
  const cents = parseMoneyCents(value.replace(/^\$\s+/u, "$"));
  if (cents === null) {
    throw new Error(`Unrecognized Victoria total-owing value "${value}".`);
  }
  return cents;
}

function yesNo(value, label) {
  if (value === "YES") return true;
  if (value === "NO") return false;
  throw new Error(`Unrecognized Victoria ${label} value "${value}".`);
}

function classifyResultRow({ location, owing, hst, status, redeemable, bid }, rowNumber) {
  const totalOwingCents = parseOwingCents(owing);
  const winningBidCents = parseBidCents(bid);
  if (status === "SOLD") {
    if (totalOwingCents === null || winningBidCents === null) {
      throw new Error(`Victoria result row ${rowNumber} prints SOLD without a total owing and successful bid.`);
    }
    return {
      rowNumber,
      location,
      totalOwingCents,
      hst: yesNo(hst, "HST"),
      redeemable: yesNo(redeemable, "redeemable"),
      winningBidCents,
      outcome: "sold",
    };
  }
  if (status === "NOT SOLD") {
    if (totalOwingCents === null || winningBidCents !== null) {
      throw new Error(`Victoria result row ${rowNumber} prints NOT SOLD without a total owing and blank successful bid.`);
    }
    return {
      rowNumber,
      location,
      totalOwingCents,
      hst: yesNo(hst, "HST"),
      redeemable: yesNo(redeemable, "redeemable"),
      winningBidCents: null,
      outcome: "unsold",
    };
  }
  if (status === "REMOVED") {
    if (totalOwingCents !== null || winningBidCents !== null || redeemable !== "N/A") {
      throw new Error(`Victoria result row ${rowNumber} prints REMOVED beside parcel facts; refusing to guess.`);
    }
    return {
      rowNumber,
      location,
      totalOwingCents: null,
      hst: null,
      redeemable: null,
      winningBidCents: null,
      outcome: "withdrawn",
    };
  }
  if (!status && totalOwingCents === null && winningBidCents === null && redeemable === "N/A") {
    return {
      rowNumber,
      location,
      totalOwingCents: null,
      hst: null,
      redeemable: null,
      winningBidCents: null,
      outcome: "unspecified",
    };
  }
  throw new Error(`Unrecognized Victoria result status "${status || ""}" on row ${rowNumber}.`);
}

export function parseVictoriaResultBbox(bboxHtml) {
  const words = parseBboxWords(bboxHtml);
  if (words.length === 0) {
    throw new Error("The Victoria results PDF contained no extractable text.");
  }
  const headers = {
    location: headerWord(words, "LOCATION"),
    hst: headerWord(words, "HST"),
    status: headerWord(words, "STATUS"),
    redeemable: headerWord(words, "REDEEMABLE"),
    successful: headerWord(words, "SUCCESSFUL"),
  };
  const title = words.map(({ value }) => value).join(" ");
  const dateMatch = title.match(
    /TAX SALE RESULTS\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),?\s+(\d{4})/u,
  );
  if (!dateMatch) {
    throw new Error("Could not parse the Victoria results sale date.");
  }
  const saleDate = parseDate(dateMatch[1], dateMatch[2], dateMatch[3]);
  const rows = clusterRows(words).map((row) => ({
    yMin: row.yMin,
    words: row.words.map((word) => ({ ...word, column: columnOf(word.xMin, headers) })),
  }));
  const results = [];
  for (const row of rows) {
    const location = joinColumn(row, "location");
    const owing = joinColumn(row, "owing");
    const hst = joinColumn(row, "hst");
    const status = joinColumn(row, "status");
    const redeemable = joinColumn(row, "redeemable");
    const bid = joinColumn(row, "bid");
    if (!location || location === "LOCATION") continue;
    if (owing === "TOTAL" || owing === "OWING") continue;
    results.push(classifyResultRow(
      { location, owing, hst, status, redeemable, bid },
      results.length + 1,
    ));
  }
  if (results.length === 0) {
    throw new Error("The Victoria results PDF contained no property rows.");
  }
  return { saleDate, results };
}

export function normalizeLocation(value) {
  return String(value).toLowerCase().replace(/\s+/gu, " ").trim();
}

export function locationAgrees(resultLocation, noticeDescription) {
  const result = normalizeLocation(resultLocation);
  const notice = normalizeLocation(noticeDescription);
  return notice === result || notice.startsWith(`${result} `) || notice.startsWith(`${result},`);
}

export function reconcileVictoriaResults(notice, parsed) {
  if (parsed.saleDate !== notice.eventDate) {
    throw new Error(
      `Victoria results sale date ${parsed.saleDate} does not match the retained notice ${notice.eventDate}.`,
    );
  }
  const mappedOutcomes = new Set(["sold", "unsold"]);
  const identifiable = parsed.results.filter(({ outcome }) => mappedOutcomes.has(outcome));
  const records = notice.listings.map((listing) => {
    const matches = identifiable.filter(
      ({ totalOwingCents }) => totalOwingCents === listing.totalOwingCents,
    );
    if (matches.length !== 1) {
      throw new Error(
        `Victoria notice item ${listing.item} did not match exactly one identifiable result row.`,
      );
    }
    const matched = matches[0];
    if (!locationAgrees(matched.location, listing.description)) {
      throw new Error(
        `Victoria notice item ${listing.item} amount matched a result whose location disagrees.`,
      );
    }
    if (matched.redeemable !== listing.redeemable) {
      throw new Error(
        `Victoria notice item ${listing.item} redemption state disagrees with the official result.`,
      );
    }
    return {
      listing,
      result: matched,
    };
  });
  if (identifiable.length !== records.length) {
    throw new Error(
      "Victoria results include identifiable rows that do not match the retained notice listings.",
    );
  }
  return records;
}

function officialPdfUrls(html, pattern) {
  const origin = new URL(LANDING_PAGE_URL).origin;
  return [...new Set(Array.from(
    html.matchAll(/href=["']([^"']+)["']/giu),
    ([, href]) => {
      try {
        return String(new URL(decodeHtml(href), LANDING_PAGE_URL));
      } catch {
        return null;
      }
    },
  ).filter((url) => {
    if (!url) return false;
    const parsed = new URL(url);
    return parsed.origin === origin && pattern.test(parsed.pathname);
  }))];
}

export function resultPdfPattern(eventDate) {
  const [year, month, day] = eventDate.split("-");
  const monthName = MONTHS[Number(month) - 1];
  return new RegExp(
    `/Tax-Sale-Results(?:-for)?-${monthName}-${Number(day)}-${year}\\.pdf$`,
    "iu",
  );
}

export function termsPdfPattern(eventDate) {
  const [year, month, day] = eventDate.split("-");
  const monthAbbrev = MONTHS[Number(month) - 1].slice(0, 3).toUpperCase();
  return new RegExp(
    `/TERMS-FOR-TENDER-BIDS-FOR-TAX-SALE-${monthAbbrev}T?-${String(Number(day)).padStart(2, "0")}-${year}\\.pdf$`,
    "iu",
  );
}

export function findVictoriaResultPdf(html, eventDate) {
  const urls = officialPdfUrls(html, resultPdfPattern(eventDate));
  if (urls.length !== 1) {
    throw new Error(
      `Expected one Victoria results PDF for ${eventDate}, found ${urls.length}.`,
    );
  }
  return urls[0];
}

export function findVictoriaTermsPdf(html, eventDate) {
  const urls = officialPdfUrls(html, termsPdfPattern(eventDate));
  if (urls.length > 1) {
    throw new Error(
      `Expected at most one Victoria terms PDF for ${eventDate}, found ${urls.length}.`,
    );
  }
  return urls[0] ?? null;
}

export function buildVictoriaResultSnapshot(notice, parsed, resultUrl, pdfSha256, now = new Date()) {
  const matched = parsed.results.filter(({ outcome }) => outcome === "sold" || outcome === "unsold");
  return {
    schemaVersion: 1,
    eventId: `victoria-${notice.eventDate}`,
    municipality: notice.municipality,
    source: resultUrl,
    landingPage: LANDING_PAGE_URL,
    retrievedDate: halifaxDate(now),
    saleDate: parsed.saleDate,
    sourceDocumentSha256: pdfSha256,
    ownerNamesExcluded: true,
    resultRowCount: parsed.results.length,
    matchedNoticeListingCount: matched.length,
    opaqueRemovedRowCount: parsed.results.filter(({ outcome }) => outcome === "withdrawn").length,
    unspecifiedRowCount: parsed.results.filter(({ outcome }) => outcome === "unspecified").length,
    results: parsed.results.map((row) => ({
      rowNumber: row.rowNumber,
      location: row.location,
      totalOwingCents: row.totalOwingCents,
      hst: row.hst,
      redeemable: row.redeemable,
      winningBidCents: row.winningBidCents,
      outcome: row.outcome,
    })),
  };
}

export function buildVictoriaHistoricalAddition(notice, resultSnapshot, matches, termsUrl) {
  const eventId = resultSnapshot.eventId;
  const records = matches.map(({ listing, result }) => ({
    eventId,
    recordId: `${eventId}-aan-${listing.aan}`,
    listingIdentifier: listing.aan,
    pids: listing.pids,
    civicDescription: listing.description,
    advertisedAmountCents: listing.totalOwingCents,
    winningBidCents: result.winningBidCents,
    outcome: result.outcome,
    resultNote:
      result.outcome === "unsold"
        ? "Official result: NOT SOLD."
        : "Official result: SOLD.",
    redemptionLabel: listing.redeemable ? "Redeemable - Yes" : "Redeemable - No",
    nspMatchStatus: "matched",
    nspMatchMethod: "exact-official-pid",
    reviewState: "notice-verified",
  }));
  const sold = records.filter(({ outcome }) => outcome === "sold").length;
  const unsold = records.filter(({ outcome }) => outcome === "unsold").length;
  const event = {
    id: eventId,
    municipalityId: "victoria-county",
    municipality: notice.municipality,
    shortMunicipality: "Victoria County",
    saleDate: resultSnapshot.saleDate,
    saleMethod: "sealed-tender",
    listingIdentifierLabel: "AAN",
    advertisedAmountLabel: "Total Owing",
    currency: "CAD",
    resultStatus: "verified",
    noticeUrl: notice.archiveReceipt.url,
    ...(termsUrl ? { termsUrl } : {}),
    landingPageUrl: LANDING_PAGE_URL,
    resultUrl: resultSnapshot.source,
    retrievedOn: resultSnapshot.retrievedDate,
    noticeSnapshotDate: notice.retrievedDate,
    resultSnapshotDate: resultSnapshot.retrievedDate,
    noticeSha256: notice.archiveReceipt.sha256,
    resultSha256: resultSnapshot.sourceDocumentSha256,
    sourceNotes:
      `The official ${resultSnapshot.resultRowCount}-row ${notice.eventDate} sealed-tender result PDF was parsed without assessed-owner fields. ${sold} rows print SOLD with a numeric successful bid and ${unsold} print NOT SOLD; each matches exactly one retained notice listing by unique total owing and location prefix, using the archived notice PID. ${resultSnapshot.opaqueRemovedRowCount} REMOVED rows and ${resultSnapshot.unspecifiedRowCount} row with no printed status publish no Total Owing and are excluded. The live notice page now prints that no property tax sale notices exist.`,
  };
  const ledgerEntry = {
    municipality: notice.municipality,
    event: "September 14, 2026 tax sale by tender",
    status: "included",
    officialUrls: [
      LANDING_PAGE_URL,
      SOURCE_URL,
      notice.archiveReceipt.url,
      resultSnapshot.source,
      ...(termsUrl ? [termsUrl] : []),
    ],
    documentSha256: [
      notice.archiveReceipt.sha256,
      resultSnapshot.sourceDocumentSha256,
    ],
    fieldsAvailable: [
      "notice AAN",
      "notice PID",
      "location",
      "Total Owing",
      "HST",
      "status",
      "redeemable",
      "Successful Bid",
    ],
    officialWinningBidsFound: sold > 0,
    notes:
      `${records.length} exact-PID notice rows were reconciled by unique official Total Owing and location prefix; ${sold} print SOLD and ${unsold} print NOT SOLD. ${resultSnapshot.opaqueRemovedRowCount} REMOVED rows and ${resultSnapshot.unspecifiedRowCount} row with no printed status publish no Total Owing and remain outside the map dataset. The assessed-name column is absent from the result PDF and was never copied from the archived notice.`,
  };
  return { event, records, ledgerEntry };
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
  const expected = new Set(pids);
  const missing = [...expected].filter((pid) => !returned.has(pid));
  if (missing.length > 0 || returned.size !== expected.size) {
    throw new Error(
      `Victoria PID reconciliation failed: missing ${missing.join(", ") || "none"}; expected ${expected.size}, returned ${returned.size}.`,
    );
  }
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

async function readJsonIfPresent(path) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    if (error && typeof error === "object" && error.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

async function pdfBbox(pdfBytes) {
  const temporaryDirectory = await mkdtemp(join(tmpdir(), "victoria-tax-sale-"));
  try {
    const pdfPath = resolve(temporaryDirectory, "results.pdf");
    const bboxPath = resolve(temporaryDirectory, "results.html");
    await writeFile(pdfPath, pdfBytes);
    await execFile("pdftotext", ["-bbox", pdfPath, bboxPath]);
    return readFile(bboxPath, "utf8");
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}

async function fetchOk(url, accept) {
  const response = await fetch(url, {
    headers: { Accept: accept, "User-Agent": "NS-Marks-tax-sale-monitor/1.0" },
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}: ${url}`);
  return response;
}

function snapshotsEquivalent(left, right) {
  const { retrievedDate: _leftDate, ...leftRest } = left;
  const { retrievedDate: _rightDate, ...rightRest } = right;
  return JSON.stringify(leftRest) === JSON.stringify(rightRest);
}

async function ingestVictoriaResults(notice, modelSource) {
  const landingHtml = await (await fetchOk(LANDING_PAGE_URL, "text/html")).text();
  const resultUrl = findVictoriaResultPdf(landingHtml, notice.eventDate);
  const termsUrl = findVictoriaTermsPdf(landingHtml, notice.eventDate);
  const pdfBytes = Buffer.from(
    await (await fetchOk(resultUrl, "application/pdf")).arrayBuffer(),
  );
  const parsed = parseVictoriaResultBbox(await pdfBbox(pdfBytes));
  const matches = reconcileVictoriaResults(notice, parsed);
  const pdfSha256 = sha256(pdfBytes);
  const resultSnapshot = buildVictoriaResultSnapshot(notice, parsed, resultUrl, pdfSha256);
  const resultSnapshotSource = `${JSON.stringify(resultSnapshot, null, 2)}\n`;
  const resultDatasetHash = sha256(resultSnapshotSource);
  const addition = buildVictoriaHistoricalAddition(
    notice,
    resultSnapshot,
    matches,
    termsUrl,
  );
  const currentResult = await readJsonIfPresent(RESULT_SNAPSHOT_PATH);
  const [dataset, ledger, historicalModelSource] = await Promise.all([
    readJson(HISTORICAL_DATASET_PATH),
    readJson(HISTORICAL_LEDGER_PATH),
    readFile(HISTORICAL_MODEL_PATH, "utf8"),
  ]);
  const existingEvent = dataset.events.find(({ id }) => id === addition.event.id);
  const existingRecords = dataset.records.filter(
    ({ eventId }) => eventId === addition.event.id,
  );
  if (existingEvent) {
    const comparableEvent = { ...addition.event, retrievedOn: existingEvent.retrievedOn, resultSnapshotDate: existingEvent.resultSnapshotDate };
    if (
      JSON.stringify(existingEvent) !== JSON.stringify(comparableEvent) &&
      JSON.stringify(existingEvent) !== JSON.stringify(addition.event)
    ) {
      throw new Error(
        `${addition.event.id} changed after ingestion; refusing to rewrite the verified event automatically.`,
      );
    }
    if (JSON.stringify(existingRecords) !== JSON.stringify(addition.records)) {
      throw new Error(
        `${addition.event.id} records changed after ingestion; refusing to rewrite the verified event automatically.`,
      );
    }
    if (currentResult && !snapshotsEquivalent(currentResult, resultSnapshot)) {
      throw new Error(
        `${addition.event.id} result snapshot changed after ingestion; refusing to rewrite automatically.`,
      );
    }
    const nextModel = updateEventStatus(
      updateResultDatasetHash(modelSource, currentResult
        ? sha256(`${JSON.stringify(currentResult, null, 2)}\n`)
        : resultDatasetHash),
      "historical",
    );
    await writeFile(MODEL_PATH, nextModel);
    console.log(
      `Victoria ${notice.eventDate} results already ingested (${addition.records.length} exact-PID rows); retaining historical event ${addition.event.id}.`,
    );
    return;
  }
  await validateExactPids(addition.records.flatMap(({ pids }) => pids));
  dataset.events.push(addition.event);
  dataset.records.push(...addition.records);
  ledger.retrievedOn = resultSnapshot.retrievedDate;
  ledger.coverage.push(addition.ledgerEntry);
  const updatedDataset = formatDataset(dataset);
  const nextModel = updateEventStatus(
    updateResultDatasetHash(modelSource, resultDatasetHash),
    "historical",
  );
  await Promise.all([
    writeFile(RESULT_SNAPSHOT_PATH, resultSnapshotSource),
    writeFile(MODEL_PATH, nextModel),
    writeFile(HISTORICAL_DATASET_PATH, updatedDataset),
    writeFile(HISTORICAL_LEDGER_PATH, formatLedger(ledger)),
    writeFile(
      HISTORICAL_MODEL_PATH,
      updateHistoricalDatasetHash(historicalModelSource, sha256(updatedDataset)),
    ),
  ]);
  console.log(
    `Ingested ${resultSnapshot.matchedNoticeListingCount} owner-free Victoria result rows (${addition.records.filter(({ outcome }) => outcome === "sold").length} sold, ${addition.records.filter(({ outcome }) => outcome === "unsold").length} unsold) plus ${resultSnapshot.opaqueRemovedRowCount} opaque removed row and ${resultSnapshot.unspecifiedRowCount} unspecified-status row from ${resultUrl}; result SHA-256 ${resultSnapshot.sourceDocumentSha256}; dataset SHA-256 ${resultDatasetHash}.`,
  );
}

async function refreshCurrentNotice(html, modelSource) {
  const parsed = parseVictoriaNotice(html);
  const snapshotSource = await readFile(SNAPSHOT_PATH, "utf8").catch((error) => {
    if (error?.code === "ENOENT") return null;
    throw error;
  });
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
    const fetchWithTimeout = (url, options = {}) =>
      fetch(url, { ...options, signal: AbortSignal.timeout(20_000) });
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

async function main() {
  const html = await (await fetchOk(SOURCE_URL, "text/html")).text();
  const classified = classifyVictoriaPage(html);
  const modelSource = await readFile(MODEL_PATH, "utf8");
  if (classified.kind === "empty-notice") {
    const notice = await readJson(SNAPSHOT_PATH);
    await ingestVictoriaResults(notice, modelSource);
    return;
  }
  await refreshCurrentNotice(html, modelSource);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
