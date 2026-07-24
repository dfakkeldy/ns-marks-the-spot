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
const HEADING_PATTERN =
  /([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})\s+TAX\s+SALE\s+RESULTS/iu;

export function moneyToCents(text) {
  const cleaned = String(text).replace(/[^\d.]/gu, "");
  if (!cleaned || !/\d/u.test(cleaned)) {
    return null;
  }
  const [whole, fraction = ""] = cleaned.split(".");
  return Number(whole) * 100 + Number(`${fraction}00`.slice(0, 2));
}

export function classifyOutcome(raw) {
  const value = String(raw).trim();
  const cents = moneyToCents(value);
  if (cents !== null) {
    return { outcome: "sold", winningBidCents: cents };
  }
  if (value.toUpperCase() === "ADJORNED") {
    // The municipality's own spelling of "adjourned". The parcel was taken off
    // this sale, so no transfer and no published bid.
    return {
      outcome: "withdrawn",
      winningBidCents: null,
      resultNote:
        'Official result column reads "ADJORNED" (adjourned) as printed by the municipality; the parcel was taken off this sale and no winning bid was published.',
    };
  }
  if (value.toUpperCase() === "NOT COMPLETED") {
    // Ambiguous: could mean no sale, or a high bid that fell through. Fail closed.
    return {
      outcome: "unknown",
      winningBidCents: null,
      resultNote:
        'Official result column reads "NOT COMPLETED" with no published amount; the source does not say whether a bid was received, so no outcome or winning bid is inferred.',
    };
  }
  throw new Error(
    `Unrecognized winning-bid value "${value}". Classify it by hand before ingesting this sale.`,
  );
}

function decodeEntities(value) {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&apos;", "'")
    .replaceAll("&nbsp;", " ")
    .replace(/&#(\d+);/gu, (_, code) => String.fromCodePoint(Number(code)));
}

function cellsOf(row) {
  return Array.from(
    row.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/giu),
    ([, cell]) =>
      decodeEntities(cell.replace(/<[^>]+>/gu, ""))
        .replace(/\s+/gu, " ")
        .trim(),
  );
}

export function containsResultsTable(html) {
  return HEADING_PATTERN.test(html.replace(/<[^>]+>/gu, " "));
}

function redemptionLabel(raw) {
  const value = raw.trim().toUpperCase();
  if (value === "6 MONTH") return "Redemption expiry - 6 month";
  if (value === "IMMEDIATE") return "Redemption expiry - Immediate";
  throw new Error(`Unrecognized redemption expiry "${raw}".`);
}

export function parseResults(html) {
  const tables = html.match(/<table[\s\S]*?<\/table>/giu) ?? [];
  if (tables.length !== 1) {
    throw new Error(
      `Expected exactly one results table, found ${tables.length}.`,
    );
  }

  const heading = tables[0].replace(/<[^>]+>/gu, " ").match(HEADING_PATTERN);
  if (!heading) {
    throw new Error(
      "Could not find a dated tax-sale results heading on the page.",
    );
  }
  const monthIndex = MONTHS.indexOf(heading[1].toLowerCase());
  if (monthIndex < 0) {
    throw new Error(`Unrecognized month "${heading[1]}" in the sale heading.`);
  }
  const saleDate = `${heading[3]}-${String(monthIndex + 1).padStart(2, "0")}-${String(
    Number(heading[2]),
  ).padStart(2, "0")}`;

  const rowMarkup = tables[0].match(/<tr[\s\S]*?<\/tr>/giu) ?? [];
  const headerCells = rowMarkup
    .map(cellsOf)
    .find((cells) => cells.some((cell) => cell.toUpperCase() === "PID"));
  if (!headerCells) {
    throw new Error("Could not find the results table header row.");
  }
  const rawLabel = headerCells[0].toUpperCase();
  if (rawLabel !== "AAN" && rawLabel !== "ASSESSMENT") {
    throw new Error(
      `Unrecognized listing-identifier column "${headerCells[0]}".`,
    );
  }
  const listingIdentifierLabel = rawLabel === "AAN" ? "AAN" : "Assessment";

  const rows = [];
  for (const markup of rowMarkup) {
    const cells = cellsOf(markup);
    // Column order: identifier, PID, NAME, DESCRIPTION, REDEMPTION, MIN BID, WINNING BID.
    // Index 2 is the assessed-owner name and is never read.
    if (cells.length < 7 || !/^\d+$/u.test(cells[0])) {
      continue;
    }
    if (!/^\d{8}$/u.test(cells[1])) {
      throw new Error(
        `Row ${cells[0]} has an invalid PID "${cells[1]}"; expected eight digits.`,
      );
    }
    const advertisedAmountCents = moneyToCents(cells[5]);
    if (advertisedAmountCents === null || advertisedAmountCents <= 0) {
      throw new Error(
        `Row ${cells[0]} has a non-positive minimum bid "${cells[5]}".`,
      );
    }
    rows.push({
      listingIdentifier: cells[0],
      pid: cells[1],
      description: cells[3],
      redemptionLabel: redemptionLabel(cells[4]),
      advertisedAmountCents,
      winningRaw: cells[6],
    });
  }

  if (rows.length === 0) {
    throw new Error("The results table contained no parsable rows.");
  }
  return { saleDate, heading: heading[0], listingIdentifierLabel, rows };
}

export const CUMBERLAND_SOURCE = {
  id: "cumberland",
  municipalityId: "cumberland",
  municipality: "Municipality of the County of Cumberland",
  shortMunicipality: "Cumberland",
  landingPageUrl: "https://www.cumberlandcounty.ns.ca/tax-sales.html",
  saleMethod: "public-auction",
  advertisedAmountLabel: "Min bid",
  snapshotPath: "cumberlandTaxSale.snapshot.json",
  parseResults,
  classifyOutcome,
  containsResultsTable,
};
