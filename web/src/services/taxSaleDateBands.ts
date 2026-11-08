import {
  eventLifecycleStatus,
  type TaxSaleEvent,
  type TaxSaleListing,
} from "../data/taxSaleCatalog";

/**
 * Sale-date bands for current tax-sale notice dots, relative to "now".
 *
 * Only the sale date the municipal notice records (`saleStartsAt`) is used.
 * A notice with no date, or one that does not parse, is `date-not-stated`:
 * never guessed, never folded into `sale-date-passed`.
 */
export type TaxSaleDateBand =
  | "within-7-days"
  | "within-30-days"
  | "later"
  | "sale-date-passed"
  | "date-not-stated";

export const TAX_SALE_DATE_BAND_ORDER: readonly TaxSaleDateBand[] = [
  "within-7-days",
  "within-30-days",
  "later",
  "sale-date-passed",
  "date-not-stated",
];

export const TAX_SALE_DATE_BAND_LABEL: Record<TaxSaleDateBand, string> = {
  "within-7-days": "Within 7 days",
  "within-30-days": "Within 30 days",
  later: "Later",
  "sale-date-passed": "Sale date passed — verify results",
  "date-not-stated": "Date not stated",
};

/** Dot paint per band. `dashed` marks the band whose date is unknown. */
export type TaxSaleDateBandStyle = {
  fill: string;
  stroke: string;
  fillOpacity: number;
  dashed: boolean;
};

/**
 * Ordered for urgency: the soonest band keeps the map's survey red, the
 * month band is orange, later sales a calm blue. Red/orange/blue stay apart
 * under protan, deutan and tritan vision; red and orange also differ in
 * lightness. Passed sales recede to grey, and an unknown date is a hollow
 * white dot with a dashed ring — a different treatment, not one more hue.
 */
export const TAX_SALE_DATE_BAND_STYLE: Record<
  TaxSaleDateBand,
  TaxSaleDateBandStyle
> = {
  "within-7-days": { fill: "#be4d3c", stroke: "#ffffff", fillOpacity: 0.92, dashed: false },
  "within-30-days": { fill: "#e3901b", stroke: "#ffffff", fillOpacity: 0.92, dashed: false },
  later: { fill: "#2f6fb0", stroke: "#ffffff", fillOpacity: 0.9, dashed: false },
  "sale-date-passed": { fill: "#8a8a8a", stroke: "#ffffff", fillOpacity: 0.75, dashed: false },
  "date-not-stated": { fill: "#ffffff", stroke: "#3d3d3d", fillOpacity: 0.95, dashed: true },
};

const ATLANTIC_DAY = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Halifax",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Calendar day in Atlantic time, as a UTC-midnight day number. */
function atlanticDayNumber(timestamp: number): number {
  const parts = ATLANTIC_DAY.formatToParts(new Date(timestamp));
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((entry) => entry.type === type)?.value);
  return Date.UTC(part("year"), part("month") - 1, part("day")) / 86_400_000;
}

/** Parsed sale time in ms, or null when the notice states none. */
export function saleTimestamp(event: Pick<TaxSaleEvent, "saleStartsAt">): number | null {
  if (!event.saleStartsAt) {
    return null;
  }
  const timestamp = Date.parse(event.saleStartsAt);
  return Number.isFinite(timestamp) ? timestamp : null;
}

export function taxSaleDateBand(
  event: TaxSaleEvent,
  now: Date | number = Date.now(),
): TaxSaleDateBand {
  const sale = saleTimestamp(event);
  if (sale === null) {
    return "date-not-stated";
  }
  const nowTimestamp = now instanceof Date ? now.getTime() : now;
  // Same rule as the panel's lifecycle label, so dot and text never disagree.
  if (
    eventLifecycleStatus(event, nowTimestamp) !== "upcoming" ||
    sale <= nowTimestamp
  ) {
    return "sale-date-passed";
  }
  const days = atlanticDayNumber(sale) - atlanticDayNumber(nowTimestamp);
  if (days <= 7) {
    return "within-7-days";
  }
  if (days <= 30) {
    return "within-30-days";
  }
  return "later";
}

/**
 * Band for each advertised PID across the given notices. A PID advertised
 * by more than one notice takes the earliest band in TAX_SALE_DATE_BAND_ORDER
 * (the soonest upcoming sale), a deterministic choice between recorded dates.
 */
export function taxSaleDateBandsByPid(
  events: TaxSaleEvent[],
  now: Date | number,
  includeListing: (listing: TaxSaleListing) => boolean = () => true,
): Map<string, TaxSaleDateBand> {
  const bands = new Map<string, TaxSaleDateBand>();
  for (const event of events) {
    const band = taxSaleDateBand(event, now);
    for (const listing of event.listings) {
      if (listing.listingStatus !== "advertised" || !includeListing(listing)) {
        continue;
      }
      for (const pid of listing.pids) {
        const existing = bands.get(pid);
        if (
          existing === undefined ||
          TAX_SALE_DATE_BAND_ORDER.indexOf(band) <
            TAX_SALE_DATE_BAND_ORDER.indexOf(existing)
        ) {
          bands.set(pid, band);
        }
      }
    }
  }
  return bands;
}

/**
 * Sales in the order a reader acts on them: the nearest upcoming date first,
 * then any sale with no stated date, then past dates, newest first. The bands
 * decide which group a sale is in, so the rail and the dots cannot disagree.
 */
export function taxSaleEventsByUrgency(
  events: TaxSaleEvent[],
  now: Date | number = Date.now(),
): { upcoming: TaxSaleEvent[]; past: TaxSaleEvent[] } {
  const when = (event: TaxSaleEvent) => saleTimestamp(event) ?? Number.POSITIVE_INFINITY;
  const upcoming = events.filter((event) => taxSaleDateBand(event, now) !== "sale-date-passed");
  const past = events.filter((event) => taxSaleDateBand(event, now) === "sale-date-passed");
  return {
    upcoming: [...upcoming].sort((a, b) => when(a) - when(b)),
    past: [...past].sort((a, b) => (saleTimestamp(b) ?? 0) - (saleTimestamp(a) ?? 0)),
  };
}
