import { useEffect, useState } from 'react';
import L, { type PathOptions } from 'leaflet';
import { useMap } from 'react-leaflet';
import type { ElectoralLayer, ElectoralMode } from '../layers/electoralLayers';
import { electoralFill, electoralLabel, isInstitution, loadElectoralCollection, type ElectoralLoad, type ElectoralSelection, type ElectoralFeature } from '../elections/electoralData';
import type { MapLayerId, MapLayerStatus, MapRenderMode } from './MapCanvas';

/** Each source loads once when enabled; navigation only filters the local geometry. */
export function ElectoralFeatureLayer({ layer, visible, licenceAccepted, mode, night, renderMode, onSelect, onStatusChange }: {
  layer: ElectoralLayer; visible: boolean; licenceAccepted: boolean; mode: ElectoralMode; night: boolean; renderMode: MapRenderMode;
  onSelect?: (selection: ElectoralSelection) => void; onStatusChange?: (id: MapLayerId, status: MapLayerStatus) => void;
}) {
  const map = useMap();
  const [loaded, setLoaded] = useState<ElectoralLoad | null>(null);
  useEffect(() => {
    if (!visible) return;
    let controller: AbortController | undefined;
    let timeout: number | undefined;
    let started = false;
    let cancelled = false;
    const load = () => {
      if (started || map.getZoom() < layer.minZoom) return;
      started = true;
      controller = new AbortController();
      const active = controller;
      timeout = window.setTimeout(() => { active.abort(); setLoaded({status: 'source-error'}); }, 45000);
      void loadElectoralCollection(layer, licenceAccepted, active.signal).then(value => {
        window.clearTimeout(timeout);
        if (!cancelled && !active.signal.aborted) setLoaded(value);
      });
    };
    load(); map.on('zoomend', load);
    return () => { cancelled = true; controller?.abort(); window.clearTimeout(timeout); map.off('zoomend', load); setLoaded(null); };
  }, [layer, visible, licenceAccepted, map]);
  useEffect(() => {
    if (!visible) { onStatusChange?.(layer.id, { status: 'idle' }); return; }
    const paneName = `electoral-${layer.id}`;
    const pane = map.getPane(paneName) ?? map.createPane(paneName);
    pane.style.zIndex = String(layer.zIndex);
    pane.style.pointerEvents = renderMode === 'print' ? 'none' : 'auto';
    let drawn: L.GeoJSON | undefined;
    const indexed = loaded?.status === 'ready' ? loaded.collection.features.map(feature => {
      const bounds = L.latLngBounds([]);
      const polygons = feature.geometry.type === 'Polygon' ? [feature.geometry.coordinates] : feature.geometry.coordinates;
      for (const polygon of polygons) for (const ring of polygon) for (const position of ring) bounds.extend([position[1], position[0]]);
      return { feature, bounds };
    }) : [];
    const render = () => {
      drawn?.remove(); drawn = undefined;
      if (!licenceAccepted && layer.licence === 'province-restricted') { onStatusChange?.(layer.id,{status:'licence-blocked'}); return; }
      if (map.getZoom() < layer.minZoom) { onStatusChange?.(layer.id,{status:'zoom',minZoom:layer.minZoom}); return; }
      if (!loaded) { onStatusChange?.(layer.id,{status:'loading'}); return; }
      if (loaded.status !== 'ready') { onStatusChange?.(layer.id,{status:loaded.status}); return; }
      const bounds = map.getBounds();
      const features = indexed.filter(entry => entry.bounds.intersects(bounds)).map(entry => entry.feature);
      if (!features.length) { onStatusChange?.(layer.id,{status:'outside-coverage'}); return; }
      const federal = layer.electoral.level === 'Federal', municipal = layer.electoral.level === 'Municipal';
      const line = federal ? (night ? '#9fd6e2' : '#0a4f5c') : municipal ? (night ? '#a9c98a' : '#5a7343') : (night ? '#8cc0ff' : '#1e66cc');
      drawn = L.geoJSON(features, {
        pane: paneName, interactive: renderMode !== 'print', bubblingMouseEvents: false,
        style: f => {
          const fill = electoralFill(layer,f?.properties ?? {},mode,night);
          return { color: line, weight: federal ? 2.1 : municipal ? 1 : 1.4, dashArray: federal ? '9 4' : municipal ? '1 4' : undefined,
            fillColor: fill.colour, fillOpacity: mode === 'boundaries' ? 0 : mode === 'winner' ? 0.28 : 0.65,
            pmIgnore: true, snapIgnore: true } as PathOptions;
        },
        onEachFeature: (feature, path) => {
          if (!isInstitution(layer,feature.properties)) {
            const label = document.createElement('span');
            const fill = electoralFill(layer,feature.properties,mode,night);
            label.textContent = `${electoralLabel(layer,feature.properties)}${mode === 'boundaries' ? '' : ` · ${fill.label}`}`;
            path.bindTooltip(label,{ permanent: mode !== 'boundaries' && (map.getZoom() >= 9 || renderMode === 'print'), direction: 'center', className: `electoral-map-label${night ? ' electoral-map-label-night' : ''}` });
          }
          if (renderMode === 'print') return;
          path.on('click', e => { L.DomEvent.stopPropagation(e); onSelect?.({layer,feature: feature as ElectoralFeature}); });
        },
      }).addTo(map);
      if (renderMode !== 'print') drawn.eachLayer(path => {
        const featurePath = path as L.Path & {feature: ElectoralFeature};
        const element = featurePath.getElement();
        if (!element) return;
        element.setAttribute('tabindex','0');
        element.setAttribute('role','button');
        element.setAttribute('aria-label',electoralLabel(layer,featurePath.feature.properties));
        element.addEventListener('keydown', event => {
          if (['Enter',' '].includes((event as KeyboardEvent).key)) { event.preventDefault(); onSelect?.({layer,feature:featurePath.feature}); }
        });
      });
      onStatusChange?.(layer.id,{status:'ready',count:features.length});
    };
    render(); map.on('moveend',render);
    return () => { map.off('moveend',render); drawn?.remove(); };
  }, [map, layer, visible, licenceAccepted, loaded, mode, night, renderMode, onSelect, onStatusChange]);
  return null;
}
