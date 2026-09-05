import { useCallback, useEffect, useMemo, useState } from "react";
import {
  environmentalHealthLayerCatalog,
  floodHazardLayerCatalog,
  hydroPilotLayerCatalog,
  provinceLayerCatalog,
  allResourceLayerCatalog,
  type EnvironmentalHealthLayerId,
  zoningLayerCatalog,
  wellLogLayerCatalog,
  type FloodHazardLayerId,
  type HydroPilotLayerId,
  type ProvinceLayerId,
  type ResourceLayerId,
  type ZoningLayerId,
  type WellLogLayerId,
} from "../../layers/layerCatalog";
import type { MapPosition, ShareLayerId } from "../../services/mapShareState";
import {
  printedLayerIds,
  type PrintMapBounds,
  type PrintSnapshot,
} from "../../services/printSnapshot";
import { normalizeFletcherTileBaseUrl } from "../../layers/fletcherLayer";
import type { NsprdFeatureCollection } from "../../services/nsprd";
import {
  MapCanvas,
  type MapLayerId,
  type MapLayerStatus,
} from "../MapCanvas";

export type PrintMapReadiness =
  | {
      status: "loading";
      renderedLayerIds: MapLayerId[];
      failedLayerIds: MapLayerId[];
      belowZoomLayerIds: MapLayerId[];
    }
  | {
      status: "ready";
      renderedLayerIds: MapLayerId[];
      belowZoomLayerIds: MapLayerId[];
    }
  | {
      status: "error";
      renderedLayerIds: MapLayerId[];
      failedLayerIds: MapLayerId[];
      belowZoomLayerIds: MapLayerId[];
      timedOutLayerIds: MapLayerId[];
    };

function visibilityFor<Id extends ShareLayerId>(
  layers: readonly { id: Id }[],
  layerIds: readonly ShareLayerId[],
): Record<Id, boolean> {
  return Object.fromEntries(
    layers.map(({ id }) => [id, layerIds.includes(id)]),
  ) as Record<Id, boolean>;
}

function provinceVisibilityFor(layerIds: readonly ShareLayerId[]) {
  return visibilityFor<ProvinceLayerId>(provinceLayerCatalog, layerIds);
}

function resourceVisibilityFor(layerIds: readonly ShareLayerId[]) {
  return visibilityFor<ResourceLayerId>(allResourceLayerCatalog, layerIds);
}

function hydroVisibilityFor(layerIds: readonly ShareLayerId[]) {
  return visibilityFor<HydroPilotLayerId>(hydroPilotLayerCatalog, layerIds);
}

function floodVisibilityFor(layerIds: readonly ShareLayerId[]) {
  return visibilityFor<FloodHazardLayerId>(floodHazardLayerCatalog, layerIds);
}

function environmentalHealthVisibilityFor(layerIds: readonly ShareLayerId[]) {
  return visibilityFor<EnvironmentalHealthLayerId>(
    environmentalHealthLayerCatalog,
    layerIds,
  );
}

function zoningVisibilityFor(layerIds: readonly ShareLayerId[]) {
  return visibilityFor<ZoningLayerId>(zoningLayerCatalog, layerIds);
}

function wellLogVisibilityFor(layerIds: readonly ShareLayerId[]) {
  return visibilityFor<WellLogLayerId>(wellLogLayerCatalog, layerIds);
}

