import type { FeatureCollection } from "geojson";
import { UserMapImportError } from "../../errors";
import {
  BLOBS,
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
  ): Promise<void> {
    const storedGeometry = await toStoredBlob(geometryBlob(collection));
    const tx = this.db.transaction([VECTORS, BLOBS], "readwrite");
    const vectors = tx.objectStore(VECTORS);
    const existing = vectors.get(record.id) as IDBRequest<
      UserVectorLayerRecord | undefined
    >;
    existing.onsuccess = () => {
      // Absent row = another tab deleted this layer. Skipping leaves the
      // transaction with nothing more to do, so it commits as a no-op.
      if (existing.result !== undefined) {
        vectors.put(record);
        tx.objectStore(BLOBS).put(storedGeometry, geometryKey(record.id));
      }
    };
    // No `onerror` on purpose: an unhandled request error aborts the
    // transaction and transactionDone surfaces the real DOMException.
    await transactionDone(tx);
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
    const tx = this.db.transaction([VECTORS, BLOBS], "readwrite");
    tx.objectStore(VECTORS).delete(id);
    tx.objectStore(BLOBS).delete(geometryKey(id));
    tx.objectStore(BLOBS).delete(originalKey(id));
    await transactionDone(tx);
  }

  close(): void {
    this.db.close();
  }
}
