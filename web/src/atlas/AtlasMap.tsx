import { useEffect, useRef } from 'react';
import { NavigationControl, ScaleControl, AttributionControl, type StyleSpecification } from 'maplibre-gl';
import { Map } from './mapLibreRuntime';
import { NOVA_SCOTIA_BOUNDS } from '../services/mapShareState';

export type Camera = { longitude: number; latitude: number; zoom: number };
export type View = Camera & { west: number; south: number; east: number; north: number };

type Props = {
  style: StyleSpecification;
  camera: Camera;
  onView: (view: View) => void;
  onStatus: (status: string) => void;
  historicalOpacity: number;
};

function applyHistoricalOpacity(map: Map, opacity: number) {
  for (const layer of map.getStyle()?.layers ?? []) {
    if (layer.id.startsWith('fletcher-')) map.setPaintProperty(layer.id, 'raster-opacity', opacity);
  }
}

export function AtlasMap({ style, camera, onView, onStatus, historicalOpacity }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<Map | null>(null);
  const initial = useRef({ style, camera, onView, onStatus });
  const previousStyle = useRef(style);
  const failed = useRef(false);
  const opacity = useRef(historicalOpacity);

  useEffect(() => {
    const { style, camera, onView, onStatus } = initial.current;
    let map: Map;
    failed.current = false;
    try {
      map = new Map({ container: container.current!, style,
        center: [camera.longitude, camera.latitude], zoom: camera.zoom,
        minZoom: 6, maxZoom: 18, attributionControl: false,
        dragRotate: false, pitchWithRotate: false, touchPitch: false,
        maxBounds: [[NOVA_SCOTIA_BOUNDS.west, NOVA_SCOTIA_BOUNDS.south], [NOVA_SCOTIA_BOUNDS.east, NOVA_SCOTIA_BOUNDS.north]],
      });
    } catch {
      onStatus('Map unavailable. This preview requires WebGL; try another browser.');
      return;
    }
    mapRef.current = map;
    map.touchZoomRotate.disableRotation();
    map.addControl(new NavigationControl({ showCompass: false }), 'top-right');
    map.addControl(new ScaleControl({ unit: 'metric' }), 'bottom-left');
    map.addControl(new AttributionControl({ compact: true }), 'bottom-right');
    const reportView = () => {
      const center = map.getCenter();
      const bounds = map.getBounds();
      onView({ longitude: center.lng, latitude: center.lat, zoom: map.getZoom(), west: bounds.getWest(), east: bounds.getEast(), south: bounds.getSouth(), north: bounds.getNorth() });
    };
    map.on('moveend', reportView);
    map.on('load', reportView);
    map.on('style.load', () => applyHistoricalOpacity(map, opacity.current));
    map.on('styledataloading', () => { onStatus('Loading map…'); });
    map.on('error', (event) => {
      failed.current = true;
      const id = 'sourceId' in event ? String(event.sourceId) : '';
      const source = id === 'parcels' ? 'Parcel source' : id.startsWith('fletcher-') ? 'Historical source' : 'Map source';
      onStatus(`${source} failed to load. The view may be incomplete. Retry to check again.`);
    });
    map.on('idle', () => { if (!failed.current) onStatus('Ready'); });
    map.on('webglcontextlost', () => { failed.current = true; onStatus('Graphics connection lost. Retry to restore the map.'); });
    const timeout = window.setTimeout(() => {
      if (!failed.current && !map.areTilesLoaded()) onStatus('Map is still loading. Check your connection or retry.');
    }, 20_000);
    const resize = new ResizeObserver(() => map.resize());
    resize.observe(container.current!);
    return () => { window.clearTimeout(timeout); resize.disconnect(); map.remove(); mapRef.current = null; };
  }, []);

  useEffect(() => {
    if (previousStyle.current === style) return;
    if (!mapRef.current) return; // Preserve the startup error and Retry control.
    previousStyle.current = style;
    failed.current = false;
    initial.current.onStatus('Loading map…');
    // Reload requested sources too: a paint-only diff can otherwise reuse a
    // failed raster source and emit idle without another source-error event.
    mapRef.current?.setStyle(style, { diff: false });
  }, [style]);

  useEffect(() => {
    opacity.current = historicalOpacity;
    const map = mapRef.current;
    // getStyle() becomes available when the style graph is ready, even while
    // tiles are loading. Waiting for isStyleLoaded() can lose slider updates.
    if (map) applyHistoricalOpacity(map, historicalOpacity);
  }, [historicalOpacity]);

  useEffect(() => {
    mapRef.current?.jumpTo({ center: [camera.longitude, camera.latitude], zoom: camera.zoom });
  }, [camera]);

  return <div ref={container} className="atlas-map" aria-label="Interactive Nova Scotia basemap comparison" />;
}
