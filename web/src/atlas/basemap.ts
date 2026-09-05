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
    sourceUrl: 'https://openfreemap.org/',
    sourceDate: 'Live OSM vector tiles · original NS Marks cartography',
    attribution: 'NS Marks Atlas · OpenFreeMap · © OpenMapTiles · © OpenStreetMap contributors',
    licenceUrl: 'https://www.openstreetmap.org/copyright',
  };
}
