import { useEffect, useMemo, useState } from 'react';
import L from 'leaflet';
import { GeoJSON, Marker, Pane, Popup, Tooltip, useMapEvents } from 'react-leaflet';
import type { Feature, Point, Polygon, MultiPolygon } from 'geojson';
import { historicalSiteSvg, type HistoricalSiteKind } from '../atlas/historicalSymbols';
import './fletcherFeatures.css';

type HistoricalProperties = {
  annotation_id: string; sheet: number; source_text: string; kind: string;
  reading_status: string; placement_status: string; geographic_role: string;
  geometry_meaning: string; source_note: string; placement_note: string;
  source_excerpt: string; source_context_url: string; source_url: string;
  evidence_url: string; fit_revision: string; fit_sha256: string;
  imagery_licence_url: string; credit: string;
  placement_correction?: { modern_reference: { url: string; rights_url: string; attribution: string } };
};
type HistoricalFeature = Feature<Point | Polygon | MultiPolygon, HistoricalProperties>;
const ROOT = `${import.meta.env.BASE_URL}fletcher-features/`;
const ICONS = new Map<string, L.DivIcon>();
function featureIcon(kind: string) {
  if (!ICONS.has(kind)) {
    const symbol = kind.includes('mine') ? 'mine' : kind;
    const svg = ['school', 'mill', 'mine', 'forge'].includes(symbol)
      ? historicalSiteSvg(symbol as HistoricalSiteKind, 'approximate', 'fletcher')
      : '<svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="9" fill="#fff4df" stroke="#633a20" stroke-dasharray="2 2"/><circle cx="10" cy="10" r="4" fill="none" stroke="#633a20" stroke-width="1.5"/></svg>';
    ICONS.set(kind, L.divIcon({ className: 'fletcher-feature-marker', html: svg, iconSize: [30, 30], iconAnchor: [15, 15] }));
  }
  return ICONS.get(kind)!;
}

function accessibleGroup(title: string, layer: L.Layer) {
  let element: Element | undefined;
  const activate = (event: Event) => {
    const key = (event as KeyboardEvent).key;
    if (key === 'Enter' || key === ' ') {
      event.preventDefault(); event.stopPropagation();
      // The React popup belongs to the GeoJSON group. Propagate the same
      // selection event as a pointer click on its child polygon.
      layer.fire('click', { latlng: (layer as L.Polygon).getBounds().getCenter() }, true);
    }
  };
  layer.on('add', () => {
    element = (layer as L.Path).getElement();
    element?.setAttribute('tabindex', '0');
    element?.setAttribute('role', 'button');
    element?.setAttribute('aria-label', `${title} · approximate Fletcher group`);
    element?.addEventListener('keydown', activate);
  });
  layer.on('remove', () => element?.removeEventListener('keydown', activate));
}

function Evidence({ feature }: { feature: HistoricalFeature }) {
  const p = feature.properties;
  return <article className="fletcher-feature-evidence">
    <h3>{p.source_text}</h3>
    <p className="fletcher-feature-id">Fletcher · sheet {p.sheet} · {p.annotation_id}</p>
    <p><strong>{p.geographic_role === 'reviewed-source-group' ? 'Approximate group · individual feature unresolved' : p.placement_status === 'locally-reviewed-approximate' ? 'Approximate location · locally corrected' : 'Approximate historical location'}</strong></p>
    <p>Reading: {p.reading_status.replaceAll('-', ' ')}. Placement is separate from reading confidence.</p>
    <img src={`${ROOT}${p.source_excerpt}`} alt={`Original Fletcher lettering and surrounding source marks: ${p.source_text}`} width="660" height="450" loading="lazy" />
    <p>{p.source_note}</p>
    <details><summary>Placement and source evidence</summary>
      <p>{p.placement_note}</p><p>{p.geometry_meaning}</p>
      <p><a href={p.source_context_url} target="_blank" rel="noreferrer">Original scan excerpt</a> · <a href={p.evidence_url} target="_blank" rel="noreferrer">Editable geometry and prior revisions</a></p>
      <p>Fit {p.fit_revision.slice(0, 8)} · SHA256 {p.fit_sha256.slice(0, 12)}.</p>
      {p.placement_correction ? <p><a href={p.placement_correction.modern_reference.url} target="_blank" rel="noreferrer">Corrected church reference</a> · <a href={p.placement_correction.modern_reference.rights_url} target="_blank" rel="noreferrer">{p.placement_correction.modern_reference.attribution}, ODbL</a></p> : null}
    </details>
    <p className="fletcher-feature-credit">{p.credit} · <a href={p.imagery_licence_url} target="_blank" rel="noreferrer">CC BY-NC-SA 3.0</a>. Transcribed, excerpted and georeferenced.</p>
  </article>;
}

