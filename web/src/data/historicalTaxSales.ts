import historicalDataset from "./historicalTaxSales.json";

export type HistoricalOutcome =
  | "sold"
  | "unsold"
  | "withdrawn"
  | "cancelled"
  | "redeemed"
  | "unknown";

export type HistoricalSaleMethod = "public-auction" | "sealed-tender";
export type NsprdMatchStatus = "matched" | "ambiguous" | "unmatched";
export type NsprdMatchMethod =
  | "exact-official-pid"
  | "deterministic-reconciliation"
  | "none";

export type HistoricalTaxSaleEvent = {
  id: string;
  municipalityId: string;
  municipality: string;
  shortMunicipality: string;
  saleDate: string;
  saleMethod: HistoricalSaleMethod;
  listingIdentifierLabel: string;
  advertisedAmountLabel: string;
  currency: "CAD";
  noticeUrl: string;
  termsUrl?: string;
  resultUrl: string;
  retrievedOn: string;
  noticeSnapshotDate: string;
  resultSnapshotDate: string;
  noticeSha256: string;
  resultSha256: string;
  sourceNotes: string;
};

export type HistoricalTaxSaleRecord = {
  eventId: string;
  recordId: string;
  listingIdentifier: string;
  pids: string[];
  civicDescription: string;
  advertisedAmountCents: number;
  winningBidCents: number | null;
  outcome: HistoricalOutcome;
  resultNote?: string;
  redemptionLabel: string;
  nspMatchStatus: NsprdMatchStatus;
  nspMatchMethod: NsprdMatchMethod;
  reviewState: "visually-verified" | "needs-review";
};

export type HistoricalRecordContext = {
  event: HistoricalTaxSaleEvent;
  record: HistoricalTaxSaleRecord;
};

export type FinancialComparison = {
  differenceCents: number;
  percentageAbove: number;
  winningBidMultiple: number;
};

type HistoricalDataset = {
  schemaVersion: number;
  events: HistoricalTaxSaleEvent[];
  records: HistoricalTaxSaleRecord[];
};

const PID_PATTERN = /^\d{8}$/u;
const historicalOutcomes = new Set<HistoricalOutcome>([
  "sold",
  "unsold",
  "withdrawn",
  "cancelled",
  "redeemed",
  "unknown",
]);
const matchStatuses = new Set<NsprdMatchStatus>([
  "matched",
  "ambiguous",
  "unmatched",
]);
const matchMethods = new Set<NsprdMatchMethod>([
  "exact-official-pid",
  "deterministic-reconciliation",
  "none",
]);

export function validateHistoricalTaxSaleDataset(
  dataset: HistoricalDataset,
): HistoricalDataset {
  if (dataset.schemaVersion !== 1) {
    throw new Error("Unsupported historical tax-sale dataset schema.");
  }

  const eventIds = new Set(dataset.events.map(({ id }) => id));
  if (eventIds.size !== dataset.events.length) {
    throw new Error("Historical tax-sale event IDs must be unique.");
  }

  const recordIds = new Set<string>();
  for (const record of dataset.records) {
    if (!eventIds.has(record.eventId)) {
      throw new Error(`Historical record ${record.recordId} has no event.`);
    }
    if (recordIds.has(record.recordId)) {
      throw new Error(`Duplicate historical record ID ${record.recordId}.`);
    }
    recordIds.add(record.recordId);

    if (record.pids.length === 0 || record.pids.some((pid) => !PID_PATTERN.test(pid))) {
      throw new Error(`Historical record ${record.recordId} has an invalid PID.`);
    }
    if (new Set(record.pids).size !== record.pids.length) {
      throw new Error(`Historical record ${record.recordId} repeats a PID.`);
    }
    if (!historicalOutcomes.has(record.outcome)) {
      throw new Error(`Historical record ${record.recordId} has an invalid outcome.`);
    }
    if (
      !matchStatuses.has(record.nspMatchStatus) ||
      !matchMethods.has(record.nspMatchMethod)
    ) {
      throw new Error(`Historical record ${record.recordId} has invalid match metadata.`);
    }
    if (
      !Number.isInteger(record.advertisedAmountCents) ||
      record.advertisedAmountCents <= 0 ||
      (record.winningBidCents !== null &&
        (!Number.isInteger(record.winningBidCents) || record.winningBidCents < 0))
    ) {
      throw new Error(`Historical record ${record.recordId} has invalid cents.`);
    }
    if (record.outcome === "sold" && record.winningBidCents === null) {
      throw new Error(`Sold record ${record.recordId} requires a winning bid.`);
    }
    if (record.outcome === "unsold" && record.winningBidCents !== null) {
      throw new Error(`Unsold record ${record.recordId} cannot have a winning bid.`);
    }
    if (
      record.nspMatchStatus === "matched" &&
      record.nspMatchMethod === "none"
    ) {
      throw new Error(`Matched record ${record.recordId} requires a match method.`);
    }
    if (
      record.nspMatchStatus !== "matched" &&
      record.nspMatchMethod !== "none"
    ) {
      throw new Error(
        `Non-matched record ${record.recordId} cannot claim a match method.`,
      );
    }
    if (
      record.reviewState !== "visually-verified" &&
      record.reviewState !== "needs-review"
    ) {
      throw new Error(`Historical record ${record.recordId} has invalid review state.`);
    }
  }

  return dataset;
}

const validatedDataset = validateHistoricalTaxSaleDataset(
  historicalDataset as HistoricalDataset,
);

export const historicalTaxSaleEvents = validatedDataset.events;
export const historicalTaxSaleRecords = validatedDataset.records;

const eventById = new Map(
  historicalTaxSaleEvents.map((event) => [event.id, event]),
);

export function historicalContextsForPid(pid: string): HistoricalRecordContext[] {
  return historicalTaxSaleRecords.flatMap((record) => {
    if (!record.pids.includes(pid)) {
      return [];
    }
    const event = eventById.get(record.eventId);
    return event ? [{ event, record }] : [];
  });
}

export function matchedHistoricalPids(
  records: readonly HistoricalTaxSaleRecord[] = historicalTaxSaleRecords,
): string[] {
  return Array.from(
    new Set(
      records
        .filter(({ nspMatchStatus }) => nspMatchStatus === "matched")
        .flatMap(({ pids }) => pids),
    ),
  );
}

export function calculateFinancialComparison(
  event: HistoricalTaxSaleEvent,
  record: HistoricalTaxSaleRecord,
): FinancialComparison | null {
  if (
    event.currency !== "CAD" ||
    record.winningBidCents === null ||
    record.advertisedAmountCents <= 0
  ) {
    return null;
  }

  const differenceCents = record.winningBidCents - record.advertisedAmountCents;
  return {
    differenceCents,
    percentageAbove:
      Math.round((differenceCents / record.advertisedAmountCents) * 10_000) / 100,
    winningBidMultiple:
      Math.round((record.winningBidCents / record.advertisedAmountCents) * 100) /
      100,
  };
}

export function historicalOutcomeLabel(outcome: HistoricalOutcome): string {
  switch (outcome) {
    case "sold":
      return "Sold";
    case "unsold":
      return "Unsold - no bids";
    case "withdrawn":
      return "Withdrawn";
    case "cancelled":
      return "Cancelled";
    case "redeemed":
      return "Redeemed";
    case "unknown":
      return "Outcome unknown";
  }
}
