import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
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

const SOURCE_URL =
  "https://www.discovermiddleton.ca/property-tax-sale-information";
const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const SNAPSHOT_PATH = resolve(
  SCRIPT_DIR,
  "../src/data/middletonTaxSale.snapshot.json",
);
const RESULT_SNAPSHOT_PATH = resolve(
  SCRIPT_DIR,
  "../src/data/middletonTaxSaleResults.snapshot.json",
);
const MODEL_PATH = resolve(SCRIPT_DIR, "../src/data/middletonTaxSale.ts");
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

export function parseMiddletonResults(html) {
  const pageText = textContent(
    html
      .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[\s\S]*?<\/style>/gi, " "),
  );
  const dateMatch = pageText.match(
    /\b(January|February|March|April|May|June|July|August|September|October|November|December) (\d{1,2}), (\d{4}) Property Tax Sale Results\b/,
  );
  if (!dateMatch) {
    throw new Error("Could not parse the Middleton result date.");
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
  const saleDate = `${dateMatch[3]}-${month}-${dateMatch[2].padStart(2, "0")}`;
  const requiredHeaders = [
    "No.",
    "Property Sold",
    "Property Description",
    "Opening Bid",
    "Successful Bid",
  ];
  const tables = Array.from(
    html.matchAll(/<table\b[^>]*>([\s\S]*?)<\/table>/gi),
    ([, table]) => parseRows(table),
  ).filter(
    ([headers]) => JSON.stringify(headers) === JSON.stringify(requiredHeaders),
  );
  if (tables.length !== 1) {
    throw new Error(
      `Expected one Middleton tax-sale result table, found ${tables.length}.`,
    );
  }

  const rows = tables[0].slice(1).map((cells, index) => {
    const rowNumber = index + 1;
    const [printedNumber, identityValue, description, openingBid, successfulBid] =
      cells;
    if (
      cells.length !== requiredHeaders.length ||
      printedNumber !== String(rowNumber)
    ) {
      throw new Error(`Could not parse Middleton result row ${rowNumber}.`);
    }
    if (identityValue === "REMOVED") {
      if (description || openingBid || successfulBid) {
        throw new Error(
          `Middleton removed result row ${rowNumber} still carries parcel facts.`,
        );
      }
      return {
        rowNumber,
        description: null,
        openingBidCents: null,
        winningBidCents: null,
        outcome: "withdrawn",
      };
    }

    const openingBidCents = parseMoneyCents(openingBid);
    const winningBidCents = parseMoneyCents(successfulBid);
    if (
      !identityValue ||
      !description ||
      !Number.isSafeInteger(openingBidCents) ||
      (successfulBid !== "NO BID" && !Number.isSafeInteger(winningBidCents))
    ) {
      throw new Error(
        `Could not parse all owner-free fields for Middleton result row ${rowNumber}.`,
      );
    }
    return {
      rowNumber,
      description,
      openingBidCents,
      winningBidCents: successfulBid === "NO BID" ? null : winningBidCents,
      outcome: successfulBid === "NO BID" ? "unsold" : "sold",
    };
  });
  if (rows.length === 0) {
    throw new Error("The Middleton result contained no rows.");
  }
  return { saleDate, rows };
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

function normalizedDescription(value) {
  return value.replace(/\s+/g, " ").trim().toLocaleUpperCase("en-CA");
}

export function buildMiddletonResultSnapshot(
  notice,
  current,
  parsed,
  archiveReceipt,
  now = new Date(),
) {
  if (parsed.saleDate !== notice.eventDate) {
    throw new Error(
      `Middleton result date ${parsed.saleDate} does not match notice date ${notice.eventDate}.`,
    );
  }
  const identifiableRows = parsed.rows.filter(
    ({ description }) => description !== null,
  );
  for (const listing of notice.listings) {
    const matches = identifiableRows.filter(
      ({ description }) =>
        normalizedDescription(description) ===
        normalizedDescription(listing.address),
    );
    if (matches.length !== 1) {
      throw new Error(
        `Middleton notice item ${listing.item} did not match exactly one identifiable result row.`,
      );
    }
  }

  const sourceFactsSha256 = sha256(JSON.stringify(parsed));
  const changed = current?.sourceFactsSha256 !== sourceFactsSha256;
  const receipt = changed ? archiveReceipt : current.archiveReceipt;
  if (!receipt) {
    throw new Error(
      "A verified Middleton archive receipt is required before changed result facts can be written.",
    );
  }
  return {
    schemaVersion: 1,
    eventId: `middleton-${parsed.saleDate}`,
    municipality: notice.municipality,
    source: SOURCE_URL,
    retrievedDate: changed ? halifaxDate(now) : current.retrievedDate,
    saleDate: parsed.saleDate,
    sourceFactsSha256,
    sourceHashPolicy:
      "The overwrite-prone official HTML contains an identity column. This receipt hashes normalized result facts after discarding that column; the external Wayback receipt preserves the full official page bytes.",
    ownerNamesExcluded: true,
    identityNamesExcluded: true,
    resultRowCount: parsed.rows.length,
    matchedNoticeListingCount: notice.listings.length,
    opaqueRemovedRowCount: parsed.rows.filter(
      ({ outcome, description }) => outcome === "withdrawn" && description === null,
    ).length,
    archiveReceipt: receipt,
    results: parsed.rows,
  };
}

export function buildMiddletonHistoricalAddition(
  notice,
  result,
  noticeDatasetSha256,
) {
  if (
    result.eventId !== `middleton-${notice.eventDate}` ||
    result.saleDate !== notice.eventDate ||
    !/^[a-f\d]{64}$/.test(noticeDatasetSha256) ||
    !/^[a-f\d]{64}$/.test(result.archiveReceipt.sha256)
  ) {
    throw new Error("The Middleton notice/result receipt is inconsistent.");
  }
  const records = notice.listings.map((listing) => {
    const matches = result.results.filter(
      ({ description }) =>
        description !== null &&
        normalizedDescription(description) ===
          normalizedDescription(listing.address),
    );
    if (matches.length !== 1) {
      throw new Error(
        `Middleton notice item ${listing.item} did not match exactly one identifiable result row.`,
      );
    }
    const matched = matches[0];
    if (!['sold', 'unsold'].includes(matched.outcome)) {
      throw new Error(
        `Middleton result row ${matched.rowNumber} has no map-safe disposition.`,
      );
    }
    return {
      eventId: result.eventId,
      recordId: `${result.eventId}-result-row-${matched.rowNumber}`,
      listingIdentifier: String(matched.rowNumber),
      pids: listing.pids,
      civicDescription: listing.address,
      advertisedAmountCents: matched.openingBidCents,
      winningBidCents: matched.winningBidCents,
      outcome: matched.outcome,
      resultNote:
        matched.outcome === "unsold"
          ? 'The official Successful Bid column reads "NO BID".'
          : "The official result prints a numeric successful bid.",
      redemptionLabel: listing.redeemable
        ? "Redeemable - Yes"
        : "Redeemable - No",
      nspMatchStatus: "matched",
      nspMatchMethod: "exact-official-pid",
      reviewState: "visually-verified",
    };
  });

  const event = {
    id: result.eventId,
    municipalityId: "middleton",
    municipality: notice.municipality,
    shortMunicipality: "Middleton",
    saleDate: result.saleDate,
    saleMethod: "public-auction",
    listingIdentifierLabel: "Result row",
    advertisedAmountLabel: "Opening bid",
    currency: "CAD",
    noticeUrl: notice.source,
    landingPageUrl: result.source,
    resultStatus: "verified",
    resultUrl: result.archiveReceipt.url,
    retrievedOn: result.retrievedDate,
    noticeSnapshotDate: notice.retrievedDate,
    resultSnapshotDate: result.retrievedDate,
    noticeSha256: noticeDatasetSha256,
    resultSha256: result.archiveReceipt.sha256,
    sourceNotes:
      `The owner-free notice snapshot retained ${notice.listingCount} exact-PID rows on ${notice.retrievedDate}. Each matches exactly one official result description; ${records.filter(({ outcome }) => outcome === "unsold").length} print NO BID and ${records.filter(({ outcome }) => outcome === "sold").length} print numeric successful bids. The official result also prints ${result.opaqueRemovedRowCount} REMOVED rows without descriptions or parcel identifiers; those opaque rows remain distinct and outside the mapped records. The result identity column was discarded before the public snapshot was written.`,
  };

  const ledgerEntry = {
    municipality: notice.municipality,
    event: "August 20, 2026 property tax sale by public auction",
    status: "included",
    officialUrls: [notice.source, result.archiveReceipt.url],
    documentSha256: [noticeDatasetSha256, result.archiveReceipt.sha256],
    fieldsAvailable: [
      "notice AAN",
      "notice PID",
      "property description",
      "opening bid",
      "successful bid",
      "REMOVED",
    ],
    officialWinningBidsFound: records.some(
      ({ winningBidCents }) => winningBidCents !== null,
    ),
    notes:
      `${records.length} exact-PID notice rows were reconciled by unique official property description and both print NO BID. ${result.opaqueRemovedRowCount} additional rows print REMOVED without parcel identifiers and remain outside the map dataset. The result identity column was discarded before ingestion.`,
  };
  return { event, records, ledgerEntry };
}

export function updateDatasetHash(modelSource, datasetHash) {
  const pattern =
    /(MIDDLETON_TAX_SALE_DATASET_SHA256\s*=\s*\n\s*")([a-f\d]{64})(";)/;
  if (!modelSource.match(pattern)) {
    throw new Error("Could not find MIDDLETON_TAX_SALE_DATASET_SHA256.");
  }
  return modelSource.replace(pattern, `$1${datasetHash}$3`);
}

function updateResultDatasetHash(modelSource, datasetHash) {
  const pattern =
    /(MIDDLETON_TAX_SALE_RESULT_DATASET_SHA256\s*=\s*\n\s*")([a-f\d]{64})(";)/;
  if (!modelSource.match(pattern)) {
    throw new Error(
      "Could not find MIDDLETON_TAX_SALE_RESULT_DATASET_SHA256.",
    );
  }
  return modelSource.replace(pattern, `$1${datasetHash}$3`);
}

function updateHistoricalDatasetHash(modelSource, datasetHash) {
  const pattern =
    /(HISTORICAL_DATASET_SHA256\s*=\s*\n\s*")([a-f\d]{64})(";)/;
  if (!modelSource.match(pattern)) {
    throw new Error("Could not find HISTORICAL_DATASET_SHA256.");
  }
  return modelSource.replace(pattern, `$1${datasetHash}$3`);
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
      `Middleton PID reconciliation failed: missing ${missing.join(", ") || "none"}; expected ${expected.size}, returned ${returned.size}.`,
    );
  }
}