export function FletcherFeaturesLayer({ onStatus }: { onStatus: (status: string) => void }) {
  const [features, setFeatures] = useState<HistoricalFeature[]>([]);
  const map = useMapEvents({ zoomend: () => setZoom(map.getZoom()), resize: () => setHeight(map.getSize().y) });
  const [zoom, setZoom] = useState(map.getZoom());
  const [height, setHeight] = useState(map.getSize().y);
  useEffect(() => {
    const controller = new AbortController();
    onStatus('Loading reviewed historical features…');
    void fetch(`${ROOT}reviewed.geojson`, { signal: controller.signal }).then(async response => {
      if (!response.ok) throw new Error('Historical feature source unavailable');
      const data = await response.json() as { type?: string; features?: HistoricalFeature[] };
      if (data.type !== 'FeatureCollection' || !Array.isArray(data.features)) throw new Error('Invalid historical feature source');
      const valid = data.features.every(f => f.geometry && ['Point', 'Polygon', 'MultiPolygon'].includes(f.geometry.type)
        && f.properties?.annotation_id && ['map-derived-approximate', 'locally-reviewed-approximate'].includes(f.properties.placement_status));
      if (!valid) throw new Error('Unreviewed historical feature source');
      if (!controller.signal.aborted) { setFeatures(data.features); onStatus(`${data.features.length} reviewed annotations · digitization in progress`); }
    }).catch(() => { if (!controller.signal.aborted) onStatus('Historical features unavailable. Toggle off and on to retry.'); });
    return () => controller.abort();
  }, [onStatus]);
  const groups = useMemo(() => {
    const grouped = new Map<string, HistoricalFeature[]>();
    for (const feature of features) {
      const key = JSON.stringify(feature.geometry);
      const group = grouped.get(key) ?? [];
      group.push(feature); grouped.set(key, group);
    }
    return [...grouped.values()];
  }, [features]);
  if (zoom < 12) return null;
  return <><Pane name="fletcher-feature-popups" style={{ zIndex: 1100 }} /><Pane name="fletcher-features" style={{ zIndex: 404 }}>
    {groups.map(group => {
      const feature = group[0];
      const title = group.map(f => f.properties.source_text).join(' / ');
      const contents = <><Tooltip pane="tooltipPane" permanent={zoom >= 15} direction="top" offset={[0, -12]} className="fletcher-feature-label">{title}</Tooltip><Popup pane="fletcher-feature-popups" className="fletcher-feature-popup" maxWidth={360} minWidth={240} maxHeight={Math.max(140, Math.min(420, height - 220))} autoPanPaddingTopLeft={[20, 100]} autoPanPaddingBottomRight={[20, 80]}>{group.map(f => <Evidence key={f.properties.annotation_id} feature={f} />)}</Popup></>;
      return feature.geometry?.type === 'Point'
        ? <Marker key={feature.properties.annotation_id} position={[feature.geometry.coordinates[1], feature.geometry.coordinates[0]]} icon={featureIcon(feature.properties.kind)} title={`${title} · approximate Fletcher location`} alt={`${title} · approximate Fletcher location`} bubblingMouseEvents={false}>{contents}</Marker>
        : <GeoJSON key={feature.properties.annotation_id} data={feature} onEachFeature={(_feature, layer) => accessibleGroup(title, layer)} style={{ color: '#79431f', weight: 2, dashArray: '5 4', fillColor: '#e9af60', fillOpacity: 0.14, bubblingMouseEvents: false }}>{contents}</GeoJSON>;
    })}
  </Pane></>;
}