export function PrintMap({
  snapshot,
  bounds,
  includeAerial,
  onReadinessChange,
  onResolvedPosition,
}: {
  snapshot: PrintSnapshot;
  bounds: PrintMapBounds;
  includeAerial: boolean;
  onReadinessChange: (value: PrintMapReadiness) => void;
  onResolvedPosition: (value: MapPosition) => void;
}) {
  const fletcherTileBaseUrl = useMemo(() => {
    try {
      return normalizeFletcherTileBaseUrl();
    } catch {
      return null;
    }
  }, []);
  const layerIds = useMemo(
    () => printedLayerIds([...snapshot.layerIds], includeAerial),
    [includeAerial, snapshot.layerIds],
  );
  const [statuses, setStatuses] = useState<Record<string, MapLayerStatus>>({});
  const parcels = useMemo(
    () => structuredClone(
      snapshot.template === "research"
        ? snapshot.selectedParcelGeometry
        : snapshot.mapParcels,
    ) as NsprdFeatureCollection,
    [snapshot.mapParcels, snapshot.selectedParcelGeometry, snapshot.template],
  );
  const updateStatus = useCallback((id: MapLayerId, status: MapLayerStatus) => {
    setStatuses((current) => {
      if (current[id]?.status === "error" && status.status !== "error") {
        return current;
      }
      return { ...current, [id]: status };
    });
  }, []);

  const reportPosition = useCallback((position: MapPosition | null) => {
    // Only the settled position belongs in the printed receipt.
    if (position) onResolvedPosition(position);
  }, [onResolvedPosition]);

  useEffect(() => {
    const values = layerIds.map((id) => statuses[id]);
    const renderedLayerIds = layerIds.filter((id) => statuses[id]?.status === "ready");
    const failedLayerIds = layerIds.filter((id) => statuses[id]?.status === "error");
    const belowZoomLayerIds = layerIds.filter((id) => statuses[id]?.status === "zoom");
    if (failedLayerIds.length > 0) {
      onReadinessChange({
        status: "error",
        renderedLayerIds,
        failedLayerIds,
        belowZoomLayerIds,
        timedOutLayerIds: [],
      });
    } else if (values.every((value) =>
      value?.status === "ready" || value?.status === "zoom"
    )) {
      onReadinessChange({ status: "ready", renderedLayerIds, belowZoomLayerIds });
    } else {
      onReadinessChange({
        status: "loading",
        renderedLayerIds,
        failedLayerIds,
        belowZoomLayerIds,
      });
    }
  }, [layerIds, onReadinessChange, statuses]);

  return (
    /* The same rule as the live map's wrapper: a name on a div with no role
       is discarded, so this said nothing at all. It is a region here too,
       which nests the map's own landmark inside this one — that is what the
       page is, a printable map containing the map. */
    <div
      className="print-map"
      role="region"
      aria-label={`Printable map for PID ${snapshot.pid}`}
    >
      <MapCanvas
        basemapStyle={snapshot.basemapStyle ?? "osm"}
        parcels={parcels}
        taxSalePids={new Set(snapshot.taxSalePids)}
        historicalTaxSalePids={new Set(snapshot.historicalTaxSalePids)}
        selectedPid={snapshot.pid}
        provinceLayers={provinceVisibilityFor(layerIds)}
        resourceLayers={resourceVisibilityFor(layerIds)}
        hydroPilotLayers={hydroVisibilityFor(layerIds)}
        floodHazardLayers={floodVisibilityFor(layerIds)}
        environmentalHealthLayers={environmentalHealthVisibilityFor(layerIds)}
        zoningLayers={zoningVisibilityFor(layerIds)}
        wellLogLayers={wellLogVisibilityFor(layerIds)}
        wellLogAccuracyFilter={snapshot.wellLogAccuracyFilter}
        fletcherVisible={
          Boolean(fletcherTileBaseUrl) && layerIds.includes("fletcher")
        }
        fletcherOpacity={0.72}
        fletcherTileBaseUrl={fletcherTileBaseUrl}
        showModernMap={layerIds.includes("modern")}
        showTaxSale={snapshot.mode === "current" && snapshot.taxSalePids.length > 0}
        showHistoricalTaxSales={
          snapshot.mode === "historical" && snapshot.historicalTaxSalePids.length > 0
        }
        onSelectPid={() => undefined}
        onIdentifyParcel={() => undefined}
        initialPosition={snapshot.viewport.position}
        onPositionChange={reportPosition}
        onLayerStatusChange={updateStatus}
        renderMode="print"
        fitBounds={bounds}
      />
    </div>
  );
}
