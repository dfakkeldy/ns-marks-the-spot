import { useEffect, useState } from "react";
import {
  FISHING_SPOTS_URL,
  fishingEvidenceLabels,
  fishingWaterTypes,
  type FishingEvidence,
  type FishingSpotProperties,
  type FishingWaterType,
} from "../layers/fishingLayers";
import { parseRulesFile, type RulesFile } from "./rules";

/**
 * The /fishing page's data files, served from `web/public/fishing/` beside
 * their LICENCE.txt and receipts, outside the app bundle. The page and its
 * map layer share one fetch of each file.
 */
export const FISHING_CALENDAR_URL = `${import.meta.env.BASE_URL}fishing/calendar.json`;
export const FISHING_RULES_URL = `${import.meta.env.BASE_URL}fishing/rules.json`;
export const FISHING_LICENCE_URL = `${import.meta.env.BASE_URL}fishing/LICENCE.txt`;

export interface FishingSpot extends FishingSpotProperties {
  readonly latitude: number;
  readonly longitude: number;
  /** The number on the spot's pin and card: its id's numeral, so S18 is 18. */
  readonly number: number;
}

export type CalendarGroup = "saltwater" | "freshwater" | "diadromous";

export interface CalendarSpecies {
  readonly key: string;
  readonly label: string;
  readonly group: CalendarGroup;
  /** Biology and reported fishing quality, never open seasons. */
  readonly monthsGood: readonly number[];
  readonly monthsPeak: readonly number[];
  /** No months are shown for this species: only its rules. */
  readonly rulesOnly: boolean;
  readonly notes: string;
}

export interface FishingCalendar {
  readonly checked: string;
  readonly note: string;
  /** In the file's order. */
  readonly species: readonly CalendarSpecies[];
}

export interface FishingData {
  readonly spots: readonly FishingSpot[];
  /** Spot records the page could not read and leaves out. */
  readonly rejectedSpots: number;
  /** Null when the file did not load or could not be read. */
  readonly calendar: FishingCalendar | null;
  /** Null when the file did not load or could not be read: the rules gate then shows links only. */
  readonly rules: RulesFile | null;
}

const SPOT_ID = /^S(\d{2})$/u;
const isText = (value: unknown): value is string => typeof value === "string";
const isMonthList = (value: unknown): value is number[] =>
  Array.isArray(value) && value.every((month) => Number.isInteger(month) && month >= 1 && month <= 12);
const isTextList = (value: unknown): value is string[] => Array.isArray(value) && value.every(isText);
const isHttpsUrl = (value: string) => {
  try { return new URL(value).protocol === "https:"; } catch { return false; }
};

/** The spot's number, or NaN for an id that is not `S` and two digits. */
export function spotNumber(id: string): number {
  const match = SPOT_ID.exec(id);
  return match ? Number(match[1]) : Number.NaN;
}

