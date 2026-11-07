import { electoralPaneOrder } from "../layers/electoralLayers";
import { useEffect, useState } from 'react';
import L, { type PathOptions } from 'leaflet';
import { useMap } from 'react-leaflet';
import type { ElectoralLayer, ElectoralMode } from '../layers/electoralLayers';
import { electoralFill, electoralLabel, isInstitution, loadElectoralCollection, type ElectoralLoad, type ElectoralSelection, type ElectoralFeature } from '../elections/electoralData';
import type { MapLayerId, MapLayerStatus, MapRenderMode } from './MapCanvas';
import { declutterLabels, electoralLabelPoint, electoralLabelsPermanent } from '../elections/electoralLabels';

/** Each source loads once when enabled; navigation only filters the local geometry. */
export function ElectoralFeatureLayer({ layer, visible, licenceAccepted, mode, night, renderMode, provincialLabelsShown = false, onSelect, onStatusChange }: {
  layer: ElectoralLayer; visible: boolean; licenceAccepted: boolean; mode: ElectoralMode; night: boolean; renderMode: MapRenderMode;
  /** A provincial district, result or seat layer is also on (federal names hand over to it; electoralLabels.ts). */
  provincialLabelsShown?: boolean;
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
    pane.style.zIndex = String(electoralPaneOrder(layer,mode));
    pane.style.pointerEvents = renderMode === 'print' ? 'none' : 'auto';
    let drawn: L.GeoJSON | undefined;
    let names: L.LayerGroup | undefined;
    const indexed = loaded?.status === 'ready' ? loaded.collection.features.map(feature => {
      const bounds = L.latLngBounds([]);
      const polygons = feature.geometry.type === 'Polygon' ? [feature.geometry.coordinates] : feature.geometry.coordinates;
      for (const polygon of polygons) for (const ring of polygon) for (const position of ring) bounds.extend([position[1], position[0]]);
      return { feature, bounds, label: electoralLabelPoint(feature.geometry) };
    }) : [];
    const render = () => {
      drawn?.remove(); drawn = undefined;
      names?.remove(); names = undefined;
      if (!licenceAccepted && layer.licence === 'province-restricted') { onStatusChange?.(layer.id,{status:'licence-blocked'}); return; }
      if (map.getZoom() < layer.minZoom) { onStatusChange?.(layer.id,{status:'zoom',minZoom:layer.minZoom}); return; }
      if (!loaded) { onStatusChange?.(layer.id,{status:'loading'}); return; }
      if (loaded.status !== 'ready') { onStatusChange?.(layer.id,{status:loaded.status}); return; }
      const bounds = map.getBounds();
      const inView = indexed.filter(entry => entry.bounds.intersects(bounds));
      const features = inView.map(entry => entry.feature);
      if (!features.length) { onStatusChange?.(layer.id,{status:'outside-coverage'}); return; }
      const federal = layer.electoral.level === 'Federal', municipal = layer.electoral.level === 'Municipal';
      const permanent = electoralLabelsPermanent(layer, mode, map.getZoom(), renderMode === 'print', provincialLabelsShown);
      const labelText = (properties: Record<string, unknown>) => {
        const fill = electoralFill(layer, properties, mode, night);
        return `${electoralLabel(layer, properties)}${mode === 'boundaries' ? '' : ` · ${fill.label}`}`;
      };
      const labelClass = `electoral-map-label${federal ? ' electoral-map-label-federal' : municipal || mode !== 'boundaries' ? '' : ' electoral-map-label-provincial'}${night ? ' electoral-map-label-night' : ''}`;
      const line = federal ? (night ? '#9fd6e2' : '#0a4f5c') : municipal ? (night ? '#a9c98a' : '#5a7343') : (night ? '#8cc0ff' : '#1e66cc');
      drawn = L.geoJSON(features, {
        pane: paneName, interactive: renderMode !== 'print', bubblingMouseEvents: false,
        style: f => {
          const fill = electoralFill(layer,f?.properties ?? {},mode,night);
          return { color: line, weight: federal ? 2.6 : municipal ? 1 : 1.6, dashArray: federal ? '12 6' : municipal ? '1 4' : undefined,
            fillColor: fill.colour, fillOpacity: mode === 'boundaries' ? 0 : mode === 'winner' ? 0.28 : 0.65,
            pmIgnore: true, snapIgnore: true } as PathOptions;
        },
        onEachFeature: (feature, path) => {
          // Permanent names are placed and decluttered below; otherwise the name follows the pointer.
          if (!permanent && !isInstitution(layer,feature.properties)) {
            const label = document.createElement('span');
            label.textContent = labelText(feature.properties);
            path.bindTooltip(label,{ sticky: true, direction: 'top', className: labelClass });
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
      if (permanent) {
        // Each name sits inside its district's largest part; where names
        // would overlap, the larger district keeps its name and the smaller
        // one is left to its tap and keyboard label.
        names = L.layerGroup().addTo(map);
        const placed: { tooltip: L.Tooltip; weight: number }[] = [];
        for (const { feature, label } of inView) {
          if (!label || isInstitution(layer, feature.properties)) continue;
          const tooltip = L.tooltip({ permanent: true, direction: 'center', className: labelClass, interactive: false })
            .setLatLng([label.position[1], label.position[0]])
            .setContent(labelText(feature.properties));
          names.addLayer(tooltip);
          placed.push({ tooltip, weight: label.weight });
        }
        const elements = placed.map(({ tooltip }) => tooltip.getElement());
        const keep = declutterLabels(
          elements.map(element => element?.getBoundingClientRect() ?? { left: 0, top: 0, right: 0, bottom: 0 }),
          placed.map(({ weight }) => weight),
        );
        elements.forEach((element, index) => { if (element && !keep.has(index)) element.style.visibility = 'hidden'; });
      }
      onStatusChange?.(layer.id,{status:'ready',count:features.length});
    };
    render(); map.on('moveend',render);
    return () => { map.off('moveend',render); drawn?.remove(); names?.remove(); };
  }, [map, layer, visible, licenceAccepted, loaded, mode, night, renderMode, provincialLabelsShown, onSelect, onStatusChange]);
  return null;
}
