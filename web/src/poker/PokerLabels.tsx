import { memo, useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import { CircleMarker, Marker, useMap } from 'react-leaflet';
import { atlasPalettes } from '../atlas/palette';
import type { CivicAddress } from '../services/civicAddresses';
import { placeLabels, type NamedRoad, type PointLabel, type Rect, type RoadLabel } from './labels';
import { addressId, type PokerAddress } from './model';
const palette = atlasPalettes.day;
// Box sizes must match .poker-number and .poker-road-label in poker.css.
const NUMBER = { font: '650 12px system-ui', size: 12, padding: 4, height: 14 };
const POSTAL_FONT = 'italic 650 12px system-ui';
const ROAD = { font: '600 11px system-ui', size: 11, padding: 8, height: 15 };
// Controls float over the map, so a label beneath one could not be read. Notices are left out: one can
// vanish in the same update that moves the map, and its space would stay blank until the next pan.
// The update notice is kept: it stays until the page reloads.
const CHROME = ['.poker-searchbar', '.poker-options', '.poker-basemap', '.poker-locate', '.poker-measurement', '.poker-footer',
  '.poker-update', '.leaflet-control-zoom', '.leaflet-control-scale'];
const CIVIC_DOT = { color: palette.ink, fillColor: '#fff', fillOpacity: 1, weight: 1 };
const POSTAL_DOT = { color: '#17518a', fillColor: '#fff', fillOpacity: 1, weight: 1 };
/**
 * Address dots draw above every label, so a road name that has to pass over one
 * never hides it. Created once per map and never removed: Leaflet keeps one
 * canvas renderer per pane name for the life of the map.
 */
const DOT_PANE = 'poker-dots';
function dotPane(map: L.Map): string {
  if (!map.getPane(DOT_PANE)) Object.assign(map.createPane(DOT_PANE).style, { zIndex: '610', pointerEvents: 'none' });
  return DOT_PANE;
}
/** One [lat, lng] per source coordinate pair, so a new layout does not move dots and labels that stayed put. */
const latLngs = new WeakMap<readonly number[], [number, number]>();
function latLng(coordinates: readonly number[]): [number, number] {
  let value = latLngs.get(coordinates);
  if (!value) { value = [coordinates[1], coordinates[0]]; latLngs.set(coordinates, value); }
  return value;
}
const widths = new Map<string, number>();
let context: CanvasRenderingContext2D | null | undefined;
function textWidth(text: string, font: string, size: number): number {
  const key = `${font}|${text}`;
  let width = widths.get(key);
  if (width === undefined) {
    if (context === undefined) { try { context = document.createElement('canvas').getContext('2d'); } catch { context = null; } }
    if (context) { context.font = font; width = context.measureText(text).width; }
    // Without a canvas, a generous estimate keeps labels apart.
    if (!width) width = text.length * size * 0.62;
    widths.set(key, width);
  }
  return width;
}
const escapeText = (text: string) => text.replace(/[&<>"']/gu, c => `&#${c.charCodeAt(0)};`);
function labelIcon(cache: Map<string, L.DivIcon>, className: string, text: string, dx: number, dy: number, angle = 0): L.DivIcon {
  const transform = `translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px) translate(-50%, -50%)${angle ? ` rotate(${angle.toFixed(1)}deg)` : ''}`;
  const key = `${className}|${text}|${transform}`;
  let icon = cache.get(key);
  if (!icon) {
    if (cache.size > 4000) cache.clear();
    // Leaflet owns the marker's transform; the label turns inside it.
    icon = L.divIcon({ className: 'poker-label', iconSize: [0, 0], html: `<span class="${className}" style="transform: ${transform}">${escapeText(text)}</span>` });
    cache.set(key, icon);
  }
  return icon;
}
/** Everything in view first when a dense view must be cut, without disturbing the stable placement order. */
function capped<T>(items: T[], visible: (item: T) => boolean, limit: number): T[] {
  if (items.length <= limit) return items;
  const kept = new Set([...items.filter(visible), ...items.filter(item => !visible(item))].slice(0, limit));
  return items.filter(item => kept.has(item));
}
const same = (a: readonly number[], b: readonly number[] | null) => b !== null && a[0] === b[0] && a[1] === b[1];
/** Civic and postal dots with their numbers, and road names, placed so no label covers another. */
export const PokerLabels = memo(function PokerLabels({ view, roads, civic, postal, selected }: {
  view: number; roads: NamedRoad[]; civic: CivicAddress[]; postal: PokerAddress[]; selected: readonly number[] | null;
}) {
  const map = useMap();
  const pane = dotPane(map);
  const icons = useRef(new Map<string, L.DivIcon>());
  // Map controls mount after the first render; place again once they can be avoided.
  const [mounted, setMounted] = useState(false);
  useEffect(() => { const frame = requestAnimationFrame(() => setMounted(true)); return () => cancelAnimationFrame(frame); }, []);
  const layout = useMemo(() => {
    void view; void mounted;
    // Labels just past the edge are placed too, within the margin the canvas also paints, so a short pan shows numbers with their dots.
    const zoom = map.getZoom(), shown = map.getBounds(), near = shown.pad(0.1);
    const contains = (bounds: L.LatLngBounds, [lng, lat]: readonly number[]) => bounds.contains([lat, lng]);
    const civicHere = zoom < 16 ? [] : capped(civic.filter(a => contains(near, a.coordinates)), a => contains(shown, a.coordinates), 1000);
    const postalHere = zoom < 16 ? [] : capped(postal.filter(a => contains(near, a.mailing.coordinates)), a => contains(shown, a.mailing.coordinates), 200);
    const project = ([lng, lat]: readonly number[]) => map.latLngToContainerPoint([lat, lng]);
    const point = (key: string, text: string, coordinates: readonly number[], font: string): PointLabel => {
      const { x, y } = project(coordinates);
      const chosen = same(coordinates, selected);
      return { key, x, y, width: textWidth(text, font, NUMBER.size) + NUMBER.padding, height: NUMBER.height, clearance: chosen ? 10 : 3, selected: chosen };
    };
    const civicPoints = civicHere.map(a => ({ address: a, text: `${a.properties.civicnum ?? ''}${a.properties.civsuffix ?? ''}`, key: addressId({ mailing: null, civic: a }) }));
    const postalPoints = postalHere.map(a => ({ address: a, text: `${a.mailing.number}${a.mailing.suffix}`, key: a.mailing.id }));
    const roadLabels: RoadLabel[] = zoom < 15 ? [] : roads.filter(road => road.bounds.some(b => near.intersects(b))).map(road => ({
      key: road.name, rank: road.rank, width: textWidth(road.name, ROAD.font, ROAD.size) + ROAD.padding, height: ROAD.height,
      lines: road.lines.filter((_, i) => near.intersects(road.bounds[i])).map(line => line.map(p => project(p))),
    }));
    const container = map.getContainer(), frame = container.getBoundingClientRect();
    const shell = container.closest('.poker-app') ?? container;
    const obstacles: Rect[] = CHROME.flatMap(selector => [...shell.querySelectorAll(selector)]).map(element => element.getBoundingClientRect())
      .filter(r => r.width && r.height).map(r => ({ left: r.left - frame.left, top: r.top - frame.top, right: r.right - frame.left, bottom: r.bottom - frame.top }));
    // Below street zoom no numbers are placed, so the chosen address's ring is kept clear of road names here.
    if (selected && zoom < 16) { const { x, y } = project(selected); obstacles.push({ left: x - 10, top: y - 10, right: x + 10, bottom: y + 10 }); }
    const size = map.getSize();
    const placed = placeLabels({
      width: size.x, height: size.y, obstacles, roads: roadLabels, showAllPoints: zoom >= map.getMaxZoom(),
      // Postal-only points first: where one sits on a civic point, the blue number is the one that says the lists disagree.
      points: [...postalPoints.map(p => point(p.key, p.text, p.address.mailing.coordinates, POSTAL_FONT)), ...civicPoints.map(p => point(p.key, p.text, p.address.coordinates, NUMBER.font))],
    });
    return { civicPoints, postalPoints, placed: new Map(placed.points.map(p => [p.key, p])), roads: placed.roads.map(road => ({ ...road, latlng: map.containerPointToLatLng([road.x, road.y]) })) };
  }, [civic, map, mounted, postal, roads, selected, view]);
  const cache = icons.current;
  return <>
    {layout.civicPoints.map(({ address, key }) => <CircleMarker key={key} pane={pane} center={latLng(address.coordinates)} radius={2} interactive={false} pathOptions={CIVIC_DOT} />)}
    {layout.postalPoints.map(({ address, key }) => <CircleMarker key={key} pane={pane} center={latLng(address.mailing.coordinates)} radius={2} interactive={false} pathOptions={POSTAL_DOT} />)}
    {layout.roads.map(road => <Marker key={`road:${road.key}#${road.index}`} position={road.latlng} interactive={false} keyboard={false}
      icon={labelIcon(cache, 'poker-road-label', road.key, 0, 0, road.angle)} />)}
    {layout.civicPoints.map(({ address, key, text }) => { const p = layout.placed.get(key); return p && <Marker key={`civic:${key}`} position={latLng(address.coordinates)} interactive={false} keyboard={false}
      icon={labelIcon(cache, 'poker-number', text, p.dx, p.dy)} />; })}
    {layout.postalPoints.map(({ address, key, text }) => { const p = layout.placed.get(key); return p && <Marker key={`postal:${key}`} position={latLng(address.mailing.coordinates)} interactive={false} keyboard={false}
      icon={labelIcon(cache, 'poker-number is-postal', text, p.dx, p.dy)} />; })}
  </>;
});
