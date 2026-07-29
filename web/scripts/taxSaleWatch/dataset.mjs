// Serializers that reproduce the two hand-maintained data files byte for byte,
// so an automated ingest appends without reflowing the whole file. The round-trip
// tests in dataset.test.mjs are the contract: formatDataset(JSON.parse(x)) === x.

const RECORD_KEYS = [
  "eventId",
  "recordId",
  "listingIdentifier",
  "pids",
  "civicDescription",
  "advertisedAmountCents",
  "winningBidCents",
  "outcome",
  "resultNote",
  "redemptionLabel",
  "nspMatchStatus",
  "nspMatchMethod",
  "reviewState",
];

function value(input) {
  // Inline arrays are rendered with ", " between elements, matching the
  // hand-maintained files; JSON.stringify would omit the space.
  if (Array.isArray(input)) {
    return `[${input.map((element) => JSON.stringify(element)).join(", ")}]`;
  }
  return JSON.stringify(input);
}

function objectBlock(entry, indent, inlineArrays) {
  const pad = " ".repeat(indent);
  const inner = " ".repeat(indent + 2);
  const entries = Object.entries(entry);
  const lines = entries.map(([key, item], index) => {
    const comma = index < entries.length - 1 ? "," : "";
    if (Array.isArray(item) && !inlineArrays.has(key) && item.length > 1) {
      const items = item
        .map(
          (element, position) =>
            `${inner}  ${JSON.stringify(element)}${position < item.length - 1 ? "," : ""}`,
        )
        .join("\n");
      return `${inner}${value(key)}: [\n${items}\n${inner}]${comma}`;
    }
    return `${inner}${value(key)}: ${value(item)}${comma}`;
  });
  return `${pad}{\n${lines.join("\n")}\n${pad}}`;
}

export function formatDataset(dataset) {
  const events = dataset.events
    .map((event) => objectBlock(event, 4, new Set(Object.keys(event))))
    .join(",\n");

  const recordLines = [];
  let previousEventId = null;
  for (const record of dataset.records) {
    if (previousEventId !== null && record.eventId !== previousEventId) {
      recordLines.push("");
    }
    previousEventId = record.eventId;
    const pairs = RECORD_KEYS.filter((key) => key in record).map(
      (key) => `${value(key)}: ${value(record[key])}`,
    );
    recordLines.push(`    { ${pairs.join(", ")} }`);
  }
  const records = recordLines
    .map((line, index) => {
      const next = recordLines[index + 1];
      const needsComma = line !== "" && next !== undefined;
      return needsComma ? `${line},` : line;
    })
    .join("\n");

  return `{\n  ${value("schemaVersion")}: ${value(
    dataset.schemaVersion,
  )},\n  ${value("events")}: [\n${events}\n  ],\n  ${value(
    "records",
  )}: [\n${records}\n  ]\n}\n`;
}

export function formatLedger(ledger) {
  const inline = new Set(["fieldsAvailable"]);
  const coverage = ledger.coverage
    .map((entry) => objectBlock(entry, 4, inline))
    .join(",\n");
  return `{\n  ${value("schemaVersion")}: ${value(
    ledger.schemaVersion,
  )},\n  ${value("retrievedOn")}: ${value(ledger.retrievedOn)},\n  ${value(
    "coverage",
  )}: [\n${coverage}\n  ]\n}\n`;
}

export function eventIdFor(sourceId, saleDate) {
  return `${sourceId}-${saleDate}`;
}

function tally(source, rows) {
  const counts = { sold: 0, withdrawn: 0, unknown: 0 };
  for (const row of rows) {
    counts[source.classifyOutcome(row.winningRaw).outcome] += 1;
  }
  return counts;
}

