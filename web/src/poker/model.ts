import type { CivicAddress } from '../services/civicAddresses';
import { matchesMailingQuery, type MailingRecord } from '../services/mailingAddresses';
import type { GeoPoint } from '../services/geodesy';
export const SESSION_KEY = 'ns-marks:poker:v1';
export type PokerAddress = { mailing: MailingRecord; civic: CivicAddress | null };
export type PokerData = { version: 1; bounds: [number, number, number, number]; addresses: PokerAddress[]; civic: CivicAddress[];
  roads: GeoJSON.FeatureCollection; buildings: GeoJSON.FeatureCollection; footprints: GeoJSON.FeatureCollection; water: GeoJSON.FeatureCollection };
export type PokerState = { version: 1; query: string; postalCode: string; selectedId: string | null;
  center: [number, number]; zoom: number; points: GeoPoint[]; finished: boolean };
export const DEFAULT_STATE: PokerState = { version: 1, query: '', postalCode: '', selectedId: null, center: [45.98, -61.43], zoom: 11, points: [], finished: false };
export function readSession(): PokerState {
  try {
    const value = JSON.parse(localStorage.getItem(SESSION_KEY) ?? 'null');
    if (value?.version !== 1 || typeof value.query !== 'string' || value.query.length > 500 ||
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
export function searchAddresses(addresses: PokerAddress[], query: string, postalCode: string) {
  const normalized = query.replace(/\b([a-z]\d[a-z])\s?(\d[a-z]\d)\b/giu, '$1 $2');
  return addresses.filter(a => (!postalCode || a.mailing.postalCode === postalCode) &&
    (!normalized.trim() || matchesMailingQuery(a.mailing, normalized, true)));
}
export function deliveryStatus(metres: number, finished: boolean, pointCount: number): string {
  if (pointCount < 2) return 'Trace the driveway from the house to your route.';
  if (!finished) return 'Tracing — tap Finish to check 500 m.';
  return metres > 500 ? 'Over 500 m — card the parcel' : '500 m or less';
}
