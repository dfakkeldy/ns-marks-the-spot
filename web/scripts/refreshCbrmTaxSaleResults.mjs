import { execFile as execFileCallback } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFile = promisify(execFileCallback);
const LANDING_PAGE_URL =
  "https://cbrm.ns.ca/business/property-sales-management/tax-sales/";
const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const SNAPSHOT_PATH = resolve(
  SCRIPT_DIR,
  "../src/data/cbrmTaxSaleResults.snapshot.json",
);
const MODEL_PATH = resolve(SCRIPT_DIR, "../src/data/historicalTaxSales.ts");
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
  if (!match) {
    return null;
  }
  return Number(match[1].replaceAll(",", "")) * 100 + Number(match[2]);
}

function saleDateFromText(value) {
  const match = String(value).match(
    /([A-Za-z]+)[-\s]+(\d{1,2})[-,\s]+(\d{4})/u,
  );
  if (!match) {
    return null;
  }
  const month = MONTHS.indexOf(match[1].toLowerCase());
  if (month < 0) {
    return null;
  }
  return `${match[3]}-${String(month + 1).padStart(2, "0")}-${String(
    Number(match[2]),
  ).padStart(2, "0")}`;
}

export function classifyCbrmResult(raw) {
  const value = String(raw).trim().replace(/\s+/gu, " ");
  const winningBidCents = moneyToCents(value);
  if (winningBidCents !== null) {
    return { outcome: "sold", winningBidCents };
  }
  if (value === "") {
    return {
      outcome: "unknown",
      winningBidCents: null,
      resultNote:
        "The official result row publishes no winning bid or disposition; no outcome is inferred.",
    };
  }
  if (value.toUpperCase() === "PAID AT SALE") {
    return {
      outcome: "unknown",
      winningBidCents: null,
      resultNote:
        'Official winning-bid column reads "PAID AT SALE"; no completed sale or winning bid is inferred.',
    };
  }
  throw new Error(`Unrecognized CBRM result "${value}".`);
}

function redemptionCategory(raw) {
  const value = raw.replaceAll(" ", "").replace("*", "").toUpperCase();
  if (value === "6MTH") {
    return "six-month";
  }
  if (value === "IMMED") {
    return "immediate-deed";
  }
  throw new Error(`Unrecognized CBRM redemption category "${raw}".`);
}

export function parseCbrmResultText(text) {
  const normalizedText = String(text).replaceAll("\r", "");
  const title = normalizedText.match(
    /([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})\s+TAX\s+SALE/u,
  );
  const saleDate = title ? saleDateFromText(title[0]) : null;
  if (!saleDate) {
    throw new Error("Could not find a dated CBRM tax-sale heading.");
  }

  const rows = [];
  for (const line of normalizedText.split("\n")) {
    const match = line.match(
      /^\s*(\d{2}-\d+)\s+(\d+)\s+(\d{8})\s+.+?\s+\$\s*([\d,]+\.\d{2})\s+(6\s*MTH\s*\*?|6MTH\s*\*?|IMMED)\s*(.*?)\s*$/u,
    );
    if (!match) {
      continue;
    }
    rows.push({
      lien: match[1],
      aan: match[2],
      pid: match[3],
      minimumBidCents: moneyToCents(match[4]),
      redemptionCategory: redemptionCategory(match[5]),
      winningRaw: match[6].trim().replace(/\s+/gu, " "),
    });
  }

  if (rows.length === 0) {
    throw new Error("The CBRM result PDF contained no parsable rows.");
  }
  if (new Set(rows.map(({ lien }) => lien)).size !== rows.length) {
    throw new Error("The CBRM result PDF contains duplicate lien rows.");
  }
  return { saleDate, rows };
}

export function reconcileCbrmResults(noticeListings, resultRows) {
  const noticeByLien = new Map(
    noticeListings.map((listing) => [listing.lien, listing]),
  );
  return resultRows.map((row) => {
    const notice = noticeByLien.get(row.lien);
    if (!notice) {
      throw new Error(`CBRM result ${row.lien} has no matching notice row.`);
    }
    if (notice.aan !== row.aan) {
      throw new Error(`CBRM result ${row.lien} does not match its notice AAN.`);
    }
    if (!notice.pids.includes(row.pid)) {
      throw new Error(`CBRM result ${row.lien} does not match its notice PID.`);
    }
    if (notice.financial.amountCents !== row.minimumBidCents) {
      throw new Error(
        `CBRM result ${row.lien} does not match its notice minimum bid.`,
      );
    }
    if (notice.redemptionCategory !== row.redemptionCategory) {
      throw new Error(
        `CBRM result ${row.lien} does not match its notice redemption category.`,
      );
    }
    return {
      lien: row.lien,
      aan: row.aan,
      pid: row.pid,
      minimumBidCents: row.minimumBidCents,
      redemptionCategory: row.redemptionCategory,
      ...classifyCbrmResult(row.winningRaw),
    };
  });
}

