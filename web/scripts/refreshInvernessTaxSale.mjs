import { execFile as execFileCallback } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFile = promisify(execFileCallback);
const LANDING_PAGE_URL =
  "https://invernesscounty.ca/services/finance-taxation/tax-sales/";
const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const SNAPSHOT_PATH = resolve(
  SCRIPT_DIR,
  "../src/data/invernessTaxSale.snapshot.json",
);
const MODEL_PATH = resolve(SCRIPT_DIR, "../src/data/invernessTaxSale.ts");

function decodeHtml(value) {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([\da-f]+);/gi, (_, code) =>
      String.fromCodePoint(Number.parseInt(code, 16)),
    );
}

export function extractSourcePdfUrl(html, landingPageUrl = LANDING_PAGE_URL) {
  const urls = Array.from(
    html.matchAll(/href=["']([^"']+)["']/gi),
    ([, href]) => new URL(decodeHtml(href), landingPageUrl),
  ).filter(({ pathname }) =>
    /\/Tax-Sale_August-11(?:-\d+)?\.pdf$/i.test(pathname),
  );
  const uniqueUrls = [...new Set(urls.map(String))];
  if (uniqueUrls.length !== 1) {
    throw new Error(
      `Expected one current Inverness August 11 notice PDF, found ${uniqueUrls.length}.`,
    );
  }
  return uniqueUrls[0];
}

export function parseBboxWords(bboxHtml) {
  return Array.from(
    bboxHtml.matchAll(
      /<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">([\s\S]*?)<\/word>/g,
    ),
    ([, xMin, yMin, xMax, yMax, value]) => ({
      xMin: Number(xMin),
      yMin: Number(yMin),
      xMax: Number(xMax),
      yMax: Number(yMax),
      value: decodeHtml(value.replace(/<[^>]+>/g, "")),
    }),
  );
}

export function parseHorizontalLines(svg) {
  const pageHeight = Number(
    svg.match(/height="([\d.]+)pt"/)?.[1] ??
      svg.match(/viewBox="[^"]+\s([\d.]+)"/)?.[1],
  );
  if (!Number.isFinite(pageHeight)) {
    throw new Error("Could not determine the PDF page height from the SVG.");
  }

  return Array.from(
    svg.matchAll(
      /<path fill="none"[^>]*d="M\s([\d.]+)\s([\d.]+)\sL\s([\d.]+)\s([\d.]+)\s*"[^>]*transform="matrix\(1,\s*0,\s*0,\s*-1,\s*0,\s*([\d.]+)\)"/g,
    ),
    ([, x1, y1, x2, y2, transformHeight]) => ({
      x1: Number(x1),
      x2: Number(x2),
      y1: Number(transformHeight) - Number(y1),
      y2: Number(transformHeight) - Number(y2),
    }),
  ).filter(
    ({ x1, x2, y1, y2 }) =>
      Math.abs(y1 - y2) < 0.05 && Math.abs(x2 - x1) >= 4,
  );
}

function columnText(words, minimumX, maximumX) {
  return words
    .filter(({ xMin }) => xMin >= minimumX && xMin < maximumX)
    .sort((left, right) => left.xMin - right.xMin)
    .map(({ value }) => value)
    .join(" ")
    .trim();
}

export function parseSummaryRows(words, horizontalLines) {
  const liens = words
    .filter(
      ({ xMin, yMin, value }) =>
        xMin >= 58 &&
        xMin < 66.5 &&
        yMin > 140 &&
        yMin < 700 &&
        /^\d{1,3}$/.test(value),
    )
    .map((word) => ({
      lien: Number(word.value),
      centreY: (word.yMin + word.yMax) / 2,
    }))
    .sort((left, right) => left.centreY - right.centreY);

  if (liens.length === 0 || new Set(liens.map(({ lien }) => lien)).size !== liens.length) {
    throw new Error("Could not identify a unique set of lien rows on summary page 1.");
  }

  return liens.map(({ lien, centreY }, index) => {
    const previousY = liens[index - 1]?.centreY;
    const nextY = liens[index + 1]?.centreY;
    const minimumY = previousY ? (previousY + centreY) / 2 : centreY - 6;
    const maximumY = nextY ? (nextY + centreY) / 2 : centreY + 6;
    const rowWords = words.filter(({ yMin, yMax }) => {
      const wordCentre = (yMin + yMax) / 2;
      return wordCentre >= minimumY && wordCentre < maximumY;
    });
    const aan = columnText(rowWords, 66.5, 95).replace(/\D/g, "");
    const location = columnText(rowWords, 235, 390);
    const amountText = columnText(rowWords, 390, 425);
    const redemptionText = columnText(rowWords, 425, 465).replace("0", "O");
    const pids = columnText(rowWords, 465, 560).match(/\d{8}/g) ?? [];
    const amount = Number(amountText.replace(/[^\d.]/g, ""));
    const strikeWidth = horizontalLines
      .filter(
        ({ y1 }) => Math.abs(y1 - centreY) < 2.5,
      )
      .reduce((total, { x1, x2 }) => total + Math.abs(x2 - x1), 0);

    if (
      !/^\d{8}$/.test(aan) ||
      !location ||
      !Number.isFinite(amount) ||
      !["YES", "NO"].includes(redemptionText) ||
      pids.length === 0
    ) {
      throw new Error(`Could not parse all owner-free fields for lien ${lien}.`);
    }

    return {
      lien,
      aan,
      location,
      recoveryAmount: amount,
      redeemable: redemptionText === "YES",
      pids,
      listingStatus: strikeWidth >= 40 ? "withdrawn" : "advertised",
    };
  });
}

