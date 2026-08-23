import historicalDataset from "./historicalTaxSales.json";
import { cbrmTaxSaleEvent } from "./cbrmTaxSale";
import cbrmResultSnapshot from "./cbrmTaxSaleResults.snapshot.json";

// Pinned so the JSON and the app cannot drift silently. The watcher recomputes
// this whenever it ingests a sale; regenerate with:
//   node -e 'import("node:crypto").then(async ({createHash})=>console.log(createHash("sha256").update(await (await import("node:fs/promises")).readFile("src/data/historicalTaxSales.json")).digest("hex")))'
export const HISTORICAL_DATASET_SHA256 =
  "5e4be48bf01b2aa3f3f00d648f415d690093c50dd3b9d6b427495e96cbb78032";

export const CBRM_RESULT_DATASET_SHA256 =
  "dc57447252e40e8834fcee39d6ad69b20d24aba6b57b32f02ac52f610b934d64";

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

type CbrmResultRow = {
  lien: string;
  aan: string;
  pid: string;
  minimumBidCents: number;
  redemptionCategory: "six-month" | "immediate-deed";
  outcome: "sold" | "unknown";
  winningBidCents: number | null;
  resultNote?: string;
};

function validatedCbrmResults(): Map<string, CbrmResultRow> {
  if (
    cbrmResultSnapshot.schemaVersion !== 1 ||
    cbrmResultSnapshot.eventId !== cbrmTaxSaleEvent.id ||
    cbrmResultSnapshot.saleDate !== "2026-07-21" ||
    cbrmResultSnapshot.ownerNamesExcluded !== true ||
    cbrmResultSnapshot.resultRowCount !== cbrmResultSnapshot.results.length ||
    !/^https:\/\/cbrm\.ns\.ca\//u.test(cbrmResultSnapshot.source) ||
    !/^[a-f\d]{64}$/u.test(cbrmResultSnapshot.sourceDocumentSha256)
  ) {
    throw new Error("The CBRM result snapshot receipt is invalid.");
  }

  const noticeByLien = new Map(
    cbrmTaxSaleEvent.listings.map((listing) => [listing.lien, listing]),
  );
  const resultByLien = new Map<string, CbrmResultRow>();
  for (const rawResult of cbrmResultSnapshot.results) {
    const result = rawResult as CbrmResultRow;
    const notice = noticeByLien.get(result.lien);
    if (!notice || resultByLien.has(result.lien)) {
      throw new Error(
        `CBRM result ${result.lien} is missing from the notice or duplicated.`,
      );
    }
    if (
      notice.aan !== result.aan ||
      !notice.pids.includes(result.pid) ||
      notice.financial.amountCents !== result.minimumBidCents ||
      notice.redemptionCategory !== result.redemptionCategory
    ) {
      throw new Error(
        `CBRM result ${result.lien} does not match its owner-free notice fields.`,
      );
    }
    if (
      (result.outcome === "sold" &&
        (!Number.isInteger(result.winningBidCents) ||
          result.winningBidCents === null ||
          result.winningBidCents < 0)) ||
      (result.outcome === "unknown" && result.winningBidCents !== null) ||
      !["sold", "unknown"].includes(result.outcome)
    ) {
      throw new Error(`CBRM result ${result.lien} has an invalid outcome.`);
    }
    resultByLien.set(result.lien, result);
  }
  return resultByLien;
}

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

const cbrmResultsByLien = validatedCbrmResults();
const cbrmSoldCount = [...cbrmResultsByLien.values()].filter(
  ({ outcome }) => outcome === "sold",
).length;
const cbrmUnknownCount = cbrmResultsByLien.size - cbrmSoldCount;
const cbrmOmittedCount =
  cbrmTaxSaleEvent.listings.length - cbrmResultsByLien.size;

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
        resultStatus: "verified",
        resultUrl: cbrmResultSnapshot.source,
        retrievedOn: cbrmResultSnapshot.retrievedDate,
        noticeSnapshotDate: "2026-07-19",
        resultSnapshotDate: cbrmResultSnapshot.retrievedDate,
        noticeSha256:
          "5435e9b89df5ac15f63097c0935661b5616e7b6bdc8b04fd4e8811ba6d457566",
        resultSha256: cbrmResultSnapshot.sourceDocumentSha256,
        sourceNotes:
          `The owner-free official notice was reconciled and all exact PIDs matched NSPRD. CBRM's ${cbrmResultSnapshot.resultRowCount}-row official result PDF was rendered and reviewed: ${cbrmSoldCount} rows print numeric winning bids, ${cbrmUnknownCount} published result rows stay outcome-unknown because no numeric bid is printed, and ${cbrmOmittedCount} notice rows absent from the result PDF also stay outcome-unknown. Owner fields were discarded before the public snapshot was written.`,
      },
    ],
    records: [
      ...(historicalDataset as HistoricalDataset).records,
      ...cbrmTaxSaleEvent.listings.map((listing) => {
        const result = cbrmResultsByLien.get(listing.lien ?? "");
        return {
          eventId: cbrmTaxSaleEvent.id,
          recordId: listing.recordId,
          listingIdentifier: listing.lien ?? listing.recordId,
          pids: listing.pids,
          civicDescription: [listing.addressOrDescription, listing.location]
            .filter(Boolean)
            .join(" · "),
          advertisedAmountCents: listing.financial.amountCents,
          winningBidCents: result?.winningBidCents ?? null,
          outcome: result?.outcome ?? ("unknown" as const),
          resultNote:
            result?.resultNote ??
            (result
              ? undefined
              : "The official result PDF does not carry this notice row; no outcome or winning bid is inferred."),
          redemptionLabel: listing.redemptionLabel,
          nspMatchStatus: "matched" as const,
          nspMatchMethod: "exact-official-pid" as const,
          reviewState: result
            ? ("visually-verified" as const)
            : ("notice-verified" as const),
        };
      }),
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
