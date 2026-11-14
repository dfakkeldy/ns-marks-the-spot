import { openUserContentDatabase, request, transactionDone, USER_LAYERS } from "../../userMaps/store/database";
import type { UserLayerRecord } from "../types";

export class UserLayerStore {
  private constructor(private readonly db: IDBDatabase) {}
  static async open(factory: IDBFactory = indexedDB): Promise<UserLayerStore> {
    return new UserLayerStore(await openUserContentDatabase(factory));
  }
  list(): Promise<UserLayerRecord[]> {
    return request(this.db.transaction(USER_LAYERS).objectStore(USER_LAYERS).getAll());
  }
  async put(record: UserLayerRecord): Promise<void> {
    const tx = this.db.transaction(USER_LAYERS, "readwrite");
    tx.objectStore(USER_LAYERS).put(record);
    await transactionDone(tx);
  }
  async delete(id: string): Promise<void> {
    const tx = this.db.transaction(USER_LAYERS, "readwrite");
    tx.objectStore(USER_LAYERS).delete(id);
    await transactionDone(tx);
  }
  close(): void { this.db.close(); }
}