function parseSpot(value: unknown): FishingSpot | null {
  if (typeof value !== "object" || value === null) return null;
  const feature = value as { geometry?: { type?: unknown; coordinates?: unknown }; properties?: Record<string, unknown> };
  const coordinates = feature.geometry?.type === "Point" ? feature.geometry.coordinates : null;
  if (!Array.isArray(coordinates) || coordinates.length < 2) return null;
  const [longitude, latitude] = coordinates as unknown[];
  if (typeof longitude !== "number" || typeof latitude !== "number") return null;
  if (!Number.isFinite(longitude) || !Number.isFinite(latitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
  const properties = feature.properties ?? {};
  const { id, name, area, water_type, kind, species, species_text, best_months, peak_months, access, tip, why, caution, evidence, sources, rules_ref } = properties;
  if (!isText(id) || Number.isNaN(spotNumber(id)) || !isText(name) || name.trim() === "") return null;
  if (!isText(water_type) || !Object.hasOwn(fishingWaterTypes, water_type)) return null;
  if (!isText(evidence) || !Object.hasOwn(fishingEvidenceLabels, evidence)) return null;
  if (![area, kind, species_text, access, tip, why, caution].every(isText)) return null;
  if (!isTextList(species) || !isMonthList(best_months) || !isMonthList(peak_months)) return null;
  if (!isTextList(sources) || !isTextList(rules_ref)) return null;
  return {
    id,
    name,
    area: area as string,
    water_type: water_type as FishingWaterType,
    kind: kind as string,
    species,
    species_text: species_text as string,
    best_months: [...best_months].sort((a, b) => a - b),
    peak_months: [...peak_months].sort((a, b) => a - b),
    access: access as string,
    tip: tip as string,
    why: why as string,
    caution: caution as string,
    evidence: evidence as FishingEvidence,
    // Only https links are rendered; anything else is left out.
    sources: sources.filter(isHttpsUrl),
    rules_ref,
    latitude,
    longitude,
    number: spotNumber(id),
  };
}

export function parseSpots(value: unknown): { spots: FishingSpot[]; rejected: number } {
  const features = (value as { features?: unknown } | null)?.features;
  if (!Array.isArray(features)) throw new Error("The spot file is not a feature collection.");
  const seen = new Set<string>();
  const spots: FishingSpot[] = [];
  let rejected = 0;
  for (const feature of features) {
    const spot = parseSpot(feature);
    if (!spot || seen.has(spot.id)) {
      rejected += 1;
      continue;
    }
    seen.add(spot.id);
    spots.push(spot);
  }
  spots.sort((a, b) => a.number - b.number);
  return { spots, rejected };
}

const GROUPS: readonly CalendarGroup[] = ["saltwater", "freshwater", "diadromous"];

export function parseCalendar(value: unknown): FishingCalendar | null {
  if (typeof value !== "object" || value === null) return null;
  const file = value as { checked?: unknown; note?: unknown; species?: unknown };
  if (typeof file.species !== "object" || file.species === null) return null;
  const species: CalendarSpecies[] = [];
  for (const [key, raw] of Object.entries(file.species as Record<string, unknown>)) {
    if (typeof raw !== "object" || raw === null) continue;
    const entry = raw as Record<string, unknown>;
    if (!isText(entry.label) || !GROUPS.includes(entry.group as CalendarGroup)) continue;
    if (!isMonthList(entry.months_good) || !isMonthList(entry.months_peak) || typeof entry.rules_only !== "boolean") continue;
    species.push({
      key,
      label: entry.label,
      group: entry.group as CalendarGroup,
      // A rules-only species never carries months, whatever the file says.
      monthsGood: entry.rules_only ? [] : entry.months_good,
      monthsPeak: entry.rules_only ? [] : entry.months_peak,
      rulesOnly: entry.rules_only,
      notes: isText(entry.notes) ? entry.notes : "",
    });
  }
  return {
    checked: isText(file.checked) ? file.checked : "",
    note: isText(file.note) ? file.note : "",
    species,
  };
}

async function fetchJson(url: string, fetcher: typeof fetch, signal?: AbortSignal): Promise<unknown> {
  const response = await fetcher(url, { signal });
  if (!response.ok) throw new Error(`${url} answered ${response.status}`);
  return response.json();
}

/** The spot file is required; a missing calendar or rules file only hides those parts. */
export async function fetchFishingData(fetcher: typeof fetch = fetch): Promise<FishingData> {
  const [spotsResult, calendarResult, rulesResult] = await Promise.allSettled([
    fetchJson(FISHING_SPOTS_URL, fetcher),
    fetchJson(FISHING_CALENDAR_URL, fetcher),
    fetchJson(FISHING_RULES_URL, fetcher),
  ]);
  if (spotsResult.status === "rejected") throw spotsResult.reason;
  const { spots, rejected } = parseSpots(spotsResult.value);
  return {
    spots,
    rejectedSpots: rejected,
    calendar: calendarResult.status === "fulfilled" ? parseCalendar(calendarResult.value) : null,
    rules: rulesResult.status === "fulfilled" ? parseRulesFile(rulesResult.value) : null,
  };
}

export type FishingDataState =
  | { readonly status: "loading" }
  | { readonly status: "ready"; readonly data: FishingData }
  | { readonly status: "error" };

let pending: Promise<FishingData> | null = null;
let current: FishingDataState | null = null;
const listeners = new Set<(state: FishingDataState) => void>();

function publish(state: FishingDataState) {
  current = state;
  for (const listener of listeners) listener(state);
}

/**
 * One request per page load, shared by the panel, the hero and the map layer.
 * After a failure the next call tries again, and every reader sees the result.
 */
export function loadFishingData(): Promise<FishingData> {
  if (pending) return pending;
  if (current?.status === "error") publish({ status: "loading" });
  pending = fetchFishingData().then(
    (data) => {
      publish({ status: "ready", data });
      return data;
    },
    (error: unknown) => {
      pending = null;
      publish({ status: "error" });
      throw error;
    },
  );
  return pending;
}

/** Tests only: forget the shared request. */
export function resetFishingDataForTests() {
  pending = null;
  current = null;
}

/**
 * The shared files' state. Nothing is fetched while `enabled` is false, so the
 * full map loads them only once its spots layer is on; enabling it again after
 * a failure tries again.
 */
export function useFishingData(enabled = true): FishingDataState {
  const [state, setState] = useState<FishingDataState>(() => current ?? { status: "loading" });
  useEffect(() => {
    listeners.add(setState);
    if (current) setState(current);
    return () => { listeners.delete(setState); };
  }, []);
  useEffect(() => {
    // The listeners carry the result, failure included.
    if (enabled) loadFishingData().catch(() => undefined);
  }, [enabled]);
  return state;
}
