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

  async renameUserMap(id: string, name: string): Promise<void> {
    const tx = this.db.transaction(MAPS, "readwrite");
    const store = tx.objectStore(MAPS);
    const existing = await request(
      store.get(id) as IDBRequest<UserMapRecord | undefined>,
    );
    if (existing) {
      store.put({ ...existing, name });
    }
    await transactionDone(tx);
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
