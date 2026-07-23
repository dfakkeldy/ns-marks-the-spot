import {
  eventLifecycleStatus,
  type TaxSaleEvent,
  type TaxSaleListing,
} from "../data/taxSaleCatalog";
import type { HistoricalRecordContext } from "../data/historicalTaxSales";

export const currency = new Intl.NumberFormat("en-CA", {
  style: "currency",
  currency: "CAD",
});

export const eventDate = new Intl.DateTimeFormat("en-CA", {
  dateStyle: "long",
  timeZone: "America/Halifax",
});

export function eventDateLabel(event: TaxSaleEvent): string {
  const timestamp = event.saleStartsAt ?? event.closedAt;
  return timestamp ? eventDate.format(new Date(timestamp)) : "Date not listed";
}

export function eventLifecycleLabel(event: TaxSaleEvent, now: number): string {
  switch (eventLifecycleStatus(event, now)) {
    case "historical":
      return "Historical";
    case "verify-results":
      return "Past sale date — verify results with the municipality.";
    case "upcoming":
      return "Upcoming";
  }
}

export function listingStatusLabel(listing: TaxSaleListing): string {
  switch (listing.listingStatus) {
    case "advertised":
      return "Advertised in notice";
    case "withdrawn":
      return "Withdrawn in current municipal notice revision";
    case "sold":
      return "Historical sold result - not available";
    case "unsold":
      return "Historical unsold result - not available";
  }
}

export function historicalSaleMethodLabel(
  method: HistoricalRecordContext["event"]["saleMethod"],
): string {
  return method === "sealed-tender" ? "Sealed tender" : "Public auction";
}

export function matchMethodLabel(
  context: HistoricalRecordContext,
): string {
  switch (context.record.nspMatchMethod) {
    case "exact-official-pid":
      return "Exact official eight-digit PID";
    case "deterministic-reconciliation":
      return "Deterministic authoritative-field reconciliation";
    case "none":
      return "Not matched";
  }
}
