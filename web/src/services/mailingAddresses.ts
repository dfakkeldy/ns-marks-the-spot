import { gunzipSync, strFromU8 } from "fflate";
import {
  fetchViewportCivicAddresses, formatCivicRoadName, searchCivicAddresses,
  type CivicAddress,
} from "./civicAddresses";

export const MAILING_SOURCE_URL = "https://www150.statcan.gc.ca/n1/pub/46-26-0002/462600022022001-eng.htm";
export const MAILING_LICENCE_URL = "https://www.statcan.gc.ca/en/terms-conditions/open-licence";
export const MAILING_ATTRIBUTION = "Adapted from Statistics Canada, National Address Register, June 2026. This does not constitute an endorsement by Statistics Canada of this product.";
export const MAILING_DATE = "June 2026";
export type MailingRecord = {
  id: string; number: string; suffix: string; unit: string; road: string;
  street: string; city: string; postalCode: string; additional: string;
  coordinates: [number, number];
};
export type MailingMatch = { status: "matched"; record: MailingRecord } |
  { status: "unmatched" | "ambiguous" | "source-error" };
export type MailingCivicAddress = CivicAddress & { mailing?: MailingMatch };
type StreetIndex = { key: string; cities: string[] };
type Index = { version: 1; streets: StreetIndex[] };
type Shard = { version: 1; streets: Record<string, MailingRecord[]> };
const MAX_DISTANCE_METRES = 50;
const MAX_SEARCH_ROADS = 6;
const MAX_SEARCH_CANDIDATES = 6;
const aliases: Record<string, string> = {
  road:"rd", street:"st", avenue:"ave", drive:"dr", lane:"ln", highway:"hwy", route:"hwy",
  boulevard:"blvd", court:"crt", place:"pl", crescent:"cres", terrace:"terr", trail:"trl",
  north:"n", south:"s", east:"e", west:"w",
};
// Also used by scripts/generateMailingAddresses.py to choose the same street shard.
export function normalizeAddress(value: string): string {
  return value.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase()
    .replace(/[.'’]/gu, "").replace(/[^a-z0-9]+/gu, " ").trim()
    .split(/\s+/u).map(word => aliases[word] ?? word).join(" ");
}
export function mailingShard(key: string): string {
  let hash = 2166136261;
  for (const char of key) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619) >>> 0;
  return (hash % 128).toString(16).padStart(2, "0");
}
function distance(a: [number, number], b: [number, number]): number {
  const radians = Math.PI / 180;
  const x = (a[0] - b[0]) * radians * Math.cos((a[1] + b[1]) / 2 * radians);
  const y = (a[1] - b[1]) * radians;
  return Math.hypot(x, y) * 6371000;
}
function component(value: unknown): string { return String(value ?? "").trim().toUpperCase(); }
function unit(value: unknown): string { return component(value).replace(/^UNIT\s+/u, ""); }
export function matchMailingAddress(address: CivicAddress, records: MailingRecord[]): MailingMatch {
  const p = address.properties;
  const key = normalizeAddress(formatCivicRoadName(p) ?? "");
  const matches = new Map(records.filter(row =>
    component(row.number) === component(p.civicnum) && component(row.suffix) === component(p.civsuffix) &&
    unit(row.unit) === unit(p.unit_num) && normalizeAddress(row.road) === key &&
    distance(address.coordinates, row.coordinates) <= MAX_DISTANCE_METRES,
  ).map(row => [row.id, row]));
  return matches.size === 1 ? { status: "matched", record: [...matches.values()][0] } :
    { status: matches.size ? "ambiguous" : "unmatched" };
}
export function mailingLabel(record: MailingRecord): string {
  const postcode = record.postalCode.replace(/\s/gu, "").replace(/^(.{3})(.{3})$/u, "$1 $2");
  return `${record.unit ? `${record.unit}-` : ""}${record.number}${record.suffix} ${record.street}, ${record.city}, NS ${postcode}`;
}
function matchesTerms(label: string, query: string, suggest: boolean): boolean {
  const words = normalizeAddress(label).split(" ");
  const terms = normalizeAddress(query).split(" ").filter(Boolean);
  return terms.length > 0 && terms.every((term, index) => words.includes(term) ||
    (suggest && index === terms.length - 1 && /^[a-z]+$/u.test(term) && words.some(word => word.startsWith(term))));
}
function postalQuery(query: string): string {
  return query.replace(/^\s*unit\s+([a-z0-9]+),?\s+(\d+[a-z]?)(?=\s)/iu, "$1-$2");
}
export function matchesMailingQuery(record: MailingRecord, query: string, suggest: boolean): boolean {
  return matchesTerms(`${record.number}${record.suffix} ${record.unit} ${record.road} ${record.street} ${record.city} NS ${record.postalCode.replace(/^(.{3})(.{3})$/u,"$1 $2")}`, postalQuery(query), suggest);
}

// Cache successfully decoded assets only. A cancelled search cannot poison the
// next one; the bounded LRU avoids retaining the province on a phone.
const cache = new Map<string, Index | Shard>();
function validRecord(row: unknown): row is MailingRecord {
  if (!row || typeof row !== "object") return false;
  const r = row as MailingRecord;
  return [r.id,r.number,r.suffix,r.unit,r.road,r.street,r.city,r.postalCode,r.additional].every(v => typeof v === "string") &&
    Boolean(r.id && r.number && r.road && r.street && r.city) && /^[A-Z]\d[A-Z]\s?\d[A-Z]\d$/u.test(r.postalCode) &&
    Array.isArray(r.coordinates) && r.coordinates.length === 2 && r.coordinates.every(Number.isFinite) &&
    r.coordinates[0] >= -67 && r.coordinates[0] <= -59 && r.coordinates[1] >= 43 && r.coordinates[1] <= 48;
}
async function asset(name: string, signal?: AbortSignal): Promise<Index | Shard> {
  signal?.throwIfAborted();
  const cached = cache.get(name);
  if (cached) { cache.delete(name); cache.set(name, cached); return cached; }
  const response = await fetch(`${import.meta.env.BASE_URL}mailing-addresses/${name}.json.gz`, {
    signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(8000)]) : AbortSignal.timeout(8000),
  });
  if (!response.ok) throw new Error("Mailing address source unavailable");
  const bytes = new Uint8Array(await response.arrayBuffer());
  // Some hosts send Content-Encoding: gzip, so fetch has already decoded it.
  const data = JSON.parse(strFromU8(bytes[0] === 0x1f && bytes[1] === 0x8b ? gunzipSync(bytes) : bytes));
  const valid = data?.version === 1 && (name === "index"
    ? Array.isArray(data.streets) && data.streets.every((r: StreetIndex) => typeof r?.key === "string" && Array.isArray(r.cities) && r.cities.every(c => typeof c === "string"))
    : data.streets && !Array.isArray(data.streets) && typeof data.streets === "object" && Object.entries(data.streets).every(([key,rows]) =>
      Array.isArray(rows) && rows.every(row => validRecord(row) && normalizeAddress(row.road) === key && mailingShard(key) === name)));
  if (!valid) throw new Error("Invalid mailing address source");
  signal?.throwIfAborted();
  cache.set(name, data);
  if (cache.size > 9) cache.delete(cache.keys().next().value!);
  return data;
}
async function recordsForRoads(keys: string[], signal?: AbortSignal): Promise<MailingRecord[]> {
  const shards = await Promise.all([...new Set(keys.map(mailingShard))].map(name => asset(name, signal) as Promise<Shard>));
  return keys.flatMap(key => shards.find(s => Object.hasOwn(s.streets, key))?.streets[key] ?? []);
}
export async function enrichCivicAddresses(addresses: CivicAddress[], signal?: AbortSignal): Promise<MailingCivicAddress[]> {
  if (!addresses.length) return [];
  try {
    const records = await recordsForRoads([...new Set(addresses.map(a => normalizeAddress(formatCivicRoadName(a.properties) ?? "")))], signal);
    const enriched = addresses.map(address => ({ ...address, mailing: matchMailingAddress(address, records) }));
    // Do not assign one NAR address to two different civic points.
    const claims = new Map<string, Set<string>>();
    for (const a of enriched) if (a.mailing.status === "matched") {
      const ids = claims.get(a.mailing.record.id) ?? new Set<string>();
      ids.add(a.pntid); claims.set(a.mailing.record.id, ids);
    }
    return enriched.map(a => a.mailing.status === "matched" && claims.get(a.mailing.record.id)!.size > 1
      ? { ...a, mailing: { status: "ambiguous" } } : a);
  } catch {
    signal?.throwIfAborted();
    return addresses.map(address => ({ ...address, mailing: { status: "source-error" } }));
  }
}
async function postalCandidates(query: string, suggest: boolean, signal?: AbortSignal) {
  const index = await asset("index", signal) as Index;
  // Numbers, unit numbers and postal codes are checked against actual rows.
  const roadQuery = postalQuery(query).replace(/^\s*(?:[a-z0-9]+-)?\d+[a-z]?\s+/iu, "").replace(/\b[a-z]\d[a-z]\s?\d[a-z]\d\b/giu, " ").trim();
  if (!roadQuery) return { records: [], truncated: false };
  const roads = index.streets.filter(road => road.cities.some(city => matchesTerms(`${road.key} ${city} NS`, roadQuery, suggest)));
  const records = (await recordsForRoads(roads.slice(0, MAX_SEARCH_ROADS).map(r => r.key), signal))
    .filter(row => matchesMailingQuery(row, query, suggest));
  return { records: records.slice(0, MAX_SEARCH_CANDIDATES), truncated: roads.length > MAX_SEARCH_ROADS || records.length > MAX_SEARCH_CANDIDATES };
}
export async function searchAddressesWithMailing(query: string, signal?: AbortSignal, options: { suggest?: boolean } = {}): Promise<{
  addresses: MailingCivicAddress[]; notice: string | null;
}> {
  const [civic, postal] = await Promise.allSettled([
    searchCivicAddresses(query, signal, ...(options.suggest ? [options] : [])), postalCandidates(query, options.suggest ?? false, signal),
  ]);
  signal?.throwIfAborted();
  // Civic source failures remain failures: a NAR coordinate is never a fallback destination.
  if (civic.status === "rejected") throw civic.reason;
  let notice = postal.status === "rejected" ? "Mailing address lookup is unavailable; civic results are shown." : null;
  const results = new Map<string, MailingCivicAddress>();
  const initial = await enrichCivicAddresses(civic.value, signal);
  for (const row of initial) results.set(row.pntid, row);
  if (initial.some(row => row.mailing?.status === "source-error")) notice = "Mailing address lookup is unavailable; civic results are shown.";
  if (postal.status === "fulfilled") {
    if (postal.value.truncated) notice = [notice, "More mailing matches may exist. Add a street or civic number to narrow the search."].filter(Boolean).join(" ");
    let incomplete = false;
    let unverified = false;
    // Bounded discovery using NAR building coordinates. Only a uniquely matching
    // live provincial point can become a selectable search result.
    const discovered = await Promise.all(postal.value.records.map(async record => {
      if (initial.some(a => a.mailing?.status === "matched" && a.mailing.record.id === record.id)) return [];
      const [lon,lat] = record.coordinates;
      try {
        const nearby = await fetchViewportCivicAddresses({ west:lon-.001, east:lon+.001, south:lat-.0006, north:lat+.0006 }, signal);
        if (nearby.truncated || nearby.unreadableRows) { incomplete = true; return []; }
        const matching = nearby.addresses.filter(a => matchMailingAddress(a, [record]).status === "matched");
        if (matching.length !== 1) { unverified = true; return []; }
        // Check all NAR rows for the civic point, not merely the selected candidate.
        const enriched = await enrichCivicAddresses(matching, signal);
        if (enriched.some(a => a.mailing?.status === "source-error")) incomplete = true;
        else if (enriched.some(a => a.mailing?.status !== "matched")) unverified = true;
        return enriched;
      } catch {
        signal?.throwIfAborted(); incomplete = true; return [];
      }
    }));
    for (const a of discovered.flat()) if (a.mailing?.status === "matched" && matchesMailingQuery(a.mailing.record, query, options.suggest ?? false)) results.set(a.pntid, a);
    if (unverified) notice = [notice, "Some postal records have no unique civic match and are not selectable."].filter(Boolean).join(" ");
    if (incomplete) notice = [notice, "Some mailing matches could not be checked against civic points. Results may be incomplete."].filter(Boolean).join(" ");
  }
  signal?.throwIfAborted();
  return { addresses: [...results.values()].slice(0, 12), notice };
}
