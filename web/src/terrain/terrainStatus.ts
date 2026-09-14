export type TerrainStatus = { kind: 'loading' | 'ready' | 'error'; message: string };

/** Source errors and graphics failures need different explanations and recovery. */
export function terrainFailureMessage(event: { error: unknown; sourceId?: unknown }, layerName?: string): string {
  const names: Record<string, string> = {
    'research-elevation': 'Mapzen terrain', province: 'Provincial Atlas',
    crown: 'Crown Land', geography: 'OpenFreeMap', osm: 'OpenStreetMap',
  };
  const error = event.error;
  const message = error instanceof Error ? error.message : '';
  const url = error && typeof error === 'object' && 'url' in error ? String(error.url) : message;
  const inferred = /elevation-tiles-prod|terrainrelief/.test(url) ? 'Mapzen terrain'
    : /\/atlas\/provincial\//.test(url) ? 'Provincial Atlas'
    : /\/atlas\/crown\//.test(url) ? 'Crown Land'
    : /openfreemap/.test(url) ? 'OpenFreeMap'
    : /tile\.openstreetmap/.test(url) ? 'OpenStreetMap' : undefined;
  const sourceId = typeof event.sourceId === 'string' ? event.sourceId : undefined;
  const name = layerName ?? (sourceId ? names[sourceId] : undefined) ?? inferred ?? (sourceId ? `Map source ${sourceId}` : 'A map source');
  const status = error && typeof error === 'object' && 'status' in error && typeof error.status === 'number'
    ? error.status : message.match(/HTTP\s+(\d{3})/i)?.[1];
  return `${name} failed to load${status ? ` (HTTP ${status})` : ''}. View may be incomplete.`;
}
