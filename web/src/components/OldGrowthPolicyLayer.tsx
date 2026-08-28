import { useEffect, useState } from "react";
import L from "leaflet";
import { GeoJSON, useMap } from "react-leaflet";
import type {
  ForestryLayerDescriptor,
  ForestryLayerId,
} from "../layers/layerCatalog";
import {
  EMPTY_OLD_GROWTH_POLICY_FEATURES,
  describeOldGrowthPolicyFeature,
  fetchOldGrowthPolicyPolygons,
  type OldGrowthPolicyFeatureCollection,
} from "../services/oldGrowthPolicy";
import type { MapLayerStatus } from "./MapCanvas";
import { OLD_GROWTH_POLICY_PANE } from "./mapPanes";
import type { MapRenderMode } from "./parcelStyle";
import {
  buildOldGrowthPolicyPopup,
  oldGrowthPolicyStyle,
} from "./oldGrowthPolicyPresentation";

type OldGrowthPolicyLayerProps = {
  layer: ForestryLayerDescriptor;
  visible: boolean;
  onStatusChange?: (id: ForestryLayerId, status: MapLayerStatus) => void;
  renderMode: MapRenderMode;
};

export function OldGrowthPolicyLayer({
  layer,
  visible,
  onStatusChange,
  renderMode,
}: OldGrowthPolicyLayerProps) {
  const map = useMap();
  const [collection, setCollection] =
    useState<OldGrowthPolicyFeatureCollection>(
      EMPTY_OLD_GROWTH_POLICY_FEATURES,
    );

  useEffect(() => {
    let controller: AbortController | null = null;
    let requestNumber = 0;

    const loadVisiblePolicies = () => {
      controller?.abort();
      controller = null;
      requestNumber += 1;
      const currentRequest = requestNumber;

      if (!visible) {
        setCollection(EMPTY_OLD_GROWTH_POLICY_FEATURES);
        onStatusChange?.(layer.id, { status: "idle" });
        return;
      }

      if (map.getZoom() < layer.minZoom) {
        setCollection(EMPTY_OLD_GROWTH_POLICY_FEATURES);
        onStatusChange?.(layer.id, {
          status: "zoom",
          minZoom: layer.minZoom,
        });
        return;
      }

      const bounds = map.getBounds();
      controller = new AbortController();
      onStatusChange?.(layer.id, { status: "loading" });
      void fetchOldGrowthPolicyPolygons(
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
          setCollection(EMPTY_OLD_GROWTH_POLICY_FEATURES);
          onStatusChange?.(layer.id, { status: "error" });
        });
    };

    loadVisiblePolicies();
    // moveend only: Leaflet's _moveEnd fires zoomend then moveend from the
    // same call, so a zoomend subscription made every zoom issue a doomed
    // duplicate request that the moveend run aborted milliseconds later.
    map.on("moveend", loadVisiblePolicies);

    return () => {
      requestNumber += 1;
      controller?.abort();
      map.off("moveend", loadVisiblePolicies);
    };
  }, [layer, map, onStatusChange, visible]);

  if (!visible) {
    return null;
  }

  return (
    <GeoJSON
      key={`${layer.id}:${collection.features
        .map(({ properties }) => String(properties[":id"]))
        .join(",")}`}
      data={collection}
      pane={OLD_GROWTH_POLICY_PANE}
      style={(feature) =>
        oldGrowthPolicyStyle(
          (feature?.properties ?? {}) as Record<string, unknown>,
          layer,
          renderMode,
        )
      }
      interactive={renderMode !== "print"}
      onEachFeature={
        renderMode === "print"
          ? undefined
          : (feature, featureLayer) => {
              const properties = (feature.properties ?? {}) as Record<
                string,
                unknown
              >;
              const description =
                describeOldGrowthPolicyFeature(properties);
              const area =
                description.hectares === null
                  ? ""
                  : ` · ${description.hectares.toLocaleString("en-CA", {
                      maximumFractionDigits: 2,
                    })} ha`;
              featureLayer.bindTooltip(
                `${description.statusLabel}${area}`,
                { sticky: true },
              );
              featureLayer.bindPopup(() =>
                buildOldGrowthPolicyPopup(properties, layer),
              );
              featureLayer.on("click", (event) => {
                L.DomEvent.stopPropagation(event.originalEvent);
              });
            }
      }
    />
  );
}
