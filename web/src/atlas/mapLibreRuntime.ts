import 'maplibre-gl/dist/maplibre-gl.css';
import { Map, setWorkerUrl } from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';

// MapLibre 6 needs a bundled worker URL, including its shared imports.
setWorkerUrl(workerUrl);
export { Map };
