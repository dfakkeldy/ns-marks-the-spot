const HEADING_PATTERN =
  /([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})\s+PROPERTY\s+TAX\s+SALE\s+-\s+RESULTS/iu;
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

function decodeEntities(value) {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&#039;", "'")
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

function moneyToCents(value) {
  const match = String(value).match(/\$?\s*([\d,]+)\.(\d{2})/u);
  return match
    ? Number(match[1].replaceAll(",", "")) * 100 + Number(match[2])
    : null;
}

export function classifyOutcome(raw) {
  const winningBidCents = moneyToCents(raw);
  if (winningBidCents !== null) {
    return { outcome: "sold", winningBidCents };
  }
  throw new Error(
    `Unrecognized Richmond successful-bid value "${String(raw).trim()}".`,
  );
}

export function containsResultsTable(html) {
  return HEADING_PATTERN.test(String(html).replace(/<[^>]+>/gu, " "));
}

export function parseResults(html) {
  const tables = String(html).match(/<table[\s\S]*?<\/table>/giu) ?? [];
  if (tables.length !== 1) {
    throw new Error(`Expected exactly one Richmond results table, found ${tables.length}.`);
  }
  const heading = tables[0].replace(/<[^>]+>/gu, " ").match(HEADING_PATTERN);
  if (!heading) {
    throw new Error("Could not find the dated Richmond tax-sale result heading.");
  }
  const monthIndex = MONTHS.indexOf(heading[1].toLowerCase());
  if (monthIndex < 0) {
    throw new Error(`Unrecognized Richmond result month "${heading[1]}".`);
  }

  const rows = [];
  for (const markup of tables[0].match(/<tr[\s\S]*?<\/tr>/giu) ?? []) {
    const cells = cellsOf(markup);
    if (cells.length !== 10 || !/^\d+$/u.test(cells[0])) {
      continue;
    }
    if (!/^\d{8}$/u.test(cells[2]) || !/^\d{8}$/u.test(cells[3])) {
      throw new Error(
        `Richmond result row ${cells[0]} has an invalid AAN or PID.`,
      );
    }
    const advertisedAmountCents = moneyToCents(cells[7]);
    if (advertisedAmountCents === null || advertisedAmountCents <= 0) {
      throw new Error(
        `Richmond result row ${cells[0]} has an invalid advertised amount.`,
      );
    }
    classifyOutcome(cells[8]);
    const redeemable = cells[6].toLowerCase();
    if (redeemable !== "yes" && redeemable !== "no") {
      throw new Error(
        `Richmond result row ${cells[0]} has an unfamiliar redeemable value.`,
      );
    }
    rows.push({
      listingIdentifier: cells[2],
      pid: cells[3],
      description: cells[5],
      redemptionLabel: `Redeemable - ${redeemable === "yes" ? "Yes" : "No"}`,
      advertisedAmountCents,
      winningRaw: cells[8],
    });
  }
  if (rows.length === 0) {
    throw new Error("The Richmond result table contained no parsable rows.");
  }
  if (new Set(rows.map(({ listingIdentifier }) => listingIdentifier)).size !== rows.length) {
    throw new Error("The Richmond result table contains duplicate AAN rows.");
  }

  return {
    saleDate: `${heading[3]}-${String(monthIndex + 1).padStart(2, "0")}-${String(
      Number(heading[2]),
    ).padStart(2, "0")}`,
    heading: heading[0],
    listingIdentifierLabel: "AAN",
    rows,
  };
}

export const RICHMOND_SOURCE = {
  id: "richmond",
  municipalityId: "richmond",
  municipality: "Municipality of the County of Richmond",
  shortMunicipality: "Richmond",
  landingPageUrl: "https://www.richmondcounty.ca/tax-sales.html",
  saleMethod: "public-auction",
  advertisedAmountLabel: "Taxes, interest, other charges",
  fieldsAvailable: [
    "AAN",
    "PID",
    "description",
    "redeemable",
    "taxes, interest, other charges",
    "successful bid",
  ],
  overwriteCaveat:
    "Richmond publishes its current result table at a page that can be replaced by a later sale. The archived result table is paired with the dated municipal advertisements still linked from the live page. The two identity columns were deliberately omitted from this public dataset.",
  snapshotPath: "richmondTaxSale.snapshot.json",
  parseResults,
  classifyOutcome,
  containsResultsTable,
};
