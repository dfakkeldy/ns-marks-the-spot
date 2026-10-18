import { fromStoredBlob, toStoredBlob, type StoredBlob } from "./database";

// Chromium rejected the 135 MiB Judique scan as one serialized IDB value
// (limit 133,169,152 bytes). Separate entries stay below that per-value cap.
const CHUNK_BYTES = 64 * 1024 * 1024;
type ChunkManifest = { chunkCount: number; size: number; type: string };
type PreparedRaster = StoredBlob | { manifest: ChunkManifest; chunks: ArrayBuffer[] };

function chunkRange(key: string): IDBKeyRange {
  // Array keys cannot collide with the existing string-keyed blob records.
  return IDBKeyRange.bound([key, 0], [key, Number.MAX_SAFE_INTEGER]);
}

export async function prepareRasterBlob(blob: Blob): Promise<PreparedRaster> {
  if (blob.size <= CHUNK_BYTES) return toStoredBlob(blob);
  const chunks: ArrayBuffer[] = [];
  for (let offset = 0; offset < blob.size; offset += CHUNK_BYTES) {
    chunks.push(await blob.slice(offset, offset + CHUNK_BYTES).arrayBuffer());
  }
  return { manifest: { chunkCount: chunks.length, size: blob.size, type: blob.type }, chunks };
}

export function putRasterBlob(store: IDBObjectStore, key: string, prepared: PreparedRaster): void {
  // Replacing a large file with a smaller one must not leave old chunks behind.
  store.delete(chunkRange(key));
  if ("manifest" in prepared) {
    store.put(prepared.manifest, key);
    prepared.chunks.forEach((chunk, index) => store.put(chunk, [key, index]));
  } else {
    store.put(prepared, key);
  }
}

export function deleteRasterBlob(store: IDBObjectStore, key: string): void {
  store.delete(key);
  store.delete(chunkRange(key));
}

export function readRasterBlob(store: IDBObjectStore, key: string): Promise<Blob | null> {
  return new Promise((resolve, reject) => {
    const get = store.get(key) as IDBRequest<StoredBlob | ChunkManifest | undefined>;
    get.onerror = () => reject(get.error);
    get.onsuccess = () => {
      const stored = get.result;
      if (!stored) { resolve(null); return; }
      if ("data" in stored) { resolve(fromStoredBlob(stored)); return; }
      // Queue the dependent read inside onsuccess, while the transaction is
      // active. The manifest and chunks must be read as one atomic snapshot.
      const chunks = store.getAll(chunkRange(key)) as IDBRequest<ArrayBuffer[]>;
      chunks.onerror = () => reject(chunks.error);
      chunks.onsuccess = () => {
        if (chunks.result.length !== stored.chunkCount ||
            chunks.result.some((chunk) => Object.prototype.toString.call(chunk) !== "[object ArrayBuffer]") ||
            chunks.result.reduce((size, chunk) => size + chunk.byteLength, 0) !== stored.size) {
          reject(new Error("Stored raster chunks are incomplete"));
          return;
        }
        resolve(new Blob(chunks.result, { type: stored.type }));
      };
    };
  });
}
