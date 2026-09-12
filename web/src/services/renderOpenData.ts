import type { OpenDataSource } from "../layers/openDataSources";
import type { MapEnvelope } from "./arcGISFeatureOverlay";
import { fetchOpenDataOverlay } from "./openDataOverlay";
import { toMercator } from "../userMaps/transform/webMercator";

/** Shared on-screen/print cartography; no server-rendered images are cached. */
export async function renderOpenData(source: OpenDataSource, bounds: MapEnvelope, size: { width: number; height: number }, zoom: number, signal?: AbortSignal) {
  const collection = await fetchOpenDataOverlay(source, bounds, signal, zoom);
  signal?.throwIfAborted();
  const canvas = document.createElement("canvas");
  canvas.width = size.width; canvas.height = size.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Map canvas unavailable");
  const nw = toMercator({ lat: bounds.north, lng: bounds.west });
  const se = toMercator({ lat: bounds.south, lng: bounds.east });
  const point = (p: GeoJSON.Position) => {
    if (p.length < 2 || !p.every(Number.isFinite)) throw new Error("Invalid source coordinate");
    const m = toMercator({ lat: p[1], lng: p[0] });
    return { x: (m.x - nw.x) / (se.x - nw.x) * size.width, y: (m.y - nw.y) / (se.y - nw.y) * size.height };
  };
  const line = (positions: GeoJSON.Position[], close = false) => {
    positions.forEach((p, i) => { const { x, y } = point(p); if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); });
    if (close) ctx.closePath();
  };
  const path = (geometry: GeoJSON.Geometry): boolean => {
    switch (geometry.type) {
      case "Point": { const p = point(geometry.coordinates); ctx.moveTo(p.x + 3, p.y); ctx.arc(p.x, p.y, 3, 0, Math.PI * 2); return true; }
      case "MultiPoint": geometry.coordinates.forEach((p) => path({ type: "Point", coordinates: p })); return true;
      case "LineString": line(geometry.coordinates); return false;
      case "MultiLineString": geometry.coordinates.forEach((l) => line(l)); return false;
      case "Polygon": geometry.coordinates.forEach((r) => line(r, true)); return true;
      case "MultiPolygon": geometry.coordinates.forEach((p) => p.forEach((r) => line(r, true))); return true;
      case "GeometryCollection": throw new Error("Unsupported open source geometry collection");
    }
  };
  const labels: { text: string; p: { x: number; y: number } }[] = [];
  for (const f of collection.features) {
    const desc = String(f.properties.feat_desc ?? "");
    const minorRoad = source.roads && /TRACK|TRAIL|DRIVEWAY|Unpaved|SERVICE LANE/i.test(desc);
    const color = String(f.properties.source_color);
    ctx.beginPath();
    const fill = path(f.geometry);
    ctx.lineJoin = "round"; ctx.lineCap = "round";
    ctx.setLineDash(minorRoad ? [4, 3] : []);
    if (source.roads) { ctx.strokeStyle = "#ffffff"; ctx.lineWidth = minorRoad ? 4 : 5; ctx.stroke(); }
    ctx.strokeStyle = color; ctx.fillStyle = color;
    ctx.lineWidth = source.roads ? 2 : 1.2;
    if (fill) { ctx.globalAlpha = f.geometry.type.includes("Point") ? 0.85 : source.fillOpacity ?? 0.2; ctx.fill("evenodd"); ctx.globalAlpha = 1; }
    ctx.stroke();
    if (source.labelField && zoom >= (source.labelMinZoom ?? 0)) {
      const text = String(f.properties[source.labelField] ?? "").trim();
      const coordinates = f.geometry.type === "Point" ? [f.geometry.coordinates] : f.geometry.type === "LineString" ? f.geometry.coordinates : f.geometry.type === "MultiLineString" ? f.geometry.coordinates[0] : undefined;
      if (text && !(source.roads && /^(driveway|track|trail|unknown|unnamed)$/i.test(text)) && coordinates?.length) labels.push({ text, p: point(coordinates[Math.floor(coordinates.length / 2)]) });
    }
  }
  // Simple collision grid avoids unreadable piles of labels at overview zooms.
  const occupied: { x: number; y: number; w: number; text: string }[] = [];
  ctx.font = "12px sans-serif"; ctx.textAlign = "center"; ctx.setLineDash([]);
  for (const { text, p } of labels) {
    const w = ctx.measureText(text).width + 12;
    if (p.x < 0 || p.y < 0 || p.x > size.width || p.y > size.height || occupied.some((b) => (b.text === text && Math.hypot(b.x - p.x, b.y - p.y) < 220) || (Math.abs(b.y - p.y) < 18 && Math.abs(b.x - p.x) < (b.w + w) / 2))) continue;
    occupied.push({ ...p, w, text });
    ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 4; ctx.strokeText(text, p.x, p.y);
    ctx.fillStyle = "#29332e"; ctx.fillText(text, p.x, p.y);
  }
  return { canvas, count: collection.features.length };
}
