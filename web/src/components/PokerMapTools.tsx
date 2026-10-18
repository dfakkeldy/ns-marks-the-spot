import "./PokerMapTools.css";
import L from "leaflet";
import { useEffect, useMemo, useRef, useState } from "react";
import { CircleMarker, Tooltip, useMap, useMapEvents } from "react-leaflet";
import { placeLabels, type PointLabel, type Rect } from "../poker/labels";
import { civicLabelPoints } from "../poker/model";
import {
  fetchViewportCivicAddresses,
  type CivicAddress,
} from "../services/civicAddresses";

// Controls and panels that float over the Poker map: a number beneath one could not be read.
// Passing notices are left out, since one can vanish without the map moving.
const CONTROLS = [".poker-search", ".mobile-map-chrome", ".leaflet-control", ".research-terrain-controls", ".location-button",
  ".location-cluster", ".location-hud", ".poker-workspace", ".measure-actions", ".display-scale-readout", ".position-readout",
  ".map-attribution", ".modern-map-error"];
// Chrome that changes size without the map moving: the footer folds after five seconds on a
// phone, sliding the measure buttons down, and the search opens its results.
const RESIZING = ".map-attribution, .poker-search";
const DOT = { color: "#173a4a", fillColor: "#fff", fillOpacity: 1, weight: 1 };

const numberSizes = new Map<string, { width: number; height: number }>();
/**
 * Civic-number tooltip boxes as the stylesheet draws them, measured in one
 * layout pass. Kept only once web fonts have settled, so a fallback face's
 * widths never outlive it.
 */
function measureNumbers(container: HTMLElement, texts: string[]) {
  const missing = [...new Set(texts)].filter((text) => !numberSizes.has(text));
  const measured = new Map<string, { width: number; height: number }>();
  if (missing.length) {
    const probe = document.createElement("div");
    probe.style.cssText = "position:absolute;left:0;top:0;visibility:hidden;pointer-events:none";
    const tips = missing.map((text) => {
      const tip = document.createElement("div");
      tip.className = "leaflet-tooltip poker-civic-number";
      tip.textContent = text;
      probe.append(tip);
      return [text, tip] as const;
    });
    container.append(probe);
    const settled = document.fonts?.status !== "loading";
    for (const [text, tip] of tips) {
      if (!tip.offsetWidth) continue;
      const size = { width: tip.offsetWidth, height: tip.offsetHeight };
      measured.set(text, size);
      if (settled) numberSizes.set(text, size);
    }
    probe.remove();
  }
  // Without layout (a hidden page), a generous estimate still keeps numbers apart.
  return (text: string) => numberSizes.get(text) ?? measured.get(text) ?? { width: text.length * 8 + 6, height: 20 };
}

export interface PokerSession {
  address: CivicAddress | null;
  revision: number;
  onCivicStatusChange: (status: string) => void;
}

