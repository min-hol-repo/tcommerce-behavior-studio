import type { DemoEvent } from "../shared/contracts.ts";
import type { BatchResult } from "./api.ts";

const databaseName = "tcommerce-behavior-demo";
const storeName = "event-outbox";

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(storeName, { keyPath: "eventId" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function transaction<T>(mode: IDBTransactionMode, callback: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, mode);
    const request = callback(tx.objectStore(storeName));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    tx.oncomplete = () => db.close();
    tx.onerror = () => reject(tx.error);
  });
}

export const outbox = {
  put: (event: DemoEvent) => transaction("readwrite", (store) => store.put(event)),
  list: () => transaction<DemoEvent[]>("readonly", (store) => store.getAll()),
  count: () => transaction<number>("readonly", (store) => store.count()),
  remove: (eventId: string) => transaction("readwrite", (store) => store.delete(eventId)),
  async settle(results: BatchResult[]): Promise<void> {
    for (const result of results) {
      if (["stored", "duplicate", "invalid", "conflict"].includes(result.status)) await transaction("readwrite", (store) => store.delete(result.eventId));
    }
  },
};
