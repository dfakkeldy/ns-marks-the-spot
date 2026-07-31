import { UserMapImportError } from "../errors";
import type { UserMapRecord } from "../types";
import {
  BLOBS,
  MAPS,
  fromStoredBlob,
  isQuotaError,
  openUserContentDatabase,
  request,
  toStoredBlob,
  transactionDone,
  type StoredBlob,
} from "./database";

// Re-exported because tests and callers historically imported it from here;
// the implementation moved to database.ts when the vector store arrived.
export { transactionDone };

/**
 * Raster-map store over the shared user-content database (see database.ts for
 * the schema). Blobs are keyed `${id}:raster` / `${id}:preview`.
 */
export class UserMapStore {
  private constructor(private readonly db: IDBDatabase) {}

  static async open(factory: IDBFactory = indexedDB): Promise<UserMapStore> {
    return new UserMapStore(await openUserContentDatabase(factory));
  }

  async saveUserMap(
    record: UserMapRecord,
    raster: Blob,
    preview: Blob,
  ): Promise<void> {
    // Convert before opening the transaction: arrayBuffer() is async, and an
    // IndexedDB transaction auto-commits once it goes a tick without a new
    // request, so any awaited work must happen before transaction() is called.
    const storedRaster = await toStoredBlob(raster);
    const storedPreview = await toStoredBlob(preview);
    const tx = this.db.transaction([MAPS, BLOBS], "readwrite");
    try {
      // The put() calls themselves — not just the awaited completion — are
      // inside this try. Some engines (notably Safari's IndexedDB) can throw
      // QuotaExceededError synchronously from put()/add() rather than
      // surfacing it asynchronously via the transaction's abort event; if
      // these calls sat outside the try block, that throw would escape as a
      // raw DOMException instead of the documented UserMapImportError.
      tx.objectStore(MAPS).put(record);
      tx.objectStore(BLOBS).put(storedRaster, `${record.id}:raster`);
      tx.objectStore(BLOBS).put(storedPreview, `${record.id}:preview`);
      await transactionDone(tx);
    } catch (error) {
      if (isQuotaError(error)) {
        throw new UserMapImportError(
          "quota",
          "Storage is full — this map stays available until you close the tab.",
        );
      }
      throw new UserMapImportError(
        "storage-failed",
        "Couldn't save this map — it stays available until you close the tab.",
      );
    }
  }

  /**
   * Metadata-only UPDATE — never a create. Saving GCPs must not rewrite the
   * raster and preview blobs: during a georeferencing session this runs every
   * time the user finishes a drag, and re-storing tens of megabytes each time
   * would stall the main thread and burn through the origin's quota.
   *
   * Guarded rather than a blind `put`, because `put` is an upsert and both
   * callers (`saveGcps`, from a 400 ms debounce timer, and `setGeorefMethod`)
   * fire after the user has already moved on. Open the same map in two tabs,
   * drag a point in tab A, delete the map in tab B, and tab A's timer then
   * recreates the metadata row for a map whose blobs tab B already removed.
   * That orphan survives every reload — `listUserMaps()` returns it while
   * `getPreviewBlob`/`getRasterBlob` return null forever — so it can never be
   * RENDERED: `visibleMaps` filters on a preview URL it will never have.
   *
   * It is NOT, however, permanent, and it is NOT inert. `UserMapRows` renders
   * a `Remove` button for every record, so the user can delete it. And that
   * component disables the layer checkbox only when `needsGeoreferencing`
   * refuses the points — which the points being actively dragged normally pass
   * — so the row toggles ON, reports itself enabled, and silently draws
   * nothing. `discardPendingWrite` cannot prevent any of it: it clears the
   * *deleting* tab's hook-local timer, and the writing tab is a different
   * JavaScript realm.
   *
   * The get and the put share ONE readwrite transaction. Two IndexedDB
   * connections serialize their readwrite transactions per object store, so a
   * get-then-put inside a single transaction is atomic against the other tab's
   * delete; the same check split across two transactions would merely narrow
   * the race window rather than close it.
   *
   * The put is issued from inside the get request's `onsuccess` handler, not
   * after `await request(...)`. A transaction auto-commits once it goes a tick
   * without a new request (the same hazard documented on `saveUserMap`), so
   * the awaited form bets on the continuation microtask beating the
   * auto-commit. Measured against fake-indexeddb 6.2.5: the awaited form does
   * happen to work there, and the same probe's control — a `setTimeout(0)`
   * before the put — throws `TransactionInactiveError`, proving the check can
   * detect inactivity. But one engine agreeing is not evidence that Safari or
   * Firefox schedule it the same way. Queuing the second request from the
   * first request's success handler needs no such assumption: the transaction
   * is unambiguously still active while its own request's handler runs.
   */
  async putUserMapRecord(record: UserMapRecord): Promise<void> {
    const tx = this.db.transaction(MAPS, "readwrite");
    const maps = tx.objectStore(MAPS);
    const existing = maps.get(record.id) as IDBRequest<UserMapRecord | undefined>;
    existing.onsuccess = () => {
      // Absent row = another tab deleted this map. Skipping leaves the
      // transaction with nothing more to do, so it commits as a no-op.
      if (existing.result !== undefined) {
        maps.put(record);
      }
    };
    // No `onerror` here on purpose: an unhandled request error aborts the
    // transaction, and transactionDone surfaces the real DOMException from
    // the abort event — which is what keeps saveGcps' catch meaningful.
    await transactionDone(tx);
  }

  async listUserMaps(): Promise<UserMapRecord[]> {
    const tx = this.db.transaction(MAPS, "readonly");
    const all = await request(
      tx.objectStore(MAPS).getAll() as IDBRequest<UserMapRecord[]>,
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

  getPreviewBlob(id: string): Promise<Blob | null> {
    return this.getBlob(`${id}:preview`);
  }

  getRasterBlob(id: string): Promise<Blob | null> {
    return this.getBlob(`${id}:raster`);
  }

  async deleteUserMap(id: string): Promise<void> {
    const tx = this.db.transaction([MAPS, BLOBS], "readwrite");
    tx.objectStore(MAPS).delete(id);
    tx.objectStore(BLOBS).delete(`${id}:raster`);
    tx.objectStore(BLOBS).delete(`${id}:preview`);
    await transactionDone(tx);
  }

  close(): void {
    this.db.close();
  }
}
