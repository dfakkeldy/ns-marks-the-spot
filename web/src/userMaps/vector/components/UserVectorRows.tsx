import { useState } from "react";
import type { UserVectorLayerRecord } from "../types";
import type { UserVectorLayersApi } from "../useUserVectorLayers";

function provenance(record: UserVectorLayerRecord): string {
  const count = `${record.featureCount.toLocaleString("en-CA")} feature${
    record.featureCount === 1 ? "" : "s"
  }`;
  const source =
    record.origin.kind === "imported"
      ? `Your file · ${record.origin.filename}`
      : record.origin.kind === "recorded"
        ? record.origin.interrupted
          ? "Recorded on this device · interrupted"
          : "Recorded on this device"
        : record.origin.kind === "photo-import"
          ? `From your photos · ${record.origin.count.toLocaleString("en-CA")} photo${
              record.origin.count === 1 ? "" : "s"
            }`
          : "Drawn on this device";
  // An edited layer no longer matches the file it came from, so the row says
  // so rather than letting the filename imply the data is still as imported.
  const edited = record.modifiedAt
    ? ` · edited ${new Date(record.modifiedAt).toLocaleDateString("en-CA")}`
    : "";
  return `${source}${edited} · ${count}`;
}

/**
 * The vector controls App mounts directly inside My Maps. The transitional
 * UserVectorRows wrapper below retains the old standalone disclosure. Vector
 * layers stay labeled as user-loaded material, never official records. Import
 * happens through the shared drop zone; these controls list, toggle, and
 * remove. No opacity slider on
 * purpose: vector styles carry their own stroke/fill opacity, unlike the
 * raster rows' whole-image slider.
 */
export interface UserVectorRowsProps {
  api: UserVectorLayersApi;
  onEdit?: (id: string) => void;
  /**
   * The layer about to be removed, told to the edit session first. It drops
   * unsaved work for that layer instead of writing it, and closes if it was
   * open over it: the session holds its own copy of the record and geometry
   * and would otherwise stay open over a layer that no longer exists. Called
   * for every removal, not only the layer under edit — a write from the
   * session just closed can still be in flight for it.
   */
  onAbandonLayer?: (id: string) => void;
  onNewLayer?: () => void;
  onBulkPhotos?: () => void;
  editingId?: string | null;
}

