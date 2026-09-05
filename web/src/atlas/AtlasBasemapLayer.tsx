import { useEffect, useRef } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import { Map as AtlasMap } from './mapLibreRuntime';
import { buildAtlasStyle } from './style';
import type { AtlasMode } from './palette';
import type { MapLayerStatus } from '../components/MapCanvas';

/** Leaflet owns navigation and every overlay. Only the basemap is drawn by GL. */
export default function AtlasBasemapLayer({ mode, print = false, onStatus }: {
  mode: AtlasMode;
  print?: boolean;
  onStatus: (status: MapLayerStatus) => void;
}) {
  const leaflet = useMap();
  const status = useRef(onStatus);
  useEffect(() => { status.current = onStatus; }, [onStatus]);

  useEffect(() => {
    let disposed = false;
    let failed = false;
    let zooming = false;
    let frame = 0;
    let watchdog = 0;
    const node = document.createElement('div');
    node.className = `atlas-basemap leaflet-zoom-animated${print ? ' print-layer-modern' : ''}`;
    node.setAttribute('aria-hidden', 'true');
    leaflet.getContainer().prepend(node);
    const report = (next: MapLayerStatus) => { if (!disposed) status.current(next); };
    const fail = () => { failed = true; report({ status: 'error' }); };
    const loading = () => {
      if (failed) return;
      report({ status: 'loading' });
      window.clearTimeout(watchdog);
      watchdog = window.setTimeout(fail, 25_000);
    };
    const sizeNode = () => {
      const size = leaflet.getSize();
      node.style.width = `${size.x}px`;
      node.style.height = `${size.y}px`;
    };
    sizeNode();
    let atlas: AtlasMap;
    try {
      const center = leaflet.getCenter();
      atlas = new AtlasMap({
        container: node, style: buildAtlasStyle(mode),
        center: [center.lng, center.lat], zoom: leaflet.getZoom() - 1,
        minZoom: 0, maxZoom: 24, interactive: false, attributionControl: false,
        canvasContextAttributes: { preserveDrawingBuffer: print },
      });
    } catch {
      fail();
      node.remove();
      return;
    }
    loading();
    atlas.on('error', fail);
    atlas.on('webglcontextlost', fail);
    atlas.on('dataloading', () => { if (!watchdog) loading(); });
    atlas.on('idle', () => {
      window.clearTimeout(watchdog);
      watchdog = 0;
      if (!zooming) L.DomUtil.setTransform(node, L.point(0, 0), 1);
      if (!failed) report({ status: 'ready' });
    });

    const synchronize = () => {
      frame = 0;
      if (disposed || zooming) return;
      sizeNode();
      const center = leaflet.getCenter();
      // Subscribe before changing the view, including a cached or unchanged camera.
      atlas.once('render', () => { if (!disposed && !zooming) L.DomUtil.setTransform(node, L.point(0, 0), 1); });
      atlas.resize();
      atlas.jumpTo({ center: [center.lng, center.lat], zoom: leaflet.getZoom() - 1 });
      atlas.triggerRepaint();
    };
    const schedule = () => { if (!frame) frame = window.requestAnimationFrame(synchronize); };
    const animateZoom = (event: L.ZoomAnimEvent) => {
      zooming = true;
      const scale = leaflet.getZoomScale(event.zoom);
      const half = leaflet.getSize().divideBy(2);
      const oldOrigin = leaflet.project(leaflet.getCenter(), leaflet.getZoom()).subtract(half);
      const newOrigin = leaflet.project(event.center, event.zoom).subtract(half);
      L.DomUtil.setTransform(node, oldOrigin.multiplyBy(scale).subtract(newOrigin), scale);
    };
    const finishZoom = () => { zooming = false; schedule(); };
    leaflet.on('move resize viewreset', schedule);
    leaflet.on('zoomanim', animateZoom);
    leaflet.on('zoomend', finishZoom);
    // fitBounds can settle between the parent render and this lazy mount.
    schedule();
    return () => {
      disposed = true;
      window.clearTimeout(watchdog);
      window.cancelAnimationFrame(frame);
      leaflet.off('move resize viewreset', schedule);
      leaflet.off('zoomanim', animateZoom);
      leaflet.off('zoomend', finishZoom);
      atlas.remove();
      node.remove();
    };
  }, [leaflet, mode, print]);
  return null;
}
