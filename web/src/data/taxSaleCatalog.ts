import { cbrmTaxSaleEvent } from "./cbrmTaxSale";
import { invernessTaxSaleEvent } from "./invernessTaxSale";
import type {
  TaxSaleEvent,
  TaxSaleEventStatus,
  TaxSaleListing,
} from "./taxSaleTypes";

export type { TaxSaleEvent, TaxSaleListing } from "./taxSaleTypes";

export const taxSaleEvents: TaxSaleEvent[] = [
  cbrmTaxSaleEvent,
  invernessTaxSaleEvent,
];

export function eventsForStatus(
  status: TaxSaleEventStatus,
): TaxSaleEvent[] {
  return taxSaleEvents.filter(({ eventStatus }) => eventStatus === status);
}

export function pidsForEvents(events: TaxSaleEvent[]): string[] {
  return Array.from(
    new Set(events.flatMap(({ listings }) => listings.flatMap(({ pids }) => pids))),
  );
}

export function listingContextForPid(
  pid: string,
): { event: TaxSaleEvent; listing: TaxSaleListing } | undefined {
  for (const event of taxSaleEvents) {
    const listing = event.listings.find(({ pids }) => pids.includes(pid));
    if (listing) {
      return { event, listing };
    }
  }
  return undefined;
}
