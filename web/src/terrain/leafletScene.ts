import L from 'leaflet';
import type { Feature, Geometry } from 'geojson';
import type { WarpedRasterLayer } from '../userMaps/render/WarpedRasterLayer';
export { installTerrainViewport } from './terrainViewport';

export type Corners = [[number, number], [number, number], [number, number], [number, number]];
export type Drape = { canvas: HTMLCanvasElement; coordinates: Corners; opacity: number; pane: string };
export type RasterEntry = { id: string; layer: L.Layer; order: number; opacity: number } & (
  { kind: 'tiles'; grid: L.GridLayer } |
  { kind: 'image'; url: string; coordinates: Corners } |
  { kind: 'canvas'; drape: Drape }
);
export type Scene = { rasters: RasterEntry[]; paths: Feature<Geometry>[]; markers: L.Marker[]; layers: Map<number, L.Layer> };

export function boundsCorners(bounds: L.LatLngBounds): Corners {
  return [bounds.getNorthWest(), bounds.getNorthEast(), bounds.getSouthEast(), bounds.getSouthWest()].map(p => [p.lng, p.lat]) as Corners;
}

export function layerOrder(map: L.Map, layer: L.Layer, paneName = layer.options.pane): number {
  const pane = paneName ? map.getPane(paneName) : undefined;
  const paneZ = Number(pane?.style.zIndex || (paneName === 'markerPane' ? 600 : paneName === 'overlayPane' ? 400 : 200));
  if (layer instanceof L.GridLayer || layer instanceof L.ImageOverlay) {
    const options = layer.options as L.GridLayerOptions;
    if (!paneName || paneName === 'tilePane') return Number(options.zIndex ?? paneZ);
    // A custom pane is its own stacking context. An inherited image zIndex=1
    // must not promote/demote that pane; explicit indices only order siblings.
    return paneZ + (Object.hasOwn(options, 'zIndex') ? Number(options.zIndex ?? 0) / 1e6 : 0);
  }
  return paneZ;
}

function circlePolygon(circle: L.Circle): Geometry {
  const center = circle.getLatLng();
  const angular = circle.getRadius() / 6371008.8;
  const lat = center.lat * Math.PI / 180, lon = center.lng * Math.PI / 180;
  const ring = Array.from({ length: 65 }, (_, i) => {
    const bearing = i / 64 * Math.PI * 2;
    const phi = Math.asin(Math.sin(lat) * Math.cos(angular) + Math.cos(lat) * Math.sin(angular) * Math.cos(bearing));
    const lambda = lon + Math.atan2(Math.sin(bearing) * Math.sin(angular) * Math.cos(lat), Math.cos(angular) - Math.sin(lat) * Math.sin(phi));
    return [lambda * 180 / Math.PI, phi * 180 / Math.PI];
  });
  return { type: 'Polygon', coordinates: [ring] };
}

/** Read the same mounted layers that own source queries, consent and selection. */
export function collectScene(map: L.Map): Scene {
  const scene: Scene = { rasters: [], paths: [], markers: [], layers: new Map() };
  map.eachLayer(layer => {
    const id = L.stamp(layer);
    scene.layers.set(id, layer);
    if (layer instanceof L.GridLayer) {
      // The GL basemap already draws the selected OSM background.
      if (layer instanceof L.TileLayer && layer.options.attribution?.includes('OpenStreetMap')) return;
      scene.rasters.push({ id: `leaf-${id}`, layer, kind: 'tiles', grid: layer, order: layerOrder(map, layer), opacity: (layer.options as L.GridLayerOptions).opacity ?? 1 });
    } else if (layer instanceof L.ImageOverlay) {
      const url = layer.getElement()?.src;
      if (url) scene.rasters.push({ id: `leaf-${id}`, layer, kind: 'image', url, coordinates: boundsCorners(layer.getBounds()), order: layerOrder(map, layer), opacity: layer.options.opacity ?? 1 });
    } else if ('getTerrainDrape' in layer) {
      const drape = (layer as WarpedRasterLayer).getTerrainDrape();
      if (drape) scene.rasters.push({ id: `leaf-${id}`, layer, kind: 'canvas', drape, order: layerOrder(map, layer, drape.pane), opacity: drape.opacity });
    } else if (layer instanceof L.Marker) {
      scene.markers.push(layer);
    } else if (layer instanceof L.Polyline || layer instanceof L.CircleMarker) {
      const geometry = layer instanceof L.Circle ? circlePolygon(layer) : layer.toGeoJSON().geometry;
      const options = layer.options;
      const dash = (Array.isArray(options.dashArray) ? options.dashArray : String(options.dashArray ?? '').split(/[ ,]+/))
        .map(Number).filter(n => Number.isFinite(n) && n > 0).map(n => n / (options.weight || 3)).join(',');
      scene.paths.push({ type: 'Feature', id, geometry, properties: {
        leafId: id, order: layerOrder(map, layer), color: options.color ?? '#3388ff',
        weight: options.stroke === false ? 0 : options.weight ?? 3,
        opacity: options.stroke === false ? 0 : options.opacity ?? 1,
        fillColor: options.fillColor ?? options.color ?? '#3388ff',
        fillOpacity: options.fill === false ? 0 : options.fillOpacity ?? 0.2,
        radius: layer instanceof L.CircleMarker ? layer.getRadius() : 0,
        interactive: options.interactive !== false, dash,
      } });
    }
  });
  return scene;
}

/** Leaflet 1.9 tile URL helpers read _tileZoom and TMS range from their instance. */
export function urlForTile(layer: L.TileLayer, coordinates: L.Coords): string {
  const requestLayer = Object.create(layer) as L.TileLayer & { _tileZoom: number; _globalTileRange: L.Bounds };
  requestLayer._tileZoom = coordinates.z;
  requestLayer._globalTileRange = L.bounds([0, 0], [2 ** coordinates.z - 1, 2 ** coordinates.z - 1]);
  return requestLayer.getTileUrl(coordinates);
}

export async function readGridTile(layer: L.GridLayer, coords: L.Coords, signal: AbortSignal): Promise<ArrayBuffer> {
  if (layer instanceof L.TileLayer) {
    const response = await fetch(urlForTile(layer, coords), { signal });
    if (!response.ok) throw new Error(`Map tile HTTP ${response.status}`);
    return response.arrayBuffer();
  }
  // Existing local canvas grid layers stay local; no raster bytes are uploaded.
  const tile = await new Promise<HTMLElement>((resolve, reject) => {
    const onAbort = () => reject(new DOMException('Aborted', 'AbortError'));
    const timeout = window.setTimeout(() => finish(new Error('Local tile timed out')), 20000);
    const finish = (error?: Error | null, result?: HTMLElement) => {
      clearTimeout(timeout); signal.removeEventListener('abort', onAbort);
      if (error) reject(error); else resolve(result ?? element);
    };
    signal.addEventListener('abort', onAbort, { once: true });
    if (signal.aborted) { finish(new DOMException('Aborted', 'AbortError')); return; }
    const grid = layer as unknown as { createTile(coords: L.Coords, done: (error?: Error | null, tile?: HTMLElement) => void): HTMLElement };
    const element = grid.createTile(coords, (error, tile) => queueMicrotask(() => finish(error, tile ?? element)));
    if (grid.createTile.length < 2) finish(null, element);
  });
  if (!(tile instanceof HTMLCanvasElement)) throw new Error('Unsupported local tile format');
  const blob = await new Promise<Blob>((resolve, reject) => tile.toBlob(value => value ? resolve(value) : reject(new Error('Local tile could not be read'))));
  return blob.arrayBuffer();
}
