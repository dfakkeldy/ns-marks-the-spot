import type { FeatureCollection } from "geojson";
import { UserMapImportError } from "../../errors";
import {
  BLOBS,
  PHOTOS,
  PHOTOS_BY_LAYER_INDEX,
  VECTORS,
  fromStoredBlob,
  isQuotaError,
  openUserContentDatabase,
  request,
  toStoredBlob,
  transactionDone,
  type StoredBlob,
} from "../../store/database";
import type { UserVectorLayerRecord } from "../types";
import {
  isPhotoIdReserved,
  photoFullBlobKey,
  photoThumbBlobKey,
  releasePhotoId,
} from "../photos/photoStore";
import { readPhotoDescriptors } from "../photos/types";
import type { PhotoRecord } from "../photos/types";

function geometryKey(id: string): string {
  return `${id}:vector`;
}

function originalKey(id: string): string {
  return `${id}:vector-original`;
}

function geometryBlob(collection: FeatureCollection): Blob {
  return new Blob([JSON.stringify(collection)], { type: "application/geo+json" });
}

/**
 * Vector-layer store over the shared user-content database (see database.ts
 * for the schema). Geometry lives out-of-line in `blobs` as JSON bytes under
 * `${id}:vector`; the as-imported original file under `${id}:vector-original`
 * so provenance survives edits — the record says where the data came from,
 * the original says exactly what arrived.
 */
export class UserVectorStore {
  private constructor(private readonly db: IDBDatabase) {}

  static async open(factory: IDBFactory = indexedDB): Promise<UserVectorStore> {
    return new UserVectorStore(await openUserContentDatabase(factory));
  }

  async saveVectorLayer(
    record: UserVectorLayerRecord,
    collection: FeatureCollection,
    original?: Blob,
  ): Promise<void> {
    // Convert before opening the transaction: arrayBuffer() is async, and an
    // IndexedDB transaction auto-commits once it goes a tick without a new
    // request, so any awaited work must happen before transaction() is called.
    const storedGeometry = await toStoredBlob(geometryBlob(collection));
    const storedOriginal = original ? await toStoredBlob(original) : null;
    const tx = this.db.transaction([VECTORS, BLOBS], "readwrite");
    try {
      // put() calls stay inside the try: Safari can throw QuotaExceededError
      // synchronously from put() rather than via the abort event.
      tx.objectStore(VECTORS).put(record);
      tx.objectStore(BLOBS).put(storedGeometry, geometryKey(record.id));
      if (storedOriginal) {
        tx.objectStore(BLOBS).put(storedOriginal, originalKey(record.id));
      }
      await transactionDone(tx);
    } catch (error) {
      if (isQuotaError(error)) {
        throw new UserMapImportError(
          "quota",
          "Storage is full — this layer stays available until you close the tab.",
        );
      }
      throw new UserMapImportError(
        "storage-failed",
        "Couldn't save this layer — it stays available until you close the tab.",
      );
    }
  }

  /**
   * UPDATE — never a create. Guarded rather than a blind `put` for the same
   * two-tab race documented on UserMapStore.putUserMapRecord: this runs from
   * a debounce timer after edits (phase 4), and a blind upsert would let the
   * editing tab resurrect a layer another tab deleted. The get and both puts
   * share ONE transaction, and the puts are issued from inside the get's
   * `onsuccess` handler — a transaction auto-commits once it goes a tick
   * without a new request, so queuing from the success handler is the only
   * form that needs no scheduling assumptions.
   */
  async putVectorLayer(
    record: UserVectorLayerRecord,
    collection: FeatureCollection,
  ): Promise<boolean> {
    const storedGeometry = await toStoredBlob(geometryBlob(collection));
    const tx = this.db.transaction([VECTORS, BLOBS], "readwrite");
    const vectors = tx.objectStore(VECTORS);
    const existing = vectors.get(record.id) as IDBRequest<
      UserVectorLayerRecord | undefined
    >;
    let wrote = false;
    existing.onsuccess = () => {
      // Absent row = another tab deleted this layer. Skipping leaves the
      // transaction with nothing more to do, so it commits as a no-op — and
      // the caller is told, because a no-op is not a save.
      if (existing.result !== undefined) {
        wrote = true;
        vectors.put(record);
        tx.objectStore(BLOBS).put(storedGeometry, geometryKey(record.id));
      }
    };
    // No `onerror` on purpose: an unhandled request error aborts the
    // transaction and transactionDone surfaces the real DOMException.
    await transactionDone(tx);
    return wrote;
  }

