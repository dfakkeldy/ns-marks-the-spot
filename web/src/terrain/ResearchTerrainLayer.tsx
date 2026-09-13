import { useEffect, useRef } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import { addProtocol, removeProtocol, AttributionControl, NavigationControl, Marker, Popup, type GeoJSONSource, type ImageSource, type LayerSpecification } from 'maplibre-gl';
import { Map as GLMap } from '../atlas/mapLibreRuntime';
import type { BasemapStyle } from '../atlas/basemap';
import { basemapLayerOrder, researchTerrainStyle, RESEARCH_TERRAIN_TILES } from './researchStyle';
import { collectScene, installTerrainViewport, layerOrder, readGridTile, type Scene, type RasterEntry } from './leafletScene';
import './researchTerrain.css';
import { withTerrainCameraUpdate } from './terrainViewport';
import type { ReliefSettings } from './reliefMath';
import { configureTerrainRelief, registerTerrainReliefProtocol } from './terrainRelief';

type Props = { basemap: BasemapStyle; modern: boolean; relief: ReliefSettings; onStatus: (status: string) => void };
const TRANSPARENT = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==';

export default function ResearchTerrainLayer({ basemap, modern, relief, onStatus }: Props) {
  const leaflet = useMap();
  const mapRef = useRef<GLMap | null>(null);
  const readyRef = useRef(false);
  const currentRelief = useRef(relief);
  useEffect(() => {
    currentRelief.current = relief;
    if (readyRef.current && mapRef.current) {
      configureTerrainRelief(mapRef.current, 'research-elevation', RESEARCH_TERRAIN_TILES, 'terrarium', relief);
      if (!mapRef.current.areTilesLoaded()) onStatus('Updating terrain relief…');
    }
  }, [relief, onStatus]);

  useEffect(() => {
    registerTerrainReliefProtocol();
    const container = leaflet.getContainer();
    const node = document.createElement('div');
    node.className = 'research-terrain-map';
    node.setAttribute('aria-label', '3D terrain map');
    container.append(node);
    // Pointer events belong to GL; a second Leaflet click would identify a
    // different position using the flat screen coordinates.
    L.DomEvent.disableClickPropagation(node);
    L.DomEvent.disableScrollPropagation(node);
    // Leaflet's synthetic double-tap listener can consume the second click
    // before GL's gesture handling. Stop native bubbling without that shim.
    L.DomEvent.off(node, 'dblclick', L.DomEvent.stopPropagation);
    node.addEventListener('dblclick', L.DomEvent.stopPropagation);
    container.classList.add('has-research-terrain');
    const protocol = `research${L.stamp(node)}`;
    const originalBounds = leaflet.getBounds;
    let disposed = false, syncing = false, loaded = false, failed = false;
    let cameraGesture = false;
    let frame = 0, timeout = 0;
    let gl: GLMap;
    let scene: Scene = { rasters: [], paths: [], markers: [], layers: new Map() };
    const sources = new Set<string>();
    const sceneLayers = new Map<string, number>();
    const markers = new Map<number, { marker: Marker; html: string }>();
    const rasterEntries = new Map<string, RasterEntry>();
    const terrainSubscriptions = new Set<L.Layer>();
    let popup: Popup | undefined;
    const report = (message: string) => { if (!disposed) onStatus(message); };
    addProtocol(protocol, async (request, controller) => {
      const url = new URL(request.url);
      const entry = rasterEntries.get(url.hostname);
      const [z, x, y] = url.pathname.slice(1).split('/').map(Number);
      if (!entry || entry.kind !== 'tiles' || ![x, y, z].every(Number.isInteger)) throw new Error('Unavailable map tile');
      return { data: await readGridTile(entry.grid, Object.assign(L.point(x, y), { z }), controller.signal) };
    });
    try {
      const center = leaflet.getCenter();
      const style = researchTerrainStyle(basemap, modern, currentRelief.current);
      gl = new GLMap({ container: node, style, center: [center.lng, center.lat], zoom: leaflet.getZoom() - 1,
        pitch: 50, maxPitch: 65, minZoom: 6, maxZoom: 22, attributionControl: false,
        maxBounds: [[-66.6, 43.2], [-59.5, 47.5]],
      });
    } catch {
      report('3D could not start. Return to 2D or try another browser.');
      container.classList.remove('has-research-terrain'); node.remove(); removeProtocol(protocol);
      return;
    }
    mapRef.current = gl;
    gl.addControl(new NavigationControl({ showZoom: false, visualizePitch: true }), 'top-left');
    gl.addControl(new AttributionControl({ compact: true }), 'bottom-right');

    const showPopup = (layer: L.Layer, latlng: L.LatLng) => {
      const content = layer.getPopup()?.getContent();
      const value = typeof content === 'function' ? content(layer) : content;
      if (!value) return;
      popup?.remove();
      popup = new Popup({ maxWidth: '360px' }).setLngLat([latlng.lng, latlng.lat]);
      // Content has already passed the existing Leaflet popup builders. Keep
      // their DOM nodes and event handlers (including local photo actions).
      if (typeof value === 'string') popup.setHTML(value); else popup.setDOMContent(value);
      popup.addTo(gl);
    };
    const activate = (layer: L.Layer | undefined, latlng: L.LatLng, originalEvent: MouseEvent | KeyboardEvent) => {
      if (layer && (layer.options as L.InteractiveLayerOptions).interactive !== false && layer.listens('click', true)) {
        const existing = layer.getPopup();
        const autoPan = existing?.options.autoPan;
        if (existing) existing.options.autoPan = false;
        layer.fire('click', { latlng, originalEvent }, true);
        showPopup(layer, latlng);
        if (existing) existing.options.autoPan = autoPan;
      } else {
        leaflet.fire('click', { latlng, originalEvent, containerPoint: leaflet.latLngToContainerPoint(latlng), layerPoint: leaflet.latLngToLayerPoint(latlng) });
      }
    };
    gl.on('click', event => {
      const hits = gl.queryRenderedFeatures(event.point, { layers: [...sceneLayers.keys()].filter(id => id.startsWith('paths-')) });
      const hit = hits.find(feature => feature.properties.interactive);
      activate(hit ? scene.layers.get(Number(hit.properties.leafId)) : undefined, L.latLng(event.lngLat.lat, event.lngLat.lng), event.originalEvent);
    });
    gl.on('dblclick', event => {
      const latlng = L.latLng(event.lngLat.lat, event.lngLat.lng);
      const zoomEnabled = leaflet.doubleClickZoom.enabled();
      // GL owns the zoom. Notify existing cancellation listeners without
      // also running Leaflet's flat-screen zoom handler.
      leaflet.doubleClickZoom.disable();
      try {
        leaflet.fire('dblclick', { latlng, originalEvent: event.originalEvent,
          containerPoint: leaflet.latLngToContainerPoint(latlng), layerPoint: leaflet.latLngToLayerPoint(latlng) });
      } finally { if (zoomEnabled) leaflet.doubleClickZoom.enable(); }
    });

    const addLayer = (layer: LayerSpecification, order: number) => {
      gl.addLayer(layer); sceneLayers.set(layer.id, order);
    };
    const removeSource = (id: string) => {
      for (const [layerId] of sceneLayers) {
        const layer = gl.getLayer(layerId);
        if (layer && 'source' in layer && layer.source === id) { gl.removeLayer(layerId); sceneLayers.delete(layerId); }
      }
      if (gl.getSource(id)) gl.removeSource(id);
      sources.delete(id); rasterEntries.delete(id);
    };
    const syncScene = () => {
      frame = 0;
      if (!loaded || disposed) return;
      scene = collectScene(leaflet);
      const wanted = new Set(scene.rasters.map(entry => entry.id));
      const ranks = [...new Set(scene.paths.map(feature => Number(feature.properties!.order)))];
      for (const rank of ranks) wanted.add(`paths-${rank}`);
      for (const id of sources) if (!wanted.has(id)) removeSource(id);
      for (const entry of scene.rasters) {
        const previous = rasterEntries.get(entry.id);
        rasterEntries.set(entry.id, entry);
        if (!gl.getSource(entry.id)) {
          if (entry.kind === 'tiles') {
            const options = entry.grid.options as L.GridLayerOptions;
            const b = options.bounds instanceof L.LatLngBounds ? options.bounds : options.bounds ? L.latLngBounds(options.bounds) : undefined;
            gl.addSource(entry.id, { type: 'raster', tiles: [`${protocol}://${entry.id}/{z}/{x}/{y}`], tileSize: entry.grid.getTileSize().x,
              minzoom: options.minNativeZoom ?? 0, maxzoom: options.maxNativeZoom ?? 22,
              ...(b ? { bounds: [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()] as [number, number, number, number] } : {}),
              attribution: entry.layer.getAttribution?.() ?? undefined,
            });
          } else {
            gl.addSource(entry.id, { type: 'image', url: entry.kind === 'image' ? entry.url : TRANSPARENT,
              coordinates: entry.kind === 'image' ? entry.coordinates : entry.drape.coordinates });
          }
          sources.add(entry.id);
          const gridOptions = entry.kind === 'tiles' ? entry.grid.options as L.GridLayerOptions : null;
          addLayer({ id: entry.id, type: 'raster', source: entry.id,
            ...(gridOptions ? { minzoom: Math.max(0, (gridOptions.minZoom ?? 0) - 1), maxzoom: (gridOptions.maxZoom ?? 24) } : {}),
            paint: { 'raster-opacity': entry.opacity, 'raster-fade-duration': 0 } }, entry.order);
        }
        if (entry.kind === 'canvas') {
          (gl.getSource(entry.id) as ImageSource).updateImage({ image: entry.drape.canvas, coordinates: entry.drape.coordinates });
        } else if (entry.kind === 'image' && previous?.kind === 'image' && (previous.url !== entry.url || JSON.stringify(previous.coordinates) !== JSON.stringify(entry.coordinates))) {
          (gl.getSource(entry.id) as ImageSource).updateImage({ url: entry.url, coordinates: entry.coordinates });
        }
        if (previous?.opacity !== entry.opacity) gl.setPaintProperty(entry.id, 'raster-opacity', entry.opacity);
        sceneLayers.set(entry.id, entry.order);
      }
      for (const rank of ranks) {
        const id = `paths-${rank}`;
        const data: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: scene.paths.filter(feature => feature.properties!.order === rank) };
        if (gl.getSource(id)) (gl.getSource(id) as GeoJSONSource).setData(data);
        else {
          gl.addSource(id, { type: 'geojson', data }); sources.add(id);
          addLayer({ id: `${id}-fill`, type: 'fill', source: id, filter: ['==', ['geometry-type'], 'Polygon'],
            paint: { 'fill-color': ['get', 'fillColor'], 'fill-opacity': ['get', 'fillOpacity'] } }, rank);
          addLayer({ id: `${id}-line`, type: 'line', source: id, filter: ['all', ['!=', ['geometry-type'], 'Point'], ['==', ['get', 'dash'], '']],
            paint: { 'line-color': ['get', 'color'], 'line-opacity': ['get', 'opacity'], 'line-width': ['get', 'weight'] } }, rank);
          addLayer({ id: `${id}-point`, type: 'circle', source: id, filter: ['==', ['geometry-type'], 'Point'],
            paint: { 'circle-color': ['get', 'fillColor'], 'circle-opacity': ['get', 'fillOpacity'], 'circle-radius': ['get', 'radius'],
              'circle-stroke-color': ['get', 'color'], 'circle-stroke-opacity': ['get', 'opacity'], 'circle-stroke-width': ['get', 'weight'] } }, rank);
        }
        const dashes = [...new Set(data.features.map(feature => String(feature.properties!.dash)).filter(Boolean))];
        for (const dash of dashes) {
          const layerId = `${id}-dash-${dash}`;
          if (!gl.getLayer(layerId)) addLayer({ id: layerId, type: 'line', source: id,
            filter: ['all', ['!=', ['geometry-type'], 'Point'], ['==', ['get', 'dash'], dash]],
            paint: { 'line-color': ['get', 'color'], 'line-opacity': ['get', 'opacity'], 'line-width': ['get', 'weight'], 'line-dasharray': dash.split(',').map(Number) } }, rank);
        }
      }
      const markerIds = new Set(scene.markers.map(marker => L.stamp(marker)));
      for (const [id, value] of markers) if (!markerIds.has(id)) { value.marker.remove(); markers.delete(id); }
      for (const layer of scene.markers) {
        const id = L.stamp(layer), element = layer.getElement();
        if (!element) continue;
        const html = [element.className, element.innerHTML, element instanceof HTMLImageElement ? element.src : '', element.style.backgroundColor, element.style.borderColor].join('|');
        let entry = markers.get(id);
        if (!entry || entry.html !== html) {
          entry?.marker.remove();
          const clone = element.cloneNode(true) as HTMLElement;
          clone.classList.remove('leaflet-zoom-animated'); clone.style.margin = '0';
          clone.style.zIndex = String(layerOrder(leaflet, layer));
          const size = L.point(layer.options.icon?.options.iconSize ?? [0, 0]);
          const anchor = L.point(layer.options.icon?.options.iconAnchor ?? [size.x / 2, size.y / 2]);
          clone.addEventListener('click', event => { event.stopPropagation(); activate(layer, layer.getLatLng(), event); });
          clone.addEventListener('keydown', event => {
            if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.stopPropagation(); activate(layer, layer.getLatLng(), event); }
          });
          const marker = new Marker({ element: clone, offset: [size.x / 2 - anchor.x, size.y / 2 - anchor.y] }).setLngLat([layer.getLatLng().lng, layer.getLatLng().lat]).addTo(gl);
          entry = { marker, html }; markers.set(id, entry);
        }
        entry.marker.setLngLat([layer.getLatLng().lng, layer.getLatLng().lat]);
        entry.marker.getElement().style.opacity = String(layer.options.opacity ?? 1);
      }
      const ordered = (gl.getStyle().layers ?? []).map((layer, index) => ({ id: layer.id, order: sceneLayers.get(layer.id) ?? basemapLayerOrder(layer), index }))
        .sort((a, b) => a.order - b.order || a.index - b.index);
      for (const { id } of ordered) gl.moveLayer(id);
      for (const layer of terrainSubscriptions) if (!scene.layers.has(L.stamp(layer))) { layer.off('terrainchange', schedule); terrainSubscriptions.delete(layer); }
      for (const layer of scene.layers.values()) if ('getTerrainDrape' in layer && !terrainSubscriptions.has(layer)) { layer.on('terrainchange', schedule); terrainSubscriptions.add(layer); }
    };
    const schedule = () => { if (!frame && !disposed) frame = window.setTimeout(syncScene, 100); };

    const fromLeaflet = () => {
      if (syncing || disposed) return;
      syncing = true;
      const center = leaflet.getCenter();
      gl.jumpTo({ center: [center.lng, center.lat], zoom: leaflet.getZoom() - 1 });
      syncing = false; schedule();
    };
    const fromGL = () => {
      if (syncing || disposed || !loaded) return;
      syncing = true;
      const center = gl.getCenter();
      const zoom = gl.getZoom() + 1;
      const unchanged = leaflet.getCenter().equals([center.lat, center.lng], 1e-9) && Math.abs(leaflet.getZoom() - zoom) < 1e-6;
      const update = () => {
        leaflet.setView([center.lat, center.lng], zoom, { animate: false });
        // Rotation/pitch changes the query extent even if centre and zoom stay put.
        if (unchanged) leaflet.fire('moveend');
      };
      if (cameraGesture) update(); else withTerrainCameraUpdate(leaflet, update);
      cameraGesture = false;
      syncing = false; schedule();
    };
    gl.on('moveend', fromGL);
    gl.on('movestart', event => { if ('originalEvent' in event && event.originalEvent) cameraGesture = true; });
    gl.on('dragstart', () => { cameraGesture = true; leaflet.fire('dragstart'); });
    // Existing data layers ask Leaflet for the viewport. Supply the geographic
    // footprint of the tilted camera, and restore the original method on exit.
    const restoreViewport = installTerrainViewport(leaflet, () => {
      if (!loaded) return originalBounds.call(leaflet);
      const b = gl.getBounds();
      return L.latLngBounds([b.getSouth(), b.getWest()], [b.getNorth(), b.getEast()]);
    });
    leaflet.on('moveend', fromLeaflet);
    leaflet.on('layeradd layerremove', schedule);
    const observer = new MutationObserver(schedule);
    for (const pane of Object.values(leaflet.getPanes())) if (pane.classList.contains('leaflet-map-pane')) observer.observe(pane, { subtree: true, attributes: true, childList: true });
    const resize = new ResizeObserver(() => gl.resize()); resize.observe(container);
    report('Loading 3D terrain…');
    gl.on('load', () => { loaded = true; readyRef.current = true; configureTerrainRelief(gl, 'research-elevation', RESEARCH_TERRAIN_TILES, 'terrarium', currentRelief.current); syncScene(); fromGL(); });
    gl.on('error', () => { failed = true; report('A 3D layer failed to load. Return to 2D or retry 3D; the view may be incomplete.'); });
    gl.on('webglcontextlost', () => { failed = true; report('3D graphics connection lost. Return to 2D to continue.'); });
    gl.on('idle', () => { if (!failed) report('Ready'); });
    timeout = window.setTimeout(() => { if (!failed && !gl.areTilesLoaded()) report('3D layers are still loading.'); }, 25000);
    return () => {
      disposed = true; clearTimeout(frame); clearTimeout(timeout); observer.disconnect(); resize.disconnect();
      leaflet.off('moveend', fromLeaflet); leaflet.off('layeradd layerremove', schedule);
      for (const layer of terrainSubscriptions) layer.off('terrainchange', schedule);
      restoreViewport();
      popup?.remove(); for (const { marker } of markers.values()) marker.remove();
      gl.remove(); mapRef.current = null; readyRef.current = false; removeProtocol(protocol); node.remove(); container.classList.remove('has-research-terrain');
      // Refresh the flat view's data extent after restoring its camera footprint.
      withTerrainCameraUpdate(leaflet, () => leaflet.fire('moveend'));
    };
  }, [leaflet, basemap, modern, onStatus]);
  return null;
}
