import type L from 'leaflet';

const cameraUpdates = new WeakSet<L.Map>();
const terrainViewports = new WeakSet<L.Map>();
export function isTerrainViewportInstalled(map: L.Map): boolean { return terrainViewports.has(map); }
export function isTerrainCameraUpdate(map: L.Map): boolean { return cameraUpdates.has(map); }
export function withTerrainCameraUpdate(map: L.Map, update: () => void): void {
  cameraUpdates.add(map);
  try { update(); } finally { cameraUpdates.delete(map); }
}

/** Scope the imperative viewport adapter to the lifetime of the 3D view. */
export function installTerrainViewport(map: L.Map, getBounds: () => L.LatLngBounds): () => void {
  const originalBounds = map.getBounds, zoomSnap = map.options.zoomSnap;
  map.getBounds = getBounds;
  map.options.zoomSnap = 0;
  terrainViewports.add(map);
  return () => { map.getBounds = originalBounds; map.options.zoomSnap = zoomSnap; terrainViewports.delete(map); };
}