function renderUserVectorControls({
  api,
  onEdit,
  onAbandonLayer,
  onNewLayer,
  onBulkPhotos,
  editingId = null,
  removing,
  onRemoving,
  onRemoved,
}: UserVectorRowsProps & {
  /** Ids whose delete has been asked for and has not answered yet. */
  removing: ReadonlySet<string>;
  onRemoving: (id: string) => void;
  onRemoved: (id: string) => void;
}) {
  return (
    <>
      {api.storageError ? (
          <small role="alert" className="user-map-error">
            {api.storageError}
          </small>
        ) : null}
      {onNewLayer ? (
          <button
            type="button"
            className="user-vector-new"
            onClick={() => onNewLayer()}
          >
            New drawing layer
          </button>
        ) : null}
      {onBulkPhotos ? (
          <button
            type="button"
            className="user-vector-new"
            title="Pick photos from this device; geotagged ones become points on a new layer."
            onClick={() => onBulkPhotos()}
          >
            Add photos to map
          </button>
        ) : null}
      {api.records.map((record) => {
          const enabled = api.uiState[record.id]?.enabled ?? false;
          return (
            <div className="layer-control user-vector-row" key={record.id}>
              <label className="layer-row">
                <input
                  type="checkbox"
                  aria-label={record.name}
                  checked={enabled}
                  onChange={(event) =>
                    api.setEnabled(record.id, event.target.checked)
                  }
                />
                <span className="switch" aria-hidden="true" />
                <span>
                  <strong>{record.name}</strong>
                  <small>{provenance(record)}</small>
                </span>
              </label>
              {/* Export exists on user layers only — never on official
                  sources, whose redistribution terms are their publisher's
                  to set, not this app's. */}
              <div className="user-vector-export">
                <small>Export</small>
                <button
                  type="button"
                  aria-label={`Export ${record.name} as GeoJSON`}
                  title="Photos aren't included in GeoJSON — use KMZ to carry photos."
                  onClick={() => void api.exportLayer(record.id, "geojson")}
                >
                  GeoJSON
                </button>
                <button
                  type="button"
                  aria-label={`Export ${record.name} as KML`}
                  title="Photos aren't included in KML — use KMZ to carry photos."
                  onClick={() => void api.exportLayer(record.id, "kml")}
                >
                  KML
                </button>
                <button
                  type="button"
                  aria-label={`Export ${record.name} as KMZ with photos embedded`}
                  title="Photos attached to features travel inside the KMZ file."
                  onClick={() => void api.exportLayer(record.id, "kmz")}
                >
                  KMZ
                </button>
                <button
                  type="button"
                  aria-label={`Export ${record.name} as GPX (points and tracks only)`}
                  title="GPX carries points and tracks; areas are not included."
                  onClick={() => void api.exportLayer(record.id, "gpx")}
                >
                  GPX
                </button>
                {record.source === "recorded" ? (
                  <button
                    type="button"
                    aria-label={`Download the raw recording for ${record.name}`}
                    title="Every position as this device reported it, before filtering — the evidence behind the drawn track."
                    onClick={() => void api.exportRawRecording(record.id)}
                  >
                    Raw GPX
                  </button>
                ) : null}
              </div>
              {onEdit ? (
                <button
                  type="button"
                  className="user-vector-edit"
                  aria-label={`Edit ${record.name}`}
                  aria-pressed={editingId === record.id}
                  // The row outlives the delete: it goes when the store
                  // answers, and until then Edit would open a session over a
                  // layer that is on its way out, which then vanishes under
                  // the reader with nothing said.
                  disabled={removing.has(record.id)}
                  onClick={() => onEdit(record.id)}
                >
                  {editingId === record.id ? "Editing" : "Edit"}
                </button>
              ) : null}
              <button
                type="button"
                className="user-map-remove"
                aria-label={`Remove ${record.name}`}
                disabled={removing.has(record.id)}
                onClick={() => {
                  if (
                    window.confirm(
                      `Remove "${record.name}" from this device? The original ` +
                        "file on your computer is not affected.",
                    )
                  ) {
                    // The editor holds its own copy of the record and
                    // geometry, so it does not notice its row is gone: left
                    // open, it would keep accepting drawings into a layer
                    // that no longer exists and take them all with it at
                    // Done. Abandoned rather than closed with Done, whose
                    // flush starts a write that lands after the delete and
                    // comes back reading as another tab's deletion. Told on
                    // every removal, not only the layer under edit, because
                    // a write from the session just closed can still be in
                    // flight. The native app holds the same rule by
                    // disabling its Layers menu for the session
                    // (MapContainerView.swift); the web rail stays live, so
                    // the removal hands the layer to the session instead.
                    onAbandonLayer?.(record.id);
                    onRemoving(record.id);
                    // Released when the store answers, whatever it answers.
                    // A refused delete still takes the row off the map, and a
                    // row that outlives its own delete must not be left with
                    // both its controls disabled and nothing said.
                    void api
                      .removeLayer(record.id)
                      .finally(() => onRemoved(record.id));
                  }
                }}
              >
                Remove
              </button>
            </div>
          );
      })}
    </>
  );
}

/**
 * Which layers have been asked to go and are waiting on the store. The id
 * leaves the set when the store answers, however it answers: a delete the
 * device refuses still takes the row off the map, but one that fails and
 * leaves the row behind must not leave it disabled with nothing said.
 */
function useRemoving(): [
  ReadonlySet<string>,
  (id: string) => void,
  (id: string) => void,
] {
  const [removing, setRemoving] = useState<ReadonlySet<string>>(new Set());
  return [
    removing,
    (id) => setRemoving((current) => new Set(current).add(id)),
    (id) =>
      setRemoving((current) => {
        if (!current.has(id)) {
          return current;
        }
        const next = new Set(current);
        next.delete(id);
        return next;
      }),
  ];
}

export function UserVectorControls(props: UserVectorRowsProps) {
  const [removing, onRemoving, onRemoved] = useRemoving();
  return (
    <div className="resource-layer-controls">
      {renderUserVectorControls({ ...props, removing, onRemoving, onRemoved })}
    </div>
  );
}

export function UserVectorRows(props: UserVectorRowsProps) {
  const { api } = props;
  const [removing, onRemoving, onRemoved] = useRemoving();
  return (
    <details className="resource-layer-group user-vector-group" open>
      <summary>
        <span>Your data</span>
        <small>
          {api.records.length === 0
            ? "GeoJSON, KML, KMZ, GPX, SHP"
            : `${api.records.length} loaded`}
        </small>
      </summary>
      <div className="resource-layer-controls">
        {renderUserVectorControls({ ...props, removing, onRemoving, onRemoved })}
      </div>
    </details>
  );
}