  async listVectorLayers(): Promise<UserVectorLayerRecord[]> {
    const tx = this.db.transaction(VECTORS, "readonly");
    const all = await request(
      tx.objectStore(VECTORS).getAll() as IDBRequest<UserVectorLayerRecord[]>,
    );
    return all.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  private async getBlob(key: string): Promise<Blob | null> {
    const tx = this.db.transaction(BLOBS, "readonly");
    const result = await request(
      tx.objectStore(BLOBS).get(key) as IDBRequest<StoredBlob | undefined>,
    );
    return result ? fromStoredBlob(result) : null;
  }

  async getGeometry(id: string): Promise<FeatureCollection | null> {
    const blob = await this.getBlob(geometryKey(id));
    if (!blob) {
      return null;
    }
    try {
      return JSON.parse(await blob.text()) as FeatureCollection;
    } catch {
      // A geometry blob this store wrote can only fail to parse if the
      // database was corrupted underneath us; treat it as absent.
      return null;
    }
  }

  getOriginalBlob(id: string): Promise<Blob | null> {
    return this.getBlob(originalKey(id));
  }

  async deleteVectorLayer(id: string): Promise<void> {
    // The layer's photos go with it — a removed layer must not leak its
    // photo rows and blobs into storage forever.
    const photos = await this.listLayerPhotoRecords(id);
    const tx = this.db.transaction([VECTORS, BLOBS, PHOTOS], "readwrite");
    tx.objectStore(VECTORS).delete(id);
    tx.objectStore(BLOBS).delete(geometryKey(id));
    tx.objectStore(BLOBS).delete(originalKey(id));
    for (const photo of photos) {
      tx.objectStore(PHOTOS).delete(photo.id);
      tx.objectStore(BLOBS).delete(photoFullBlobKey(photo.id));
      tx.objectStore(BLOBS).delete(photoThumbBlobKey(photo.id));
    }
    await transactionDone(tx);
  }

  private async listLayerPhotoRecords(layerId: string): Promise<PhotoRecord[]> {
    const tx = this.db.transaction(PHOTOS, "readonly");
    return request(
      tx
        .objectStore(PHOTOS)
        .index(PHOTOS_BY_LAYER_INDEX)
        .getAll(layerId) as IDBRequest<PhotoRecord[]>,
    );
  }

  /**
   * The contract's per-commit sweep, called from the layer write path: photo
   * rows for this layer that no feature descriptor references any more (a
   * deleted feature takes its descriptors with it) are removed with their
   * blobs. Fire-and-forget at the call site — a failed sweep is a small
   * leak, never a failed save.
   *
   * Reserved rows are exempt. Every write carries a working copy captured
   * before it ran, and a photo attached since then is already in the store
   * with its descriptor still in flight — this collection saying nothing
   * about that row is not evidence the row is an orphan. The reservation
   * ends here, the moment a write does reference the id.
   */
  async sweepLayerPhotos(
    layerId: string,
    collection: FeatureCollection,
  ): Promise<void> {
    const referenced = new Set<string>();
    for (const feature of collection.features) {
      for (const descriptor of readPhotoDescriptors(feature.properties)) {
        referenced.add(descriptor.id);
      }
    }
    // Referenced now, so no longer in need of a reservation. Before the
    // early return below: a write that references an id and sweeps nothing
    // must still end that id's reservation.
    for (const id of referenced) {
      releasePhotoId(id);
    }
    const rows = await this.listLayerPhotoRecords(layerId);
    const orphans = rows.filter(
      (row) => !referenced.has(row.id) && !isPhotoIdReserved(row.id),
    );
    if (orphans.length === 0) {
      return;
    }
    const tx = this.db.transaction([PHOTOS, BLOBS], "readwrite");
    for (const row of orphans) {
      tx.objectStore(PHOTOS).delete(row.id);
      tx.objectStore(BLOBS).delete(photoFullBlobKey(row.id));
      tx.objectStore(BLOBS).delete(photoThumbBlobKey(row.id));
    }
    await transactionDone(tx);
  }

  close(): void {
    this.db.close();
  }
}
