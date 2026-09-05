import { Map } from './mapLibreRuntime';
import type { PrintMapBounds } from '../services/printSnapshot';
import type { AtlasMode } from './palette';
import { buildAtlasStyle } from './style';

/** Bound GPU allocation regardless of selected PDF DPI or device pixel ratio. */
export const MAX_ATLAS_RENDER_EDGE = 2048;
export function atlasRenderSize(size: { widthPx: number; heightPx: number }) {
  if (!Number.isFinite(size.widthPx) || !Number.isFinite(size.heightPx) || size.widthPx <= 0 || size.heightPx <= 0) {
    throw new Error('Invalid atlas export size.');
  }
  const scale = Math.min(1, MAX_ATLAS_RENDER_EDGE / Math.max(size.widthPx, size.heightPx));
  return { width: Math.max(1, Math.round(size.widthPx * scale)), height: Math.max(1, Math.round(size.heightPx * scale)) };
}

/** fitBounds letterboxes; crop the actual projected bounds, never stretch its padded viewport. */
export function atlasCropRect(
  bounds: PrintMapBounds,
  project: (coordinate: [number, number]) => { x: number; y: number },
  viewport: { width: number; height: number },
  canvas: { width: number; height: number },
) {
  const nw = project([bounds.west, bounds.north]);
  const se = project([bounds.east, bounds.south]);
  const x = nw.x * canvas.width / viewport.width;
  const y = nw.y * canvas.height / viewport.height;
  const width = (se.x - nw.x) * canvas.width / viewport.width;
  const height = (se.y - nw.y) * canvas.height / viewport.height;
  if (![x, y, width, height].every(Number.isFinite) || width <= 0 || height <= 0 ||
      x < -0.01 || y < -0.01 || x + width > canvas.width + 0.01 || y + height > canvas.height + 0.01) {
    throw new Error('Atlas export bounds could not be aligned.');
  }
  return { x, y, width, height };
}

export async function renderAtlasImage(
  bounds: PrintMapBounds,
  size: { widthPx: number; heightPx: number },
  mode: AtlasMode,
  signal?: AbortSignal,
): Promise<{ canvas: HTMLCanvasElement; detail: string }> {
  signal?.throwIfAborted();
  const viewport = atlasRenderSize(size);
  const container = document.createElement('div');
  Object.assign(container.style, { position: 'fixed', left: '-10000px', top: '0', width: `${viewport.width}px`, height: `${viewport.height}px` });
  document.body.append(container);
  let map: Map | undefined;
  let cleanup = () => {};
  try {
    map = new Map({ container, style: buildAtlasStyle(mode), interactive: false,
      attributionControl: false, pixelRatio: 1, canvasContextAttributes: { preserveDrawingBuffer: true },
      fadeDuration: 0, renderWorldCopies: false });
    const renderer = map;
    await new Promise<void>((resolve, reject) => {
      const failed = (event: { error?: { message: string } }) => reject(event.error ?? new Error('Atlas export source failed.'));
      const aborted = () => reject(new DOMException('Export cancelled.', 'AbortError'));
      const lost = () => reject(new Error('Atlas export WebGL context was lost.'));
      const ready = () => resolve();
      const timer = window.setTimeout(() => reject(new Error('Atlas export timed out.')), 30000);
      cleanup = () => {
        window.clearTimeout(timer);
        renderer.off('error', failed);
        renderer.off('idle', ready);
        renderer.getCanvas().removeEventListener('webglcontextlost', lost);
        signal?.removeEventListener('abort', aborted);
      };
      renderer.on('error', failed);
      renderer.on('idle', ready);
      renderer.getCanvas().addEventListener('webglcontextlost', lost);
      signal?.addEventListener('abort', aborted, { once: true });
      renderer.fitBounds([[bounds.west, bounds.south], [bounds.east, bounds.north]], { padding: 0, duration: 0 });
      if (signal?.aborted) aborted();
    });
    signal?.throwIfAborted();
    const source = renderer.getCanvas();
    const crop = atlasCropRect(bounds, (coordinate) => renderer.project(coordinate), viewport, source);
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Atlas export canvas is unavailable.');
    context.drawImage(source, crop.x, crop.y, crop.width, crop.height, 0, 0, canvas.width, canvas.height);
    return { canvas, detail: `Atlas ${mode}; browser-rendered at ${canvas.width} × ${canvas.height} pixels, cropped to the requested bounds and resampled to the PDF frame.` };
  } finally {
    cleanup();
    map?.remove();
    container.remove();
  }
}
