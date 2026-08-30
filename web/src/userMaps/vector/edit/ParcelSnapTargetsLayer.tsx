import { useEffect, useRef } from "react";
import L from "leaflet";
import { useMap } from "react-leaflet";
import {
  SNAP_TARGET_PANE,
  SNAP_TARGET_PANE_Z_INDEX,
} from "../../../components/mapPanes";
import {
  PARCEL_SNAP_MIN_ZOOM,
  ParcelSnapCache,
  fetchSnapParcels,
  type ParcelSnapFeature,
} from "../../../services/parcelSnapSource";

/**
 * Distinct states stay distinct: a licence gate, a zoom gate, a dense
 * viewport, an honest empty, and a failed load each mean something
 * different to the person deciding whether snapping is armed. "ready" with
 * count 0 is an honest empty, not evidence there are no parcels.
 */
export type ParcelSnapStatus =
  | { status: "idle" | "loading" | "error" }
  | { status: "zoom"; minZoom: number }
  | { status: "dense"; count: number; max: number }
  | { status: "ready"; count: number };

type ParcelSnapTargetsLayerProps = {
  onStatusChange: (status: ParcelSnapStatus) => void;
  /** Closure-injection seam for tests; defaults to the real NSPRD fetch. */
  fetchParcels?: typeof fetchSnapParcels;
};

const TARGET_STYLE: L.PathOptions = {
  color: "#4a6e8a",
  weight: 1,
  dashArray: "4 4",
  opacity: 0.7,
  fill: false,
};

/**
 * Mounts NSPRD parcels intersecting the viewport as snap-only geometry while
 * parcel snapping is armed. The mount site gates on the accepted province
 * licence and an active edit session; this component owns the moveend
 * lifecycle (the MineralProximityParcelLayer pattern: abort superseded
 * requests, a request-number staleness guard, moveend only because zoomend
 * duplicates it).
 *
 * The mounted children carry the three load-bearing options: snapIgnore
 * false puts them in Geoman's snap list even under the session's
 * L.PM.setOptIn(true) (source-verified against the pinned 2.20.0, pinned
 * here by the realMount tests); interactive false keeps them out of every
 * click path; nsmtsSnapSource is what the snap tracker reads to stamp
 * nsmts:traced. They never get pmIgnore: false and never get a .pm
 * instance, so Geoman's global edit/drag/delete modes cannot touch them.
 * Parcel geometry is never persisted — the cache dies with this component.
 */
export function ParcelSnapTargetsLayer({
  onStatusChange,
  fetchParcels = fetchSnapParcels,
}: ParcelSnapTargetsLayerProps) {
  const map = useMap();
  const statusRef = useRef(onStatusChange);
  const fetchRef = useRef(fetchParcels);
  useEffect(() => {
    statusRef.current = onStatusChange;
    fetchRef.current = fetchParcels;
  }, [fetchParcels, onStatusChange]);

  useEffect(() => {
    if (!map.getPane(SNAP_TARGET_PANE)) {
      const pane = map.createPane(SNAP_TARGET_PANE);
      pane.style.zIndex = String(SNAP_TARGET_PANE_Z_INDEX);
    }
    const renderer = L.canvas({ pane: SNAP_TARGET_PANE });
    const cache = new ParcelSnapCache();
    let mounted: L.GeoJSON | null = null;
    let controller: AbortController | null = null;
    let requestNumber = 0;

    const unmountTargets = () => {
      if (mounted) {
        map.removeLayer(mounted);
        mounted = null;
      }
    };

    const mountTargets = (parcels: ParcelSnapFeature[]) => {
      unmountTargets();
      const collection: GeoJSON.FeatureCollection = {
        type: "FeatureCollection",
        features: parcels,
      };
      mounted = L.geoJSON(
        collection,
        {
          pane: SNAP_TARGET_PANE,
          interactive: false,
          // Child polygons inherit these options; snapIgnore false is the
          // documented override that joins Geoman's snap list without
          // opting the layer in to its edit/drag/delete enumeration.
          snapIgnore: false,
          nsmtsSnapSource: "nsprd-parcel",
          style: { ...TARGET_STYLE, renderer },
        } as L.GeoJSONOptions,
      ).addTo(map);
    };

    const load = () => {
      controller?.abort();
      controller = null;
      requestNumber += 1;
      const currentRequest = requestNumber;

      if (map.getZoom() < PARCEL_SNAP_MIN_ZOOM) {
        unmountTargets();
        statusRef.current({ status: "zoom", minZoom: PARCEL_SNAP_MIN_ZOOM });
        return;
      }

      const bounds = map.getBounds();
      const envelope = {
        west: bounds.getWest(),
        south: bounds.getSouth(),
        east: bounds.getEast(),
        north: bounds.getNorth(),
      };
      controller = new AbortController();
      statusRef.current({ status: "loading" });
      void fetchRef
        .current(envelope, { signal: controller.signal })
        .then((parcels) => {
          if (currentRequest !== requestNumber) {
            return;
          }
          cache.add(parcels);
          const selection = cache.inViewport(envelope);
          if (selection.status === "dense") {
            // Fail closed and say so: snapping to an arbitrary subset would
            // misrepresent what is snappable.
            unmountTargets();
            statusRef.current(selection);
            return;
          }
          mountTargets(selection.parcels);
          statusRef.current({
            status: "ready",
            count: selection.parcels.length,
          });
        })
        .catch((error: unknown) => {
          if (
            currentRequest !== requestNumber ||
            (error instanceof DOMException && error.name === "AbortError")
          ) {
            return;
          }
          unmountTargets();
          statusRef.current({ status: "error" });
        });
    };

    load();
    // moveend only: Leaflet's _moveEnd fires zoomend then moveend from the
    // same call, so a zoomend subscription would double every request.
    map.on("moveend", load);

    return () => {
      requestNumber += 1;
      controller?.abort();
      map.off("moveend", load);
      unmountTargets();
      cache.clear();
    };
  }, [map]);

  return null;
}
