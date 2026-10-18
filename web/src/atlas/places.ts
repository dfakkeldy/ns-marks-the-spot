/** View bookmarks, not property matches or navigation destinations. */
export const atlasPlaces = [
  { id: 'baddeck', name: 'Baddeck', setting: 'Coast & village', longitude: -60.749, latitude: 46.097, zoom: 12 },
  { id: 'mabou', name: 'Mabou', setting: 'Fields & back roads', longitude: -61.393, latitude: 46.071, zoom: 11.5 },
  { id: 'halifax', name: 'Halifax', setting: 'Town & harbour', longitude: -63.584, latitude: 44.651, zoom: 12.5 },
  // GeoNAMES places on Fletcher sheets 19 and 22, for review against the historical scans.
  { id: 'judique', name: 'Judique', setting: 'Fletcher sheet 19', longitude: -61.491, latitude: 45.876, zoom: 12.5 },
  { id: 'port-hawkesbury', name: 'Port Hawkesbury', setting: 'Strait · sheet 22', longitude: -61.356, latitude: 45.616, zoom: 12.5 },
] as const;
