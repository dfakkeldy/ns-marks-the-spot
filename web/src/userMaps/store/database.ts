export const DB_NAME = "ns-marks-the-spot-user-maps";
export const MAPS = "maps";
export const BLOBS = "blobs";
export const VECTORS = "vectors";
export const PHOTOS = "photos";
export const PHOTOS_BY_LAYER_INDEX = "by-layer";

/**
 * Version 2 added the `vectors` store; version 3 added `photos`. Every
 * consumer of this database MUST open it through `openUserContentDatabase` —
 * a second open path with its own version constant would throw VersionError
 * the moment the constants diverge, taking the whole "Your maps" /
 * "Your data" UI down with it.
 */
export const DB_VERSION = 3;

/**
 * One schema owner for the shared user-content database:
 * - `maps` holds small raster-map metadata records (listed on every load),
 * - `vectors` holds small vector-layer metadata records,
 * - `photos` holds small photo metadata records, indexed by owning layer id,
 * - `blobs` holds the heavy payloads out-of-line (`${id}:raster`,
 *   `${id}:preview`, `${id}:vector`, `${id}:vector-original`,
 *   `${photoId}:photo`, `${photoId}:photo-thumb`) so listing never
 *   deserializes megabytes of data.
 *
 * Upgrade guards are additive (`if (!contains) create`) so any older version
 * reaches the current schema without touching existing rows.
 */
export function openUserContentDatabase(
  factory: IDBFactory = indexedDB,
): Promise<IDBDatabase> {
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
      if (!db.objectStoreNames.contains(VECTORS)) {
        db.createObjectStore(VECTORS, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(PHOTOS)) {
        const photos = db.createObjectStore(PHOTOS, { keyPath: "id" });
        photos.createIndex(PHOTOS_BY_LAYER_INDEX, "layerId");
      }
    };
    openRequest.onsuccess = () => {
      const db = openRequest.result;
      // If another tab upgrades the schema, release our handle.
      db.onversionchange = () => db.close();
      resolve(db);
    };
    openRequest.onerror = () => reject(openRequest.error);
    openRequest.onblocked = () =>
      reject(new Error("user-content database blocked by another tab"));
  });
}

export function request<T>(req: IDBRequest<T>): Promise<T> {
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

export function isQuotaError(error: unknown): boolean {
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
export type StoredBlob = { data: ArrayBuffer; type: string };

export async function toStoredBlob(blob: Blob): Promise<StoredBlob> {
  return { data: await blob.arrayBuffer(), type: blob.type };
}

export function fromStoredBlob(stored: StoredBlob): Blob {
  return new Blob([stored.data], { type: stored.type });
}
