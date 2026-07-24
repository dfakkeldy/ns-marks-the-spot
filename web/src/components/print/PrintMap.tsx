import { useCallback, useEffect, useMemo, useState } from "react";
import {
  environmentalHealthLayerCatalog,
  floodHazardLayerCatalog,
  hydroPilotLayerCatalog,
  provinceLayerCatalog,
  allResourceLayerCatalog,
  type EnvironmentalHealthLayerId,
  type FloodHazardLayerId,
  type HydroPilotLayerId,
  type ProvinceLayerId,
  type ResourceLayerId,
} from "../../layers/layerCatalog";
import type { MapPosition, ShareLayerId } from "../../services/mapShareState";
import {
  printedLayerIds,
  type PrintMapBounds,
  type PrintSnapshot,
} from "../../services/printSnapshot";
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
    <div className="print-map" aria-label={`Printable map for PID ${snapshot.pid}`}>
      <MapCanvas
        parcels={parcels}
        taxSalePids={new Set(snapshot.taxSalePids)}
        historicalTaxSalePids={new Set(snapshot.historicalTaxSalePids)}
        selectedPid={snapshot.pid}
        provinceLayers={provinceVisibilityFor(layerIds)}
        resourceLayers={resourceVisibilityFor(layerIds)}
        hydroPilotLayers={hydroVisibilityFor(layerIds)}
        floodHazardLayers={floodVisibilityFor(layerIds)}
        environmentalHealthLayers={environmentalHealthVisibilityFor(layerIds)}
        showModernMap={layerIds.includes("modern")}
        showTaxSale={snapshot.mode === "current" && snapshot.taxSalePids.length > 0}
        showHistoricalTaxSales={
          snapshot.mode === "historical" && snapshot.historicalTaxSalePids.length > 0
        }
        onSelectPid={() => undefined}
        onIdentifyParcel={() => undefined}
        initialPosition={snapshot.viewport.position}
        onPositionChange={onResolvedPosition}
        onLayerStatusChange={updateStatus}
        renderMode="print"
        fitBounds={bounds}
      />
    </div>
  );
}
