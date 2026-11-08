export type TerrainStatus = { kind: 'loading' | 'ready' | 'error'; message: string };

type MapSourceFailure = { name: string; reason: string };

/** Source errors and graphics failures need different explanations and recovery. */
export function terrainFailureMessage(event: { error: unknown; sourceId?: unknown }, layerName?: string): string {
  return mapFailureMessage([mapSourceFailure(event, layerName)]);
}

/**
 * The whole of what failed, not the last source to report. A base map that
 * loses every source otherwise names only whichever error arrived last. It
 * names sources it has an id for and says nothing about ones it does not; the
 * Provincial Atlas line is what the Atlas draws from that source.
 */
export function mapFailureMessage(failures: readonly MapSourceFailure[]): string {
  const names = Array.from(new Set(failures.map(({ name }) => name)));
  if (names.length === 1) return `${names[0]} failed to load${failures[failures.length - 1].reason}. View may be incomplete.`;
  const missing = names.includes('Provincial Atlas') ? ' Roads, water, woodland and place names may be missing.' : '';
  return `${names.length} map sources failed to load: ${names.join(', ')}.${missing} View may be incomplete.`;
}

export function mapSourceFailure(event: { error: unknown; sourceId?: unknown }, layerName?: string): MapSourceFailure {
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
  // A fetch that never got a response is a dropped connection, not a bad source.
  const reason = status ? ` (HTTP ${status})` : error instanceof TypeError ? ' (connection interrupted)' : '';
  return { name, reason };
}
