import 'maplibre-gl/dist/maplibre-gl.css';
import { Map, setWorkerUrl, addProtocol } from 'maplibre-gl';
import { PMTiles, Protocol } from 'pmtiles';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';

// MapLibre 6 needs a bundled worker URL, including its shared imports.
setWorkerUrl(workerUrl);
const protocol = new Protocol({ errorOnMissingTile: false });
addProtocol('pmtiles', async (params, controller) => {
  const url = params.type === 'json'
    ? params.url.slice('pmtiles://'.length)
    : params.url.slice('pmtiles://'.length).replace(/\/\d+\/\d+\/\d+$/, '');
  const request = protocol.tilev4(params, controller);
  const instance = protocol.get(url);
  try {
    return await request;
  } catch (error) {
    // PMTiles caches rejected header/directory promises. Keep the failure visible,
    // but give a subsequent Retry or PDF export a fresh cache for this archive.
    // An older concurrent failure must not replace a newer instance.
    if (!controller.signal.aborted && protocol.get(url) === instance) {
      protocol.add(new PMTiles(url));
    }
    throw error;
  }
});
export { Map };