export function PokerMapTools({ session }: { session: PokerSession }) {
  const map = useMap();
  const { onCivicStatusChange } = session;
  const [viewport, setViewport] = useState(0);
  const [reading, setReading] = useState<Awaited<ReturnType<typeof fetchViewportCivicAddresses>> | null>(null);
  const [status, setStatus] = useState("Zoom in to see civic numbers.");
  // Bumped when a web font finishes loading or the chrome changes size, to place again without refetching.
  const [fontRevision, setFontRevision] = useState(0);
  const [chromeRevision, setChromeRevision] = useState(0);
  // A pan or zoom outlasts the 200 ms wait, so nothing is fetched until it ends: a reading
  // taken mid-animation would be placed against a view the map is leaving. Zooms are tracked
  // apart because choosing an address frames it with a pan that ends inside the zoom.
  const panning = useRef(false);
  const zooming = useRef(false);
  const stalledView = useRef<string | null>(null);
  useMapEvents({
    movestart: () => { panning.current = true; setReading(null); setViewport((value) => value + 1); },
    zoomstart: () => { zooming.current = true; },
    zoomend: () => { zooming.current = false; },
    moveend: () => { panning.current = false; setViewport((value) => value + 1); },
  });

  useEffect(() => {
    if (!session.address) return;
    const [lng, lat] = session.address.coordinates;
    map.setView([lat, lng], 18);
    // Centre the selected point in the exposed phone map, rather than under
    // the dock. Reframe on rotation/keyboard dismissal, never on user pans.
    const frameAddress = () => {
      if (!window.matchMedia("(max-width: 860px)").matches) return;
      const dock = map.getContainer().querySelector(".poker-workspace")?.getBoundingClientRect();
      if (!dock || dock.height === 0) return;
      const bounds = map.getContainer().getBoundingClientRect();
      const landscape = window.matchMedia("(orientation: landscape)").matches;
      const target = L.point(
        landscape ? (dock.left - bounds.left + 60) / 2 : bounds.width / 2,
        landscape ? (100 + dock.bottom - bounds.top) / 2 : (100 + dock.top - bounds.top) / 2,
      );
      const point = map.latLngToContainerPoint([lat, lng]);
      map.panBy(point.subtract(target), { animate: false });
    };
    const frame = requestAnimationFrame(frameAddress);
    map.on("resize", frameAddress);
    return () => { cancelAnimationFrame(frame); map.off("resize", frameAddress); };
  }, [map, session.address, session.revision]);

  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      if (panning.current || zooming.current) {
        // An interrupted fly-to reports no end; a view that has not moved for a whole wait is settled.
        const center = map.getCenter(), view = `${center.lat},${center.lng},${map.getZoom()}`;
        if (stalledView.current !== view) { stalledView.current = view; setViewport((value) => value + 1); return; }
        panning.current = zooming.current = false;
      }
      stalledView.current = null;
      setReading(null);
      if (map.getZoom() < 16) {
        setStatus("Zoom to level 16 or closer to see civic numbers.");
        return;
      }
      const bounds = map.getBounds();
      setStatus("Loading civic numbers…");
      void fetchViewportCivicAddresses({ north: bounds.getNorth(), south: bounds.getSouth(), east: bounds.getEast(), west: bounds.getWest() }, controller.signal)
        .then((value) => {
          if (controller.signal.aborted) return;
          setReading(value);
          setStatus(value.truncated ? "Showing up to 500 civic points. Zoom in for the rest."
            : value.unreadableRows ? `${value.unreadableRows} civic points could not be read.`
            : value.addresses.length ? `${value.addresses.length} mapped civic ${value.addresses.length === 1 ? "point" : "points"}.` : "No civic points returned for this view.");
        })
        .catch(() => { if (!controller.signal.aborted) setStatus("Civic numbers unavailable. Pan to retry."); });
    }, 200);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [map, viewport]);

  useEffect(() => {
    onCivicStatusChange(status);
  }, [onCivicStatusChange, status]);

  useEffect(() => {
    const fonts = document.fonts;
    if (!fonts?.addEventListener) return;
    const bump = () => setFontRevision((value) => value + 1);
    fonts.addEventListener("loadingdone", bump);
    return () => fonts.removeEventListener("loadingdone", bump);
  }, []);

  useEffect(() => {
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => setChromeRevision((value) => value + 1));
    for (const element of document.querySelectorAll(RESIZING)) observer.observe(element);
    return () => observer.disconnect();
  }, []);

  // Each number tries the positions around its dot and is left off where none
  // is clear; its dot always draws. Units sharing a provincial point and number
  // are one label. The chosen address places first.
  const labels = useMemo(() => {
    void fontRevision; void chromeRevision;
    const points = civicLabelPoints(reading?.addresses ?? []).map((address) => {
      const text = `${address.properties.civicnum ?? ""}${address.properties.civsuffix ?? ""}`;
      return { address, text, key: `${address.pntid}|${text}` };
    }).sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
    if (!points.length) return [];
    const container = map.getContainer(), frame = container.getBoundingClientRect();
    const sizeOf = measureNumbers(container, points.map((point) => point.text));
    const chosen = session.address?.coordinates;
    const layout: PointLabel[] = points.map(({ address, text, key }) => {
      const { x, y } = map.latLngToContainerPoint([address.coordinates[1], address.coordinates[0]]);
      const selected = chosen !== undefined && address.coordinates[0] === chosen[0] && address.coordinates[1] === chosen[1];
      return { key, x, y, ...sizeOf(text), clearance: selected ? 10 : 3, selected };
    });
    const obstacles: Rect[] = CONTROLS.flatMap((selector) => [...document.querySelectorAll(selector)])
      .map((element) => element.getBoundingClientRect()).filter((r) => r.width && r.height)
      .map((r) => ({ left: r.left - frame.left, top: r.top - frame.top, right: r.right - frame.left, bottom: r.bottom - frame.top }));
    if (chosen && !layout.some((point) => point.selected)) {
      const { x, y } = map.latLngToContainerPoint([chosen[1], chosen[0]]);
      obstacles.push({ left: x - 10, top: y - 10, right: x + 10, bottom: y + 10 });
    }
    const { x: width, y: height } = map.getSize();
    const placed = new Map(placeLabels({ width, height, points: layout, roads: [], obstacles, showAllPoints: map.getZoom() >= map.getMaxZoom() })
      .points.map((point) => [point.key, point]));
    return points.map((point) => ({ ...point, placed: placed.get(point.key) }));
  }, [chromeRevision, fontRevision, map, reading, session.address]);

  return <>
    {labels.map(({ address, key, text, placed }) => <CircleMarker
      key={key} center={[address.coordinates[1], address.coordinates[0]]}
      radius={2} pathOptions={DOT} interactive={false}
    >
      {/* A number with no clear spot keeps its tooltip, hidden, so the 3D view can still place it. */}
      <Tooltip key={placed ? `${placed.dx},${placed.dy}` : "unplaced"} permanent direction="center" offset={placed ? [placed.dx, placed.dy] : [0, 0]}
        className={placed ? "poker-civic-number" : "poker-civic-number is-unplaced"} opacity={1}>
        {text}
      </Tooltip>
    </CircleMarker>)}
    {session.address && <CircleMarker center={[session.address.coordinates[1], session.address.coordinates[0]]} radius={7}
      pathOptions={{ className: "poker-selected-address", color: "#b73324", fillOpacity: 0, weight: 3 }} interactive={false} />}
  </>;
}
