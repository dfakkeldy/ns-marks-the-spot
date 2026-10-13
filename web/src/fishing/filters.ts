import type { CalendarGroup, FishingCalendar, FishingSpot } from "./data";

/** What the page's month and species controls ask for; null is "any". */
export interface SpotFilters {
  readonly month: number | null;
  readonly species: string | null;
}

export const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
] as const;

export function monthName(month: number): string {
  return MONTH_NAMES[month - 1] ?? "";
}

/**
 * A month matches a spot's good months (its peak months are a subset), which
 * describe fish and reported fishing quality, not open seasons. Seasons that
 * run over the new year are plain month lists, so January matches a
 * November-to-March spot without any wrap-around arithmetic.
 */
export function spotMatches(spot: Pick<FishingSpot, "best_months" | "species">, filters: SpotFilters): boolean {
  if (filters.month !== null && !spot.best_months.includes(filters.month)) return false;
  if (filters.species !== null && !spot.species.includes(filters.species)) return false;
  return true;
}

export function filterSpots<T extends Pick<FishingSpot, "best_months" | "species">>(spots: readonly T[], filters: SpotFilters): T[] {
  return spots.filter((spot) => spotMatches(spot, filters));
}

export function hasActiveFilter(filters: SpotFilters): boolean {
  return filters.month !== null || filters.species !== null;
}

export type MonthLevel = "peak" | "good" | "none";

/** Twelve cells, January first, for a card's month strip. */
export function monthStrip(spot: Pick<FishingSpot, "best_months" | "peak_months">): { month: number; level: MonthLevel }[] {
  return MONTH_NAMES.map((_, index) => {
    const month = index + 1;
    const level: MonthLevel = spot.peak_months.includes(month) ? "peak" : spot.best_months.includes(month) ? "good" : "none";
    return { month, level };
  });
}

export function calendarLevel(species: { monthsGood: readonly number[]; monthsPeak: readonly number[] }, month: number): MonthLevel {
  return species.monthsPeak.includes(month) ? "peak" : species.monthsGood.includes(month) ? "good" : "none";
}

export interface SpeciesOption {
  readonly key: string;
  readonly label: string;
  readonly group: CalendarGroup | "other";
}

/**
 * The species a reader can filter by: those at least one spot names, in the
 * calendar's order. A rules-only species (salmon, eel) is never offered,
 * because no spot is listed for it.
 */
export function speciesOptions(spots: readonly Pick<FishingSpot, "species">[], calendar: FishingCalendar | null): SpeciesOption[] {
  const used = new Set(spots.flatMap(({ species }) => species));
  const known = (calendar?.species ?? []).filter(({ key, rulesOnly }) => used.has(key) && !rulesOnly);
  const knownKeys = new Set(known.map(({ key }) => key));
  const rulesOnly = new Set((calendar?.species ?? []).filter(({ rulesOnly: only }) => only).map(({ key }) => key));
  const unknown = [...used].filter((key) => !knownKeys.has(key) && !rulesOnly.has(key)).sort();
  return [
    ...known.map(({ key, label, group }) => ({ key, label, group })),
    ...unknown.map((key) => ({ key, label: speciesFallbackLabel(key), group: "other" as const })),
  ];
}

export function speciesFallbackLabel(key: string): string {
  const words = key.replace(/_/gu, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function speciesLabel(key: string, calendar: FishingCalendar | null): string {
  return calendar?.species.find((species) => species.key === key)?.label ?? speciesFallbackLabel(key);
}

/** "October and Cunner"; empty when no filter is set. */
export function describeFilters(filters: SpotFilters, calendar: FishingCalendar | null): string {
  return [
    filters.month !== null ? monthName(filters.month) : null,
    filters.species !== null ? speciesLabel(filters.species, calendar) : null,
  ].filter((part): part is string => part !== null).join(" and ");
}

/** "7 of 27 spots for October and Cunner", for the list and its live region. */
export function filterSummary(shown: number, total: number, filters: SpotFilters, calendar: FishingCalendar | null): string {
  const spots = (count: number) => `${count} ${count === 1 ? "spot" : "spots"}`;
  if (!hasActiveFilter(filters)) return `All ${spots(total)}`;
  const described = describeFilters(filters, calendar);
  return shown === 0 ? `No spots for ${described}` : `${shown} of ${spots(total)} for ${described}`;
}
