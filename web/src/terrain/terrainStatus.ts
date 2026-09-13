export type TerrainStatus = { kind: 'loading' | 'ready' | 'error'; message: string };

/** Source errors and graphics failures need different explanations and recovery. */
export function terrainFailureMessage(event: { error: unknown; sourceId?: unknown }): string {
  const names: Record<string, string> = {
    'research-elevation': 'Mapzen terrain', province: 'Provincial Atlas',
    crown: 'Crown Land', geography: 'OpenFreeMap', osm: 'OpenStreetMap',
  };
  const name = typeof event.sourceId === 'string' ? names[event.sourceId] : undefined;
  const error = event.error;
  const status = error && typeof error === 'object' && 'status' in error && typeof error.status === 'number'
    ? error.status : undefined;
  return `${name ?? 'A 3D map layer'} failed to load${status ? ` (HTTP ${status})` : ''}. View may be incomplete.`;
}
