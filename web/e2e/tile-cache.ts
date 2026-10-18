import L from 'leaflet';
import { readGridTile } from '../src/terrain/leafletScene';
const target = new URL(new URLSearchParams(location.search).get('tile')!);
if (target.hostname !== '127.0.0.1' || target.protocol !== 'http:' || target.pathname !== '/tile.png') throw new Error('Loopback fixture only');
const status = document.querySelector('[role="status"]')!;
const cors = new URLSearchParams(location.search).get('cors') === '1';
const image = new Image();
if (cors) image.crossOrigin = 'anonymous';
image.onload = () => { status.textContent = 'Image cached'; };
image.onerror = () => { status.textContent = 'Image failed'; };
image.src = target.href;
document.body.append(image);
document.querySelector('button')!.onclick = async () => {
  try {
    const bytes = await readGridTile(L.tileLayer(target.href, { crossOrigin: cors ? true : false }), Object.assign(L.point(0, 0), { z: 0 }), new AbortController().signal);
    status.textContent = `Terrain bytes loaded: ${bytes.byteLength}`;
  } catch (error) { status.textContent = `Terrain read failed: ${String(error)}`; }
};
