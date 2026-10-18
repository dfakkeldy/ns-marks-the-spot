import { formatCivicRoadName, type CivicAddress } from '../services/civicAddresses';
import { mailingLabel, matchesMailingQuery, normalizeAddress, roadMatchKey, type MailingRecord } from '../services/mailingAddresses';
import type { GeoPoint } from '../services/geodesy';
export const SESSION_KEY = 'ns-marks:poker:v1';
export type PokerAddress = { mailing: MailingRecord; civic: CivicAddress | null };
export type SearchAddress = PokerAddress | { mailing: null; civic: CivicAddress };
export type PokerData = { version: 1; bounds: [number, number, number, number]; addresses: PokerAddress[]; civic: CivicAddress[];
  roads: GeoJSON.FeatureCollection; buildings: GeoJSON.FeatureCollection; footprints: GeoJSON.FeatureCollection; water: GeoJSON.FeatureCollection };
export type PokerState = { version: 1; basemap: 'atlas' | 'aerial'; query: string; postalCode: string; selectedId: string | null;
  center: [number, number]; zoom: number; points: GeoPoint[]; finished: boolean };
export const DEFAULT_STATE: PokerState = { version: 1, basemap: 'atlas', query: '', postalCode: '', selectedId: null, center: [45.98, -61.43], zoom: 11, points: [], finished: false };
export function readSession(): PokerState {
  try {
    const value = JSON.parse(localStorage.getItem(SESSION_KEY) ?? 'null');
    if (value?.version !== 1 || !['atlas','aerial'].includes(value.basemap) || typeof value.query !== 'string' || value.query.length > 500 ||
      !['','B0E1P0','B0E2W0','B0E1X0'].includes(value.postalCode) ||
      !(value.selectedId === null || typeof value.selectedId === 'string') ||
      !Array.isArray(value.center) || value.center.length !== 2 || !validPoint({ lat: value.center[0], lng: value.center[1] }) ||
      !Number.isFinite(value.zoom) || value.zoom < 9 || value.zoom > 21 ||
      !Array.isArray(value.points) || value.points.length > 5000 || !value.points.every(validPoint) ||
      typeof value.finished !== 'boolean' || (value.finished && value.points.length < 2)) return DEFAULT_STATE;
    return value;
  } catch { return DEFAULT_STATE; }
}
function validPoint(value: GeoPoint): boolean {
  return value != null && Number.isFinite(value.lat) && Number.isFinite(value.lng) &&
    value.lat >= 43 && value.lat <= 48 && value.lng >= -67 && value.lng <= -59;
}
export function writeSession(value: PokerState): boolean {
  try { localStorage.setItem(SESSION_KEY, JSON.stringify(value)); return true; } catch { return false; }
}
// One provincial point may contain multiple units; preserve each address.
function civicKey(civic: CivicAddress): string { return `${civic.pntid}:${civic.label}`; }
/** Keep civic-only evidence separate: a provincial point does not establish a postal code. */
export function searchableAddresses(data: PokerData): SearchAddress[] {
  const represented = new Set(data.addresses.flatMap(a => a.civic ? [civicKey(a.civic)] : []));
  return [...data.addresses, ...data.civic.filter(a => {
    const key = civicKey(a);
    if (represented.has(key)) return false;
    represented.add(key);
    return true;
  }).map(civic => ({ mailing: null, civic }))];
}
/** A postal record without a unique civic match is shown only at its own NAR building coordinate, never at a civic point. */
export function placement(address: SearchAddress): { coordinates: [number, number]; source: 'civic' | 'postal' } {
  if (!address.mailing) return { coordinates: address.civic.coordinates, source: 'civic' };
  return address.civic ? { coordinates: address.civic.coordinates, source: 'civic' } : { coordinates: address.mailing.coordinates, source: 'postal' };
}
function numberKey(number: unknown, suffix: unknown, road: string): string {
  return `${String(number ?? '').trim()}${String(suffix ?? '').trim()}`.toUpperCase() + '|' + roadMatchKey(road);
}
/** Postal records whose civic number has no provincial civic point on that road, so the map can only label the NAR building coordinate. */
export function postalOnlyAddresses(data: PokerData): PokerAddress[] {
  const civic = new Set(data.civic.map(a => numberKey(a.properties.civicnum, a.properties.civsuffix, formatCivicRoadName(a.properties) ?? '')));
  return data.addresses.filter(a => !a.civic && !civic.has(numberKey(a.mailing.number, a.mailing.suffix, a.mailing.road)));
}
/** One map label per civic number and point: apartment units share a provincial point and would otherwise stack identical labels. */
export function civicLabelPoints(civic: CivicAddress[]): CivicAddress[] {
  const seen = new Set<string>();
  return civic.filter(a => {
    const key = `${String(a.properties.civicnum ?? '')}${String(a.properties.civsuffix ?? '')}@${a.coordinates[0]},${a.coordinates[1]}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
export function addressId(address: SearchAddress): string {
  return address.mailing ? address.mailing.id : `civic:${civicKey(address.civic)}`;
}
export function addressLabel(address: SearchAddress): string {
  return address.mailing ? mailingLabel(address.mailing) : address.civic.label;
}
export function searchAddresses(addresses: SearchAddress[], query: string, postalCode: string) {
  const normalized = query.trim().replace(/\b([a-z]\d[a-z])\s?(\d[a-z]\d)\b/giu, '$1 $2');
  const numberPrefix = /^(\d+)(?=\s|$)/u.exec(normalized)?.[1];
  return addresses.filter(a => {
    // Expand only a leading civic-number prefix using this record's own number.
    // Highway numbers, postal codes and unit-number syntax keep their existing rules.
    const number = a.mailing ? `${a.mailing.number}${a.mailing.suffix}` :
      `${a.civic.properties.civicnum ?? ''}${a.civic.properties.civsuffix ?? ''}`;
    const candidate = numberPrefix && number.startsWith(numberPrefix) ? number + normalized.slice(numberPrefix.length) : normalized;
    if (a.mailing) return (!postalCode || a.mailing.postalCode === postalCode) &&
      (!candidate || matchesMailingQuery(a.mailing, candidate, true));
    // Unknown postal codes stay discoverable, explicitly labelled in the UI.
    const terms = normalizeAddress(candidate).split(' ').filter(Boolean);
    const words = normalizeAddress(a.civic.label).split(' ');
    return !candidate || (terms.length > 0 && terms.every((term, index) => words.includes(term) ||
      (index === terms.length - 1 && /^[a-z]+$/u.test(term) && words.some(word => word.startsWith(term)))));
  });
}
export function deliveryStatus(metres: number, finished: boolean, pointCount: number): string {
  if (pointCount < 2) return 'Trace the driveway from the house to your route.';
  if (!finished) return 'Tracing — tap Finish to check 500 m.';
  return metres > 500 ? 'Over 500 m — card the parcel' : '500 m or less';
}
