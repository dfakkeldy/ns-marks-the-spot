import { addProtocol, type Map, type RasterDEMTileSource } from 'maplibre-gl';
import { reliefTileUrl, transformDemRgba, validateReliefSettings, type DemEncoding, type ReliefSettings } from './reliefMath';

let registered = false;

/** Decode and rewrite a temporary tile; original sources are never modified. */
export function registerTerrainReliefProtocol(): void {
  if (registered) return;
  addProtocol('nsmts-relief', async (request, controller) => {
    const { signal } = controller;
    signal.throwIfAborted();
    const url = new URL(request.url);
    const coordinates = /^\/(\d+)\/(\d+)\/(\d+)$/.exec(url.pathname);
    const template = url.searchParams.get('template');
    const encoding = url.searchParams.get('encoding');
    if (!coordinates || !template || (encoding !== 'mapbox' && encoding !== 'terrarium')) throw new Error('Invalid relief tile request.');
    const settings: ReliefSettings = JSON.parse(url.searchParams.get('settings') ?? 'null');
    if (!settings) throw new Error('Missing relief controls.');
    validateReliefSettings(settings);
    const source = new URL(template.replaceAll('{z}', coordinates[1]).replaceAll('{x}', coordinates[2]).replaceAll('{y}', coordinates[3]), document.baseURI);
    if (!['http:', 'https:'].includes(source.protocol)) throw new Error('Relief tiles require an HTTP(S) source.');
    // Standard fetch preserves the browser's existing CORS boundary.
    const response = await fetch(source, { signal });
    if (!response.ok) throw new Error(`Terrain tile HTTP ${response.status}`);
    const blob = await response.blob();
    signal.throwIfAborted();
    let bitmap: ImageBitmap | undefined;
    let canvas: OffscreenCanvas | HTMLCanvasElement | undefined;
    const release = () => {
      bitmap?.close(); bitmap = undefined;
      if (canvas) { canvas.width = 0; canvas.height = 0; }
    };
    signal.addEventListener('abort', release, { once: true });
    try {
      bitmap = await createImageBitmap(blob, { premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
      signal.throwIfAborted();
      canvas = typeof OffscreenCanvas === 'undefined' ? document.createElement('canvas') : new OffscreenCanvas(bitmap.width, bitmap.height);
      canvas.width = bitmap.width; canvas.height = bitmap.height;
      let context = canvas.getContext('2d', { willReadFrequently: true }) as OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D | null;
      if (!context && 'convertToBlob' in canvas) {
        canvas.width = 0; canvas.height = 0;
        canvas = document.createElement('canvas');
        canvas.width = bitmap.width; canvas.height = bitmap.height;
        context = canvas.getContext('2d', { willReadFrequently: true });
      }
      if (!context) throw new Error('Terrain tile image processing is unavailable.');
      context.drawImage(bitmap, 0, 0);
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
      pixels.data.set(transformDemRgba(pixels.data, settings, encoding));
      context.putImageData(pixels, 0, 0);
      signal.throwIfAborted();
      const result = 'convertToBlob' in canvas
        ? await canvas.convertToBlob({ type: 'image/png' })
        : await new Promise<Blob>((resolve, reject) => (canvas as HTMLCanvasElement).toBlob(value => value ? resolve(value) : reject(new Error('Terrain tile encoding failed.')), 'image/png'));
      signal.throwIfAborted();
      const data = await result.arrayBuffer();
      signal.throwIfAborted();
      return { data };
    } catch (error) {
      // A setting change can cancel while canvas encoding is in progress.
      // Report cancellation rather than a spurious decoder/source failure.
      signal.throwIfAborted();
      throw error;
    } finally {
      signal.removeEventListener('abort', release);
      release();
    }
  });
  registered = true;
}

/** Public source updates invalidate tiles only when their display transform changes. */
export function configureTerrainRelief(map: Map, sourceId: string, template: string, encoding: DemEncoding, settings: ReliefSettings): void {
  registerTerrainReliefProtocol();
  const source = map.getSource<RasterDEMTileSource>(sourceId);
  if (!source || source.type !== 'raster-dem') return;
  const url = reliefTileUrl(template, settings, encoding);
  const previous = source.serialize().tiles;
  if (previous?.length !== 1 || previous[0] !== url) source.setTiles([url]);
  if (map.getTerrain()?.exaggeration !== settings.exaggeration) {
    map.setTerrain({ source: sourceId, exaggeration: settings.exaggeration });
  }
}