export function mergeListings(currentListings, sourceRows) {
  const sourceByLien = new Map(sourceRows.map((row) => [row.lien, row]));
  const currentByLien = new Map(currentListings.map((row) => [row.lien, row]));

  const missingLiens = currentListings
    .filter(({ lien }) => !sourceByLien.has(lien))
    .map(({ lien }) => lien);
  if (missingLiens.length > 0) {
    throw new Error(
      `Current municipal summary omitted stored lien rows ${missingLiens.join(", ")}; refusing to delete evidence automatically.`,
    );
  }

  return sourceRows.map((source) => {
    const current = currentByLien.get(source.lien);
    return {
      lien: source.lien,
      aan: source.aan,
      location: current?.location ?? source.location,
      recoveryAmount: source.recoveryAmount,
      redeemable: source.redeemable,
      pids: source.pids,
      listingStatus: source.listingStatus,
    };
  });
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

function sha256(contents) {
  return createHash("sha256").update(contents).digest("hex");
}

export function buildSnapshot(current, sourceRows, sourceUrl, pdfBytes, now) {
  const listings = mergeListings(current.listings, sourceRows);
  const sourceDocumentSha256 = sha256(pdfBytes);
  const changed =
    current.source !== sourceUrl ||
    current.sourceDocumentSha256 !== sourceDocumentSha256 ||
    JSON.stringify(current.listings) !== JSON.stringify(listings);

  return {
    ...current,
    retrievedDate: changed ? halifaxDate(now) : current.retrievedDate,
    source: sourceUrl,
    landingPage: LANDING_PAGE_URL,
    sourceDocumentSha256,
    normalization:
      "Location capitalization, road abbreviations, accents, punctuation, and obvious summary-table text errors were normalized after visual review; lien, AAN, amount, redemption, PID, and visible strike-through status remain source facts.",
    status:
      "dated municipal snapshot; advertised and withdrawn states require continued municipal verification",
    listingCount: listings.length,
    parcelIdentifierCount: new Set(listings.flatMap(({ pids }) => pids)).size,
    listings,
  };
}

export function updateDatasetHash(modelSource, datasetHash) {
  const pattern =
    /(INVERNESS_BOOK_DATASET_SHA256\s*=\s*\n\s*")([a-f\d]{64})(";)/;
  const currentHash = modelSource.match(pattern)?.[2];
  if (!currentHash) {
    throw new Error("Could not find INVERNESS_BOOK_DATASET_SHA256.");
  }
  if (currentHash === datasetHash) {
    return modelSource;
  }
  return modelSource.replace(
    pattern,
    `$1${datasetHash}$3`,
  );
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
    resolve(tmpdir(), "inverness-tax-sale-refresh-"),
  );
  try {
    const landingHtml = await (
      await fetchOk(LANDING_PAGE_URL, "text/html")
    ).text();
    const sourceUrl = extractSourcePdfUrl(landingHtml);
    const pdfBytes = Buffer.from(
      await (await fetchOk(sourceUrl, "application/pdf")).arrayBuffer(),
    );
    const pdfPath = resolve(temporaryDirectory, "notice.pdf");
    const bboxPath = resolve(temporaryDirectory, "summary.html");
    const svgPath = resolve(temporaryDirectory, "summary.svg");
    await writeFile(pdfPath, pdfBytes);
    await execFile("pdftotext", ["-f", "1", "-l", "1", "-bbox", pdfPath, bboxPath]);
    await execFile("pdftocairo", ["-f", "1", "-l", "1", "-svg", pdfPath, svgPath]);

    const [bboxHtml, svg, snapshotSource, modelSource] = await Promise.all([
      readFile(bboxPath, "utf8"),
      readFile(svgPath, "utf8"),
      readFile(SNAPSHOT_PATH, "utf8"),
      readFile(MODEL_PATH, "utf8"),
    ]);
    const rows = parseSummaryRows(
      parseBboxWords(bboxHtml),
      parseHorizontalLines(svg),
    );
    const current = JSON.parse(snapshotSource);
    const snapshot = buildSnapshot(current, rows, sourceUrl, pdfBytes);
    const nextSnapshotSource = `${JSON.stringify(snapshot, null, 2)}\n`;
    const datasetHash = sha256(nextSnapshotSource);
    const nextModelSource = updateDatasetHash(modelSource, datasetHash);

    await Promise.all([
      writeFile(SNAPSHOT_PATH, nextSnapshotSource),
      writeFile(MODEL_PATH, nextModelSource),
    ]);

    const withdrawn = rows
      .filter(({ listingStatus }) => listingStatus === "withdrawn")
      .map(({ lien }) => lien);
    console.log(
      `Checked ${rows.length} Inverness liens from ${sourceUrl}; withdrawn liens: ${withdrawn.join(", ") || "none"}; dataset SHA-256 ${datasetHash}.`,
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
