import { useEffect, useState } from "react";
import L, { type PathOptions } from "leaflet";
import { GeoJSON, useMap } from "react-leaflet";
import type {
  ZoningLayerDescriptor,
  ZoningLayerId,
} from "../layers/layerCatalog";
import {
  EMPTY_ZONING_FEATURES,
  describeZoningFeature,
  fetchZoningPolygons,
  zoningFeatureLabel,
  type ZoningFeatureCollection,
} from "../services/zoning";
import type { MapLayerStatus } from "./MapCanvas";
import { ZONING_PANE } from "./mapPanes";
import { textTooltip } from "./mapTooltip";
import type { MapRenderMode } from "./parcelStyle";

type ZoningLayerProps = {
  layer: ZoningLayerDescriptor;
  visible: boolean;
  onStatusChange?: (id: ZoningLayerId, status: MapLayerStatus) => void;
  renderMode: MapRenderMode;
};

const ZONING_POPUP_NOTE =
  "Unofficial rendering of a municipal map service, not the municipality's official copy and not for legal purposes. Confirm the zone and its rules with the municipality.";

function zoningStyle(layer: ZoningLayerDescriptor): PathOptions {
  return {
    color: layer.strokeColor,
    fillColor: layer.fillColor,
    fillOpacity: layer.opacity,
    weight: 1,
  };
}

const printZoningStyle: PathOptions = {
  color: "#333333",
  fillColor: "#ededed",
  fillOpacity: 0.35,
  weight: 1,
  dashArray: "1 2",
  className: "print-zoning-zone",
};

/**
 * Builds the popup as DOM nodes rather than an HTML string. Zone codes and
 * names arrive from third-party municipal services, so assigning them through
 * textContent makes markup injection impossible by construction. The only href
 * is the by-law URL, which comes from our own catalog.
 */
function buildZoningPopup(
  properties: Record<string, unknown>,
  layer: ZoningLayerDescriptor,
): HTMLElement {
  const description = describeZoningFeature(properties, layer);

  const article = document.createElement("article");
  article.className = "zoning-popup";

  const eyebrow = document.createElement("p");
  eyebrow.className = "zoning-popup-eyebrow";
  eyebrow.textContent = layer.name;
  article.append(eyebrow);

  const heading = document.createElement("h3");
  heading.textContent = zoningFeatureLabel(description);
  article.append(heading);

  if (description.planArea) {
    const planArea = document.createElement("p");
    planArea.className = "zoning-popup-plan-area";
    planArea.textContent = `Plan area: ${description.planArea}`;
    article.append(planArea);
  }

  const bylawLink = document.createElement("a");
  bylawLink.className = "zoning-popup-bylaw";
  bylawLink.href = layer.bylawUrl;
  bylawLink.target = "_blank";
  bylawLink.rel = "noreferrer";
  bylawLink.textContent = layer.bylawLabel;
  article.append(bylawLink);

  const note = document.createElement("p");
  note.className = "zoning-popup-note";
  note.textContent = ZONING_POPUP_NOTE;
  article.append(note);

  return article;
}

export function ZoningLayer({
  layer,
  visible,
  onStatusChange,
  renderMode,
}: ZoningLayerProps) {
  const map = useMap();
  const [collection, setCollection] = useState<ZoningFeatureCollection>(
    EMPTY_ZONING_FEATURES,
  );

  useEffect(() => {
    let controller: AbortController | null = null;
    let requestNumber = 0;

    const loadVisibleZones = () => {
      controller?.abort();
      controller = null;
      requestNumber += 1;
      const currentRequest = requestNumber;

      if (!visible) {
        setCollection(EMPTY_ZONING_FEATURES);
        onStatusChange?.(layer.id, { status: "idle" });
        return;
      }

      if (map.getZoom() < layer.minZoom) {
        setCollection(EMPTY_ZONING_FEATURES);
        onStatusChange?.(layer.id, { status: "zoom", minZoom: layer.minZoom });
        return;
      }

      const bounds = map.getBounds();
      controller = new AbortController();
      onStatusChange?.(layer.id, { status: "loading" });
      void fetchZoningPolygons(
        layer,
        {
          west: bounds.getWest(),
          south: bounds.getSouth(),
          east: bounds.getEast(),
          north: bounds.getNorth(),
        },
        controller.signal,
      )
        .then((nextCollection) => {
          if (currentRequest !== requestNumber) {
            return;
          }
          setCollection(nextCollection);
          onStatusChange?.(layer.id, {
            status: "ready",
            count: nextCollection.features.length,
          });
        })
        .catch((error: unknown) => {
          if (
            currentRequest !== requestNumber ||
            (error instanceof DOMException && error.name === "AbortError")
          ) {
            return;
          }
          setCollection(EMPTY_ZONING_FEATURES);
          onStatusChange?.(layer.id, { status: "error" });
        });
    };

    loadVisibleZones();
    // moveend only: Leaflet's _moveEnd fires zoomend then moveend from the
    // same call, so a zoomend subscription made every zoom issue a doomed
    // duplicate request that the moveend run aborted milliseconds later.
    map.on("moveend", loadVisibleZones);

    return () => {
      requestNumber += 1;
      controller?.abort();
      map.off("moveend", loadVisibleZones);
    };
  }, [layer, map, onStatusChange, visible]);

  if (!visible) {
    return null;
  }

  return (
    <GeoJSON
      key={`${layer.id}:${collection.features
        .map(({ properties }) => String(properties[layer.idField]))
        .join(",")}`}
      data={collection}
      pane={ZONING_PANE}
      style={renderMode === "print" ? printZoningStyle : zoningStyle(layer)}
      interactive={renderMode !== "print"}
      onEachFeature={
        renderMode === "print"
          ? undefined
          : (feature, featureLayer) => {
              const properties = (feature.properties ?? {}) as Record<
                string,
                unknown
              >;
              featureLayer.bindTooltip(
                textTooltip(
                  `${layer.name} · ${zoningFeatureLabel(
                    describeZoningFeature(properties, layer),
                  )}`,
                ),
                { sticky: true },
              );
              featureLayer.bindPopup(() => buildZoningPopup(properties, layer));
              featureLayer.on("click", (event) => {
                L.DomEvent.stopPropagation(event);
              });
            }
      }
    />
  );
}
