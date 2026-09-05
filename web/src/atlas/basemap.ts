import { provincialReceipt, provincialReceiptUrl, provincialSourceDates, provincialExportProvenance, PROVINCIAL_ATTRIBUTION, PROVINCIAL_LICENCE_URL } from './provincial';

export type BasemapStyle = 'day' | 'night' | 'osm';
export type BasemapPreference = BasemapStyle | 'system';

export function isBasemapStyle(value: unknown): value is BasemapStyle {
  return value === 'day' || value === 'night' || value === 'osm';
}

export function resolveBasemapStyle(preference: BasemapPreference, systemDark: boolean): BasemapStyle {
  return preference === 'system' ? systemDark ? 'night' : 'day' : preference;
}

export function basemapSource(style: BasemapStyle) {
  return style === 'osm' ? {
    id: 'modern' as const,
    name: 'Modern map',
    sourceUrl: 'https://www.openstreetmap.org/copyright',
    sourceDate: 'Live OpenStreetMap tiles',
    attribution: '© OpenStreetMap contributors',
    licenceUrl: 'https://www.openstreetmap.org/copyright',
  } : {
    id: 'modern' as const,
    name: `NS Marks Atlas · ${style === 'night' ? 'Night' : 'Day'}`,
    sourceUrl: provincialReceiptUrl(),
    sourceDate: `Provincial snapshot built ${provincialReceipt.generatedAt.slice(0, 10)}. ${provincialSourceDates}. Supplemental OSM context is live.`,
    attribution: `NS Marks Atlas · ${PROVINCIAL_ATTRIBUTION} (${PROVINCIAL_LICENCE_URL}) · Supplemental geography: OpenFreeMap · © OpenMapTiles · © OpenStreetMap contributors. ${provincialExportProvenance()}`,
    licenceUrl: 'https://www.openstreetmap.org/copyright',
  };
}