async function archiveMiddletonResults() {
  const verify = (html) =>
    /August 20, 2026 Property Tax Sale Results/i.test(html) &&
    /Successful Bid/i.test(html);
  let timestamps = await listCaptures(SOURCE_URL);
  let receipt = await findHashableCapture(SOURCE_URL, {
    timestamps,
    verify,
  });
  if (receipt) {
    return receipt;
  }
  const saved = await submitToWayback(SOURCE_URL);
  timestamps = [...new Set([saved, ...(await listCaptures(SOURCE_URL))])].filter(
    Boolean,
  );
  receipt = await findHashableCapture(SOURCE_URL, { timestamps, verify });
  if (!receipt) {
    throw new Error(
      "No hashable Middleton archive capture carries the official result table.",
    );
  }
  return receipt;
}

async function ingestMiddletonResults(html, notice, modelSource) {
  const parsed = parseMiddletonResults(html);
  const currentResult = await readJsonIfPresent(RESULT_SNAPSHOT_PATH);
  const parsedHash = sha256(JSON.stringify(parsed));
  const archiveReceipt =
    currentResult?.sourceFactsSha256 === parsedHash
      ? currentResult.archiveReceipt
      : await archiveMiddletonResults();
  const resultSnapshot = buildMiddletonResultSnapshot(
    notice,
    currentResult,
    parsed,
    archiveReceipt,
  );
  const resultSnapshotSource = `${JSON.stringify(resultSnapshot, null, 2)}\n`;
  const resultDatasetHash = sha256(resultSnapshotSource);
  const noticeDatasetHash = sha256(`${JSON.stringify(notice, null, 2)}\n`);
  const addition = buildMiddletonHistoricalAddition(
    notice,
    resultSnapshot,
    noticeDatasetHash,
  );

  const [datasetText, ledgerText, historicalModelSource] = await Promise.all([
    readFile(HISTORICAL_DATASET_PATH, "utf8"),
    readFile(HISTORICAL_LEDGER_PATH, "utf8"),
    readFile(HISTORICAL_MODEL_PATH, "utf8"),
  ]);
  const dataset = JSON.parse(datasetText);
  const ledger = JSON.parse(ledgerText);
  const existingEvent = dataset.events.find(
    ({ id }) => id === addition.event.id,
  );
  const existingRecords = dataset.records.filter(
    ({ eventId }) => eventId === addition.event.id,
  );

  if (existingEvent) {
    if (
      JSON.stringify(existingEvent) !== JSON.stringify(addition.event) ||
      JSON.stringify(existingRecords) !== JSON.stringify(addition.records)
    ) {
      throw new Error(
        `${addition.event.id} changed after ingestion; refusing to rewrite the verified event automatically.`,
      );
    }
  } else {
    await validateExactPids(addition.records.flatMap(({ pids }) => pids));
    dataset.events.push(addition.event);
    dataset.records.push(...addition.records);
    ledger.retrievedOn = resultSnapshot.retrievedDate;
    ledger.coverage.push(addition.ledgerEntry);
  }

  const updatedDataset = formatDataset(dataset);
  await Promise.all([
    writeFile(RESULT_SNAPSHOT_PATH, resultSnapshotSource),
    writeFile(
      MODEL_PATH,
      updateResultDatasetHash(modelSource, resultDatasetHash),
    ),
    ...(existingEvent
      ? []
      : [
          writeFile(HISTORICAL_DATASET_PATH, updatedDataset),
          writeFile(HISTORICAL_LEDGER_PATH, formatLedger(ledger)),
          writeFile(
            HISTORICAL_MODEL_PATH,
            updateHistoricalDatasetHash(
              historicalModelSource,
              sha256(updatedDataset),
            ),
          ),
        ]),
  ]);
  console.log(
    `Checked ${resultSnapshot.resultRowCount} owner-free Middleton result rows; ${addition.records.filter(({ outcome }) => outcome === "unsold").length} exact-PID rows print NO BID and ${resultSnapshot.opaqueRemovedRowCount} opaque rows print REMOVED; result receipt SHA-256 ${resultSnapshot.archiveReceipt.sha256}; dataset SHA-256 ${resultDatasetHash}.`,
  );
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
  const [snapshotSource, modelSource] = await Promise.all([
    readFile(SNAPSHOT_PATH, "utf8"),
    readFile(MODEL_PATH, "utf8"),
  ]);
  const notice = JSON.parse(snapshotSource);
  if (/Property Tax Sale Results/i.test(textContent(html))) {
    await ingestMiddletonResults(html, notice, modelSource);
    return;
  }
  const parsed = parseMiddletonNotice(html);
  const snapshot = buildSnapshot(notice, parsed);
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