export function extractLatestResultsPdfUrl(html, landingPageUrl) {
  const candidates = Array.from(
    String(html).matchAll(/<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/giu),
    ([, href, label]) => {
      const text = label.replace(/<[^>]+>/gu, " ").replace(/\s+/gu, " ").trim();
      const absoluteUrl = new URL(href, landingPageUrl).toString();
      if (
        !/List\s+of\s+Sold\s+Properties|Sold-Properties/iu.test(
          `${text} ${absoluteUrl}`,
        ) ||
        !/\.pdf(?:$|\?)/iu.test(absoluteUrl)
      ) {
        return null;
      }
      const saleDate = saleDateFromText(`${text} ${absoluteUrl}`);
      return saleDate ? { saleDate, url: absoluteUrl } : null;
    },
  ).filter(Boolean);

  if (candidates.length === 0) {
    throw new Error("The CBRM landing page links no dated sold-properties PDF.");
  }
  candidates.sort((left, right) => left.saleDate.localeCompare(right.saleDate));
  const latest = candidates.at(-1);
  const sameDate = candidates.filter(
    ({ saleDate }) => saleDate === latest.saleDate,
  );
  if (new Set(sameDate.map(({ url }) => url)).size !== 1) {
    throw new Error(
      `The CBRM landing page links multiple result PDFs for ${latest.saleDate}.`,
    );
  }
  return latest.url;
}

export function updateCbrmDatasetHash(modelSource, datasetHash) {
  const pattern =
    /(CBRM_RESULT_DATASET_SHA256\s*=\s*\n\s*")([a-f\d]{64})(";)/u;
  if (!pattern.test(modelSource)) {
    throw new Error(
      "Could not find CBRM_RESULT_DATASET_SHA256 in the historical model.",
    );
  }
  return modelSource.replace(pattern, `$1${datasetHash}$3`);
}

function halifaxDate(now = new Date()) {
  const values = Object.fromEntries(
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
  return `${values.year}-${values.month}-${values.day}`;
}

export function buildCbrmSnapshot(
  current,
  parsed,
  sourceUrl,
  pdfBytes,
  now = new Date(),
) {
  const sourceDocumentSha256 = createHash("sha256")
    .update(pdfBytes)
    .digest("hex");
  const eventId = `cbrm-${parsed.saleDate}`;
  const changed =
    current.eventId !== eventId ||
    current.source !== sourceUrl ||
    current.sourceDocumentSha256 !== sourceDocumentSha256 ||
    JSON.stringify(current.results) !== JSON.stringify(parsed.rows);

  return {
    schemaVersion: 1,
    eventId,
    saleDate: parsed.saleDate,
    landingPage: LANDING_PAGE_URL,
    source: sourceUrl,
    retrievedDate: changed ? halifaxDate(now) : current.retrievedDate,
    sourceDocumentSha256,
    ownerNamesExcluded: true,
    resultRowCount: parsed.rows.length,
    results: parsed.rows,
  };
}

async function fetchOk(url, accept) {
  const response = await fetch(url, {
    headers: { Accept: accept, "User-Agent": "NS-Marks-tax-sale-monitor/1.0" },
  });
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}: ${url}`);
  }
  return response;
}

async function main() {
  const temporaryDirectory = await mkdtemp(
    resolve(tmpdir(), "cbrm-tax-sale-results-"),
  );
  try {
    const landingHtml = await (
      await fetchOk(LANDING_PAGE_URL, "text/html")
    ).text();
    const sourceUrl = extractLatestResultsPdfUrl(
      landingHtml,
      LANDING_PAGE_URL,
    );
    const pdfBytes = Buffer.from(
      await (await fetchOk(sourceUrl, "application/pdf")).arrayBuffer(),
    );
    const pdfPath = resolve(temporaryDirectory, "results.pdf");
    const textPath = resolve(temporaryDirectory, "results.txt");
    await writeFile(pdfPath, pdfBytes);
    await execFile("pdftotext", ["-layout", pdfPath, textPath]);
    const parsed = parseCbrmResultText(await readFile(textPath, "utf8"));
    const resultRows = parsed.rows.map((row) => ({
      lien: row.lien,
      aan: row.aan,
      pid: row.pid,
      minimumBidCents: row.minimumBidCents,
      redemptionCategory: row.redemptionCategory,
      ...classifyCbrmResult(row.winningRaw),
    }));
    const currentSnapshot = JSON.parse(await readFile(SNAPSHOT_PATH, "utf8"));
    const snapshot = buildCbrmSnapshot(
      currentSnapshot,
      { saleDate: parsed.saleDate, rows: resultRows },
      sourceUrl,
      pdfBytes,
    );
    const snapshotSource = `${JSON.stringify(snapshot, null, 2)}\n`;
    const datasetHash = createHash("sha256")
      .update(snapshotSource)
      .digest("hex");
    const modelSource = await readFile(MODEL_PATH, "utf8");
    await Promise.all([
      writeFile(SNAPSHOT_PATH, snapshotSource),
      writeFile(
        MODEL_PATH,
        updateCbrmDatasetHash(modelSource, datasetHash),
      ),
    ]);
    console.log(
      `Checked ${resultRows.length} owner-free CBRM result rows for ${parsed.saleDate}; ${resultRows.filter(({ outcome }) => outcome === "sold").length} publish numeric winning bids; dataset SHA-256 ${datasetHash}.`,
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
