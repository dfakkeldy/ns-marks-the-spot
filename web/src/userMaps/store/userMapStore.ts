import { UserMapImportError } from "../errors";
import type { UserMapRecord } from "../types";

const DB_NAME = "ns-marks-the-spot-user-maps";
const DB_VERSION = 1;
const MAPS = "maps";
const BLOBS = "blobs";

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/**
 * Resolves on `complete`, rejects on `abort`.
 *
 * Deliberately does NOT reject from the transaction's `error` event. Per the
 * IndexedDB spec (confirmed empirically against fake-indexeddb 6.2.5), when a
 * request fails and its error is left unhandled, the "error" event bubbles
 * from the request to the transaction *before* `tx.error` is populated —
 * `tx.error` is only set once the platform actually aborts the transaction,
 * which fires a separate `abort` event afterward. Rejecting from `onerror`
 * therefore captures `tx.error` while it's still `null`, and because a
 * Promise settles on its first resolve/reject call, the later `onabort` (with
 * the real DOMException) never gets to supply the rejection reason. That
 * silently broke `isQuotaError()` for every failure, not just quota ones —
 * every save error would classify as `"storage-failed"`, never `"quota"`.
 * Waiting for `onabort` avoids the race and gets the real error.
 *
 * Exported (only) so the test suite can pin this ordering directly against a
 * minimal fake transaction, without needing a real engine to reproduce the
 * exact event sequence that caused the bug.
 */
export function transactionDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error ?? new Error("transaction aborted"));
  });
}

function isQuotaError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "QuotaExceededError";
}

/**
 * Blobs are stored as raw bytes + MIME type rather than as `Blob` objects
 * directly, for two independent reasons found while testing this store:
 *
 * 1. Under jsdom (this project's Vitest environment), `Blob` is jsdom's own
 *    implementation, not Node's built-in one. fake-indexeddb clones values
 *    with Node's global `structuredClone()`, which only special-cases the
 *    Blob class it recognizes — handed jsdom's Blob, it silently clones it
 *    into an empty `{}` with no bytes and no `.text()` method. Storing a
 *    plain `Blob` would make retrieval come back unusable in every test.
 * 2. Independent of testing, Safari's IndexedDB has a long history of bugs
 *    storing `Blob` values directly (silent corruption / failed reads on
 *    large blobs pre-Safari 14). Storing an ArrayBuffer + MIME type sidesteps
 *    that engine-specific risk entirely, in production as well as in tests.
 *
 * `ArrayBuffer` clones correctly everywhere (jsdom, Node, every real
 * browser), so this keeps the public API returning real, working `Blob`s
 * without depending on the host's Blob-cloning support.
 */
type StoredBlob = { data: ArrayBuffer; type: string };

async function toStoredBlob(blob: Blob): Promise<StoredBlob> {
  return { data: await blob.arrayBuffer(), type: blob.type };
}

function fromStoredBlob(stored: StoredBlob): Blob {
  return new Blob([stored.data], { type: stored.type });
}

/**
 * Two stores: `maps` holds small metadata records (listed on every load),
 * `blobs` holds the heavy binaries keyed `${id}:raster` / `${id}:preview` so
 * listing never deserializes megabytes of image data.
 */
export class UserMapStore {
  private constructor(private readonly db: IDBDatabase) {}

  static open(factory: IDBFactory = indexedDB): Promise<UserMapStore> {
    return new Promise((resolve, reject) => {
      const openRequest = factory.open(DB_NAME, DB_VERSION);
      openRequest.onupgradeneeded = () => {
        const db = openRequest.result;
        if (!db.objectStoreNames.contains(MAPS)) {
          db.createObjectStore(MAPS, { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains(BLOBS)) {
          db.createObjectStore(BLOBS);
        }
      };
      openRequest.onsuccess = () => {
        const db = openRequest.result;
        // If another tab upgrades the schema, release our handle.
        db.onversionchange = () => db.close();
        resolve(new UserMapStore(db));
      };
      openRequest.onerror = () => reject(openRequest.error);
      openRequest.onblocked = () =>
        reject(new Error("user-map database blocked by another tab"));
    });
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
   * Guarded rather than a blind `put`, because `put` is an upsert and this
   * method's one caller (`saveGcps`) fires from a 400 ms debounce timer. Open
   * the same map in two tabs, drag a point in tab A, delete the map in tab B,
   * and tab A's timer then recreates the metadata row for a map whose blobs
   * tab B already removed. That orphan is permanent: `listUserMaps()` returns
   * it on every subsequent load, while `getPreviewBlob`/`getRasterBlob` return
   * null forever, so the layer row can never be enabled or rendered.
   * `discardPendingWrite` cannot prevent it — it clears the *deleting* tab's
   * hook-local timer, and the writing tab is a different JavaScript realm.
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