export function buildEvent({ source, sale, capture, retrievedOn }) {
  const counts = tally(source, sale.rows);
  const parts = [
    `The ${sale.rows.length}-row ${sale.heading.replace(/\s+TAX\s+SALE\s+RESULTS$/iu, "")} result table was captured to the Wayback Machine and its archived id_ bytes were verified to carry the results table before ingestion.`,
  ];
  if (counts.sold > 0) {
    parts.push(`${counts.sold} rows publish a winning bid.`);
  }
  if (counts.withdrawn > 0) {
    parts.push(
      `${counts.withdrawn} rows publish ADJORNED, the municipality's own spelling of adjourned, and are recorded as withdrawn with no winning bid.`,
    );
  }
  if (counts.unknown > 0) {
    parts.push(
      `${counts.unknown} rows publish NOT COMPLETED with no amount and stay fail-closed as outcome unknown.`,
    );
  }
  parts.push(source.overwriteCaveat);

  return {
    id: eventIdFor(source.id, sale.saleDate),
    municipalityId: source.municipalityId,
    municipality: source.municipality,
    shortMunicipality: source.shortMunicipality,
    saleDate: sale.saleDate,
    saleMethod: source.saleMethod,
    listingIdentifierLabel: sale.listingIdentifierLabel,
    advertisedAmountLabel: source.advertisedAmountLabel,
    currency: "CAD",
    resultStatus: "verified",
    noticeUrl: capture.url,
    resultUrl: capture.url,
    landingPageUrl: source.landingPageUrl,
    retrievedOn,
    noticeSnapshotDate: retrievedOn,
    resultSnapshotDate: retrievedOn,
    noticeSha256: capture.sha256,
    resultSha256: capture.sha256,
    sourceNotes: parts.join(" "),
  };
}

export function buildRecords({ source, sale, eventId }) {
  return sale.rows.map((row) => {
    const classified = source.classifyOutcome(row.winningRaw);
    return {
      eventId,
      recordId: `${eventId}-aan-${row.listingIdentifier}`,
      listingIdentifier: row.listingIdentifier,
      pids: [row.pid],
      civicDescription: row.description,
      advertisedAmountCents: row.advertisedAmountCents,
      winningBidCents: classified.winningBidCents,
      outcome: classified.outcome,
      ...(classified.resultNote ? { resultNote: classified.resultNote } : {}),
      redemptionLabel: row.redemptionLabel,
      nspMatchStatus: "matched",
      nspMatchMethod: "exact-official-pid",
      reviewState: "visually-verified",
    };
  });
}

export function buildLedgerEntry({
  source,
  sale,
  capture,
  retrievedOn,
  livePageSha256,
}) {
  const counts = tally(source, sale.rows);
  const dispositions = [`${sale.rows.length} result rows were ingested`];
  if (counts.sold > 0) {
    dispositions.push(`${counts.sold} publish a winning bid`);
  }
  if (counts.withdrawn > 0) {
    dispositions.push(`${counts.withdrawn} publish ADJORNED, recorded as withdrawn`);
  }
  if (counts.unknown > 0) {
    dispositions.push(`${counts.unknown} publish NOT COMPLETED, kept outcome-unknown`);
  }

  return {
    municipality: source.municipality,
    event: `${sale.heading.replace(/\s+RESULTS$/iu, "")} (${source.saleMethod.replace("-", " ")})`,
    status: "included",
    officialUrls: [source.landingPageUrl, capture.url],
    documentSha256: [capture.sha256, livePageSha256],
    fieldsAvailable: source.fieldsAvailable ?? [
      sale.listingIdentifierLabel === "AAN" ? "AAN" : "Assessment",
      "PID",
      "description",
      "redemption expiry",
      "min bid",
      "winning bid",
    ],
    officialWinningBidsFound: counts.sold > 0,
    notes: `${dispositions.join("; ")}. The live municipal page is overwritten each sale, so the receipt is a Wayback capture of that address whose archived id_ bytes were verified to carry the results table; the second hash is a live retrieval of the page taken the same day. The assessed-name column was discarded before the repository dataset was written.`,
  };
}
