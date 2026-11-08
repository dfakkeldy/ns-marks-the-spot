import type { TaxSaleEvent } from "../data/taxSaleCatalog";
import type { FocusBounds } from "../focus/focusDefinition";
import { taxSaleDateBand } from "../services/taxSaleDateBands";

/**
 * The real facts behind a setup's first step. Web-only, and kept apart from
 * `builtInMapThemes`, so the five setups the iOS app ports keep their wording.
 */

/**
 * The soonest notice with a future sale date the municipality recorded, or
 * null. A notice with no date, or a passed one, never counts: this never
 * guesses at a next sale.
 */
export function nextDatedTaxSale<T extends TaxSaleEvent>(events: readonly T[], now: number): T | null {
  let next: T | null = null;
  let nextAt = Infinity;
  for (const event of events) {
    const band = taxSaleDateBand(event, now);
    if (band === "sale-date-passed" || band === "date-not-stated") continue;
    const at = new Date(event.saleStartsAt ?? "").getTime();
    if (at < nextAt) {
      next = event;
      nextAt = at;
    }
  }
  return next;
}

/** The sheet whose middle is closest to `center`; ties go to the lower sheet number. */
export function nearestSheet<T extends { readonly sheet: number; readonly bounds: FocusBounds | readonly (readonly number[])[] }>(
  sheets: readonly T[],
  center: { readonly latitude: number; readonly longitude: number },
): T | null {
  const cosLat = Math.cos((center.latitude * Math.PI) / 180);
  let best: T | null = null;
  let bestDistance = Infinity;
  for (const candidate of sheets) {
    const [[south, west], [north, east]] = candidate.bounds as FocusBounds;
    const dLat = (south + north) / 2 - center.latitude;
    const dLng = ((west + east) / 2 - center.longitude) * cosLat;
    const distance = dLat * dLat + dLng * dLng;
    if (distance < bestDistance) {
      best = candidate;
      bestDistance = distance;
    }
  }
  return best;
}

/** The box around GeoJSON geometries, or null if none has coordinates. */
export function geometryBounds(geometries: readonly (GeoJSON.Geometry | null | undefined)[]): FocusBounds | null {
  let south = Infinity, west = Infinity, north = -Infinity, east = -Infinity;
  const walk = (value: unknown): void => {
    if (!Array.isArray(value)) return;
    if (typeof value[0] === "number" && typeof value[1] === "number") {
      west = Math.min(west, value[0]); east = Math.max(east, value[0]);
      south = Math.min(south, value[1]); north = Math.max(north, value[1]);
      return;
    }
    value.forEach(walk);
  };
  for (const geometry of geometries) {
    if (geometry && "coordinates" in geometry) walk(geometry.coordinates);
  }
  return Number.isFinite(south) ? [[south, west], [north, east]] : null;
}

/** "Nov 23", in Atlantic time, from the sale time the notice records. */
export function shortSaleDate(saleStartsAt: string): string {
  return new Intl.DateTimeFormat("en-CA", { month: "short", day: "numeric", timeZone: "America/Halifax" })
    .format(new Date(saleStartsAt));
}

export const CURRENT_MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
] as const;
