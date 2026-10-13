import { useCallback, useEffect, useRef, useState } from "react";
import L from "leaflet";
import { useMap } from "react-leaflet";
import type { ContextMapLayer } from "../layers/contextLayerCatalog";
import { fishingWaterTypes } from "../layers/fishingLayers";
import type { MapLayerId, MapLayerStatus, MapRenderMode } from "../components/MapCanvas";
import { useFishingData, type FishingSpot } from "./data";
import { filterSpots, filterSummary, hasActiveFilter } from "./filters";
import "./fishingSpots.css";

/** The /fishing page's filter and selection, handed down by App. */
export interface FishingSpotsPageState {
  readonly month: number | null;
  readonly species: string | null;
  readonly selectedId: string | null;
  /** Rises when the reader asks the map to show the selected spot. */
  readonly mapReveal: number;
  readonly onSelect: (id: string | null) => void;
  readonly onOpenCard: (id: string) => void;
}

/** "Show on map" brings the reader at least this close, where the access layers draw. */
export const FISHING_SPOT_SHOW_ZOOM = 12;
const PANE = "fishing-spots";

function prefersReducedMotion() {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}

function popupContent(spot: FishingSpot, layer: ContextMapLayer, onOpenCard: (() => void) | null): HTMLElement {
  const article = document.createElement("article");
  article.className = "fishing-spot-popup-body";
  const title = document.createElement("strong");
  title.textContent = `${spot.number} · ${spot.name}`;
  const where = document.createElement("p");
  where.textContent = `${spot.area} · ${fishingWaterTypes[spot.water_type].label}`;
  const species = document.createElement("p");
  species.textContent = `Species noted: ${spot.species_text}`;
  article.append(title, where, species);
  if (onOpenCard) {
    const open = document.createElement("button");
    open.type = "button";
    open.className = "fishing-spot-popup-card";
    open.textContent = "Open the spot card";
    open.addEventListener("click", onOpenCard);
    article.append(open);
  } else {
    // On the full map the cards live on the fishing page.
    const open = document.createElement("a");
    open.className = "fishing-spot-popup-card";
    open.href = `${import.meta.env.BASE_URL}fishing?spot=${encodeURIComponent(spot.id)}`;
    open.textContent = "Open the spot card on the fishing page";
    article.append(open);
  }
  const note = document.createElement("p");
  note.className = "fishing-spot-popup-note";
  note.textContent = `${layer.sourceDate}. ${layer.webCaveat} `;
  const source = document.createElement("a");
  source.href = layer.sourceUrl;
  source.target = "_blank";
  source.rel = "noreferrer";
  source.textContent = "Project source";
  note.append(source);
  article.append(note);
  return article;
}

function intersects(bounds: L.LatLngBounds, coverage: NonNullable<ContextMapLayer["coverageBounds"]>) {
  return bounds.getWest() <= coverage.east && bounds.getEast() >= coverage.west
    && bounds.getSouth() <= coverage.north && bounds.getNorth() >= coverage.south;
}

/**
 * The curated spots as numbered pins. Unlike the generic feature layer it
 * keeps one marker per spot for the life of the layer, so a month or species
 * filter only adds and removes pins, a selection only restyles one, and a
 * filter that hides every pin reports what it did instead of an empty source.
 * Without `page` (the full map) it shows every spot and keeps its own
 * selection.
 */
