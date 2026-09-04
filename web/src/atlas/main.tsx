import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { setWorkerUrl } from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import 'maplibre-gl/dist/maplibre-gl.css';
import './study.css';
import { AtlasStudy } from './AtlasStudy';

// Bundle the worker and its shared imports for both Vite dev and subpath builds.
setWorkerUrl(workerUrl);

createRoot(document.getElementById('root')!).render(<StrictMode><AtlasStudy /></StrictMode>);
