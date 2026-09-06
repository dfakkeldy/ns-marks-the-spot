import { provincialReceipt, provincialReceiptUrl, provincialSourceDates, provincialExportProvenance, PROVINCIAL_ATTRIBUTION, PROVINCIAL_LICENCE_URL } from './provincial';

export type BasemapStyle = 'day' | 'night' | 'fletcher' | 'osm';
export type BasemapPreference = BasemapStyle | 'system';

/** Display names for the Atlas styles; the Fletcher style is modern geography in historical colours. */
export const atlasStyleLabels = { day: 'Day', night: 'Night', fletcher: 'Fletcher' } as const;
export const FLETCHER_STYLE_NOTE = "Fletcher style: modern geography drawn in the colours and lettering of Hugh Fletcher's 1884 Cape Breton sheets; not a historical map.";

export function isBasemapStyle(value: unknown): value is BasemapStyle {
  return value === 'day' || value === 'night' || value === 'fletcher' || value === 'osm';
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
    name: `NS Marks Atlas · ${atlasStyleLabels[style]}`,
    sourceUrl: provincialReceiptUrl(),
    sourceDate: `Provincial snapshot built ${provincialReceipt.generatedAt.slice(0, 10)}. ${provincialSourceDates}. Supplemental OSM context is live.${style === 'fletcher' ? ` ${FLETCHER_STYLE_NOTE}` : ''}`,
    attribution: `NS Marks Atlas · ${PROVINCIAL_ATTRIBUTION} (${PROVINCIAL_LICENCE_URL}) · Supplemental geography: OpenFreeMap · © OpenMapTiles · © OpenStreetMap contributors. ${provincialExportProvenance()}${style === 'fletcher' ? ` ${FLETCHER_STYLE_NOTE}` : ''}`,
    licenceUrl: 'https://www.openstreetmap.org/copyright',
  };
}