export function FishingSpotsLayer({ layer, visible, page, onStatusChange, renderMode, interactive = true }: {
  layer: ContextMapLayer;
  visible: boolean;
  page?: FishingSpotsPageState;
  onStatusChange?: (id: MapLayerId, status: MapLayerStatus) => void;
  renderMode: MapRenderMode;
  interactive?: boolean;
}) {
  const map = useMap();
  // Nothing is fetched until the layer is on.
  const data = useFishingData(visible);
  const spots = data.status === "ready" ? data.data.spots : null;
  const calendar = data.status === "ready" ? data.data.calendar : null;
  const [localSelected, setLocalSelected] = useState<string | null>(null);
  const selectedId = page ? page.selectedId : localSelected;
  const month = page?.month ?? null;
  const species = page?.species ?? null;
  const mapReveal = page?.mapReveal ?? 0;
  const canInteract = renderMode !== "print" && interactive;

  const markers = useRef(new Map<string, L.Marker>());
  const popup = useRef<{ id: string; popup: L.Popup } | null>(null);
  // Set while this component closes its own popup, so that close is not read
  // as the reader dismissing the selection.
  const quiet = useRef(false);
  // The selection as the map last asked for it, ahead of App's next render.
  const selectedRef = useRef(selectedId);
  selectedRef.current = selectedId;
  const callbacks = useRef({
    onSelect: page?.onSelect ?? setLocalSelected,
    onOpenCard: page ? page.onOpenCard : null,
  });
  callbacks.current = { onSelect: page?.onSelect ?? setLocalSelected, onOpenCard: page ? page.onOpenCard : null };

  const closePopup = useCallback(() => {
    quiet.current = true;
    popup.current?.popup.remove();
    popup.current = null;
    quiet.current = false;
  }, []);

  // One marker per spot, built once per file and kept across filters.
  useEffect(() => {
    if (!visible || !spots) return;
    const pane = map.getPane(PANE) ?? map.createPane(PANE);
    // Above the overlay and marker panes, below tooltips and popups.
    pane.style.zIndex = "610";
    pane.style.pointerEvents = canInteract ? "auto" : "none";
    const built = new Map<string, L.Marker>();
    for (const spot of spots) {
      // "Pin", so a screen reader tells the map's pin from the panel's card.
      const label = `Map pin ${spot.number}: ${spot.name}`;
      const marker = L.marker([spot.latitude, spot.longitude], {
        pane: PANE,
        icon: L.divIcon({
          className: `fishing-spot-marker fishing-spot-marker--${spot.water_type}`,
          // An integer, so it is safe as markup.
          html: `<span>${spot.number}</span>`,
          iconSize: [28, 28],
          iconAnchor: [14, 14],
        }),
        keyboard: canInteract,
        interactive: canInteract,
        riseOnHover: true,
      });
      marker.on("add", () => {
        const element = marker.getElement();
        if (!element) return;
        element.style.setProperty("--fishing-spot-color", fishingWaterTypes[spot.water_type].color);
        element.dataset.spotId = spot.id;
        element.setAttribute("aria-label", label);
        element.classList.toggle("is-selected", selectedRef.current === spot.id);
      });
      if (canInteract) {
        const select = () => {
          selectedRef.current = spot.id;
          callbacks.current.onSelect(spot.id);
        };
        marker.on("click", select);
        // A focused pin is a button (role and tab stop come from Leaflet), so
        // Enter and Space select it as a click does.
        marker.on("keydown", (event: L.LeafletKeyboardEvent) => {
          const { key } = event.originalEvent;
          if (key !== "Enter" && key !== " ") return;
          event.originalEvent.preventDefault();
          select();
        });
      }
      built.set(spot.id, marker);
    }
    markers.current = built;
    return () => {
      closePopup();
      for (const marker of built.values()) marker.remove();
      markers.current = new Map();
    };
  }, [map, spots, visible, canInteract, closePopup]);

  // The filter decides which pins are on the map, and the status says so.
  useEffect(() => {
    if (!visible) {
      onStatusChange?.(layer.id, { status: "idle" });
      return;
    }
    if (data.status === "loading") {
      onStatusChange?.(layer.id, { status: "loading" });
      return;
    }
    if (data.status === "error" || !spots) {
      onStatusChange?.(layer.id, { status: "error", message: "The spot file could not be loaded" });
      return;
    }
    const filters = { month, species };
    const shown = new Set(filterSpots(spots, filters).map(({ id }) => id));
    for (const [id, marker] of markers.current) {
      if (shown.has(id)) {
        if (!map.hasLayer(marker)) marker.addTo(map);
      } else {
        marker.remove();
      }
    }
    const report = () => {
      if (spots.length === 0) onStatusChange?.(layer.id, { status: "returned-empty" });
      else if (layer.coverageBounds && !intersects(map.getBounds(), layer.coverageBounds)) onStatusChange?.(layer.id, { status: "outside-coverage" });
      else if (!hasActiveFilter(filters)) onStatusChange?.(layer.id, { status: "ready", count: spots.length });
      // The source returned every spot; the reader's filter hides some or all.
      else onStatusChange?.(layer.id, { status: "ready", message: `Filter: ${filterSummary(shown.size, spots.length, filters, calendar)}` });
    };
    report();
    map.on("moveend", report);
    return () => { map.off("moveend", report); };
  }, [map, spots, calendar, data.status, visible, canInteract, month, species, layer, onStatusChange]);

  // The selected pin is raised and ringed, with its popup open.
  const lastSelected = useRef<string | null>(null);
  const lastReveal = useRef(mapReveal);
  useEffect(() => {
    // Take the page's requests even while the layer is off or loading, so a
    // "Show on the map" made then is dropped, not replayed later.
    const changed = lastSelected.current !== selectedId;
    lastSelected.current = selectedId;
    const revealRequested = lastReveal.current !== mapReveal;
    lastReveal.current = mapReveal;
    if (!visible || !spots) return;
    for (const [id, marker] of markers.current) {
      marker.getElement()?.classList.toggle("is-selected", id === selectedId);
      marker.setZIndexOffset(id === selectedId ? 1000 : 0);
    }
    const marker = selectedId ? markers.current.get(selectedId) : undefined;
    const spot = selectedId ? spots.find(({ id }) => id === selectedId) : undefined;
    if (!marker || !spot || !map.hasLayer(marker) || !canInteract) {
      closePopup();
      return;
    }
    if (revealRequested) {
      map.setView(marker.getLatLng(), Math.max(map.getZoom(), FISHING_SPOT_SHOW_ZOOM), { animate: !prefersReducedMotion() });
    }
    // An open popup rides along with setView; only a new selection replaces it.
    const open = popup.current?.id === spot.id && map.hasLayer(popup.current.popup);
    if (open && !changed) return;
    closePopup();
    const opened = L.popup({ className: "fishing-spot-popup", maxWidth: 280, autoPanPadding: [24, 24], offset: [0, -10] })
      .setLatLng(marker.getLatLng())
      .setContent(popupContent(spot, layer, callbacks.current.onOpenCard ? () => callbacks.current.onOpenCard?.(spot.id) : null));
    opened.on("remove", () => {
      if (quiet.current || popup.current?.popup !== opened) return;
      popup.current = null;
      // The reader closed it (its button, Escape or a tap on the map).
      if (selectedRef.current === spot.id) callbacks.current.onSelect(null);
    });
    popup.current = { id: spot.id, popup: opened };
    opened.openOn(map);
  }, [map, spots, visible, canInteract, selectedId, mapReveal, month, species, layer, closePopup]);

  return null;
}
