import historicalDataset from "./historicalTaxSales.json";
import { cbrmTaxSaleEvent } from "./cbrmTaxSale";

// Pinned so the JSON and the app cannot drift silently. The watcher recomputes
// this whenever it ingests a sale; regenerate with:
//   node -e 'import("node:crypto").then(async ({createHash})=>console.log(createHash("sha256").update(await (await import("node:fs/promises")).readFile("src/data/historicalTaxSales.json")).digest("hex")))'
export const HISTORICAL_DATASET_SHA256 =
  "893706b440234d1c2b7271641888077b30287b5423c486876eb9f44d751d3b12";

export type HistoricalOutcome =
  | "sold"
  | "unsold"
  | "withdrawn"
  | "cancelled"
  | "redeemed"
  | "unknown";

export type HistoricalSaleMethod = "public-auction" | "sealed-tender";
export type HistoricalResultStatus =
  | "verified"
  | "awaiting-official-results";
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
  landingPageUrl?: string;
  resultStatus: HistoricalResultStatus;
  resultUrl?: string;
  retrievedOn: string;
  noticeSnapshotDate: string;
  resultSnapshotDate?: string;
  resultCheckedOn?: string;
  noticeSha256: string;
  resultSha256?: string;
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
  reviewState: "visually-verified" | "notice-verified" | "needs-review";
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
const resultStatuses = new Set<HistoricalResultStatus>([
  "verified",
  "awaiting-official-results",
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

  for (const event of dataset.events) {
    if (!resultStatuses.has(event.resultStatus)) {
      throw new Error(`Historical event ${event.id} has an invalid result status.`);
    }
    if (
      event.resultStatus === "verified" &&
      (!event.resultUrl || !event.resultSnapshotDate || !event.resultSha256)
    ) {
      throw new Error(`Verified historical event ${event.id} requires a result receipt.`);
    }
    if (
      event.resultStatus === "awaiting-official-results" &&
      (!event.landingPageUrl || !event.resultCheckedOn)
    ) {
      throw new Error(
        `Historical event ${event.id} awaiting results requires a checked landing page.`,
      );
    }
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
      record.reviewState !== "notice-verified" &&
      record.reviewState !== "needs-review"
    ) {
      throw new Error(`Historical record ${record.recordId} has invalid review state.`);
    }
  }

  return dataset;
}

const validatedDataset = validateHistoricalTaxSaleDataset(
  {
    ...(historicalDataset as HistoricalDataset),
    events: [
      ...(historicalDataset as HistoricalDataset).events,
      {
        id: cbrmTaxSaleEvent.id,
        municipalityId: cbrmTaxSaleEvent.municipalityId,
        municipality: cbrmTaxSaleEvent.municipality,
        shortMunicipality: cbrmTaxSaleEvent.shortMunicipality,
        saleDate: "2026-07-21",
        saleMethod: "public-auction",
        listingIdentifierLabel: "Lien",
        advertisedAmountLabel: "Minimum bid",
        currency: "CAD",
        noticeUrl: cbrmTaxSaleEvent.sourceUrl,
        landingPageUrl: cbrmTaxSaleEvent.landingPageUrl,
        resultStatus: "awaiting-official-results",
        retrievedOn: "2026-07-21",
        noticeSnapshotDate: "2026-07-19",
        resultCheckedOn: "2026-07-21",
        noticeSha256:
          "5435e9b89df5ac15f63097c0935661b5616e7b6bdc8b04fd4e8811ba6d457566",
        sourceNotes:
          "The owner-free official notice was reconciled and all exact PIDs matched NSPRD. CBRM had not yet linked July 21 results when its tax-sale page was checked after the auction; no parcel outcome or winning bid is inferred.",
      },
    ],
    records: [
      ...(historicalDataset as HistoricalDataset).records,
      ...cbrmTaxSaleEvent.listings.map((listing) => ({
        eventId: cbrmTaxSaleEvent.id,
        recordId: listing.recordId,
        listingIdentifier: listing.lien ?? listing.recordId,
        pids: listing.pids,
        civicDescription: [listing.addressOrDescription, listing.location]
          .filter(Boolean)
          .join(" · "),
        advertisedAmountCents: listing.financial.amountCents,
        winningBidCents: null,
        outcome: "unknown" as const,
        resultNote:
          "Official results are pending. CBRM says results will be posted after payment is confirmed.",
        redemptionLabel: listing.redemptionLabel,
        nspMatchStatus: "matched" as const,
        nspMatchMethod: "exact-official-pid" as const,
        reviewState: "notice-verified" as const,
      })),
    ],
  },
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
