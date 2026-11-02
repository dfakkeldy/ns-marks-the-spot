import { provincialReceipt, provincialReceiptUrl, provincialSourceDates, provincialExportProvenance, PROVINCIAL_ATTRIBUTION, PROVINCIAL_LICENCE_URL } from './provincial';
import { crownProvenance, crownReceipt } from './crown';

export type BasemapStyle = 'day' | 'night' | 'fletcher' | 'handdrawn' | 'osm';
export type BasemapPreference = BasemapStyle | 'system';

/** Display names for the Atlas styles; the Fletcher style is modern geography in historical colours. */
export const atlasStyleLabels = { day: 'Day', night: 'Night', fletcher: 'Fletcher', handdrawn: 'Hand-drawn' } as const;
export const FLETCHER_STYLE_NOTE = "Fletcher style: modern geography drawn in the colours and lettering of Hugh Fletcher's 1884 Cape Breton sheets; not a historical map.";
export const HAND_DRAWN_STYLE_NOTE = 'Hand-drawn style: modern geography sketched in sepia ink for fun; doodled trees and cottages are decoration, not mapped features. Mountain marks follow uplands in NRCan MRDEM elevation (contains information licensed under the Open Government Licence – Canada) but are decorative, not survey data.';
const styleNote = (style: BasemapStyle) => style === 'fletcher' ? ` ${FLETCHER_STYLE_NOTE}` : style === 'handdrawn' ? ` ${HAND_DRAWN_STYLE_NOTE}` : '';

export function isBasemapStyle(value: unknown): value is BasemapStyle {
  return value === 'day' || value === 'night' || value === 'fletcher' || value === 'handdrawn' || value === 'osm';
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
    sourceDate: `Provincial snapshot built ${provincialReceipt.generatedAt.slice(0, 10)}. ${provincialSourceDates}. Crown Land: ${crownReceipt.source.released.slice(0, 10)}. Supplemental OSM context is live.${styleNote(style)}`,
    attribution: `NS Marks Atlas · ${PROVINCIAL_ATTRIBUTION} (${PROVINCIAL_LICENCE_URL}) · Supplemental geography: OpenFreeMap · © OpenMapTiles · © OpenStreetMap contributors. ${provincialExportProvenance()} ${crownProvenance()}${styleNote(style)}`,
    licenceUrl: 'https://www.openstreetmap.org/copyright',
  };
}
