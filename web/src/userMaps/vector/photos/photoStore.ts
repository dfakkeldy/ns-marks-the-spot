import { UserMapImportError } from "../../errors";
import {
  BLOBS,
  PHOTOS,
  PHOTOS_BY_LAYER_INDEX,
  fromStoredBlob,
  isQuotaError,
  openUserContentDatabase,
  request,
  toStoredBlob,
  transactionDone,
  type StoredBlob,
} from "../../store/database";
import type { PhotoRecord } from "./types";

export function photoFullBlobKey(photoId: string): string {
  return `${photoId}:photo`;
}

export function photoThumbBlobKey(photoId: string): string {
  return `${photoId}:photo-thumb`;
}

const fullKey = photoFullBlobKey;
const thumbKey = photoThumbBlobKey;

/**
 * Photo rows written ahead of the feature that will reference them. The
 * sweep keeps a reserved id until a write references it, so a debounced
 * layer write carrying an older working copy cannot delete a photo that is
 * still being attached: a collection captured before the row existed saying
 * nothing about it is not evidence the row is an orphan.
 *
 * Module-level because the attach path holds a UserPhotoStore and the sweep
 * runs on a UserVectorStore — two handles onto the one user-content database
 * this tab owns, where a photo id means the same thing to both. The native
 * app keeps the same set on its single store actor: see `reservedPhotoIDs`
 * in ns-marks-the-spot/UserVectors/UserVectorStore.swift.
 */
const reservedPhotoIds = new Set<string>();

/** Taken before the row is written; ended when a write references it. */
export function reservePhotoId(photoId: string): void {
  reservedPhotoIds.add(photoId);
}

/** Given up when the write failed, or when a write has referenced the id. */
export function releasePhotoId(photoId: string): void {
  reservedPhotoIds.delete(photoId);
}

/** True while an attach still owes this row its descriptor. */
export function isPhotoIdReserved(photoId: string): boolean {
  return reservedPhotoIds.has(photoId);
}

/** Test seam: module-level set, cleared between cases. */
export function resetPhotoReservationsForTests(): void {
  reservedPhotoIds.clear();
}

/**
 * Photo store over the shared user-content database: metadata rows in
 * `photos` (indexed by owning layer), bytes out-of-line in `blobs`. No part
 * of this store has a network path — photos never leave this browser except
 * through explicit user-initiated exports. Orphan discipline lives here:
 * removing a layer removes its photos, and the per-commit sweep drops rows
 * no descriptor references any more.
 */
export class UserPhotoStore {
  private constructor(private readonly db: IDBDatabase) {}

  static async open(factory: IDBFactory = indexedDB): Promise<UserPhotoStore> {
    return new UserPhotoStore(await openUserContentDatabase(factory));
  }

  async savePhoto(record: PhotoRecord, full: Blob, thumb: Blob): Promise<void> {
    // Conversions before the transaction: arrayBuffer() is async and an
    // IndexedDB transaction auto-commits once it idles for a tick.
    const storedFull = await toStoredBlob(full);
    const storedThumb = await toStoredBlob(thumb);
    const tx = this.db.transaction([PHOTOS, BLOBS], "readwrite");
    try {
      tx.objectStore(PHOTOS).put(record);
      tx.objectStore(BLOBS).put(storedFull, fullKey(record.id));
      tx.objectStore(BLOBS).put(storedThumb, thumbKey(record.id));
      await transactionDone(tx);
    } catch (error) {
      if (isQuotaError(error)) {
        throw new UserMapImportError(
          "quota",
          "Storage is full — this photo wasn't added.",
        );
      }
      throw new UserMapImportError(
        "storage-failed",
        "Couldn't save this photo — it wasn't added.",
      );
    }
  }

  private async getBlob(key: string): Promise<Blob | null> {
    const tx = this.db.transaction(BLOBS, "readonly");
    const stored = await request(
      tx.objectStore(BLOBS).get(key) as IDBRequest<StoredBlob | undefined>,
    );
    return stored ? fromStoredBlob(stored) : null;
  }

  getThumbBlob(photoId: string): Promise<Blob | null> {
    return this.getBlob(thumbKey(photoId));
  }

  getFullBlob(photoId: string): Promise<Blob | null> {
    return this.getBlob(fullKey(photoId));
  }

  async listLayerPhotos(layerId: string): Promise<PhotoRecord[]> {
    const tx = this.db.transaction(PHOTOS, "readonly");
    return request(
      tx
        .objectStore(PHOTOS)
        .index(PHOTOS_BY_LAYER_INDEX)
        .getAll(layerId) as IDBRequest<PhotoRecord[]>,
    );
  }

  async deletePhoto(photoId: string): Promise<void> {
    const tx = this.db.transaction([PHOTOS, BLOBS], "readwrite");
    tx.objectStore(PHOTOS).delete(photoId);
    tx.objectStore(BLOBS).delete(fullKey(photoId));
    tx.objectStore(BLOBS).delete(thumbKey(photoId));
    await transactionDone(tx);
  }

  async deletePhotosForLayer(layerId: string): Promise<void> {
    const rows = await this.listLayerPhotos(layerId);
    if (rows.length === 0) {
      return;
    }
    const tx = this.db.transaction([PHOTOS, BLOBS], "readwrite");
    for (const row of rows) {
      tx.objectStore(PHOTOS).delete(row.id);
      tx.objectStore(BLOBS).delete(fullKey(row.id));
      tx.objectStore(BLOBS).delete(thumbKey(row.id));
    }
    await transactionDone(tx);
  }

  /**
   * Rows for this layer whose ids are not in the given set are deleted.
   *
   * NOT the sweep the layer write path runs. That is
   * UserVectorStore.sweepLayerPhotos, which derives the referenced set from
   * the collection being written and exempts the attach reservations above.
   * Nothing outside this store's own tests calls this variant, so a guard
   * added here alone would not protect a single photo.
   */
  async sweepLayerPhotos(
    layerId: string,
    referencedIds: ReadonlySet<string>,
  ): Promise<void> {
    const rows = await this.listLayerPhotos(layerId);
    const orphans = rows.filter((row) => !referencedIds.has(row.id));
    if (orphans.length === 0) {
      return;
    }
    const tx = this.db.transaction([PHOTOS, BLOBS], "readwrite");
    for (const row of orphans) {
      tx.objectStore(PHOTOS).delete(row.id);
      tx.objectStore(BLOBS).delete(fullKey(row.id));
      tx.objectStore(BLOBS).delete(thumbKey(row.id));
    }
    await transactionDone(tx);
  }

  close(): void {
    this.db.close();
  }
}
