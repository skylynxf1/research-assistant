import type { ResearchCollection, WorkspaceRepository } from "./types";
import { normalizeCollection } from "./collections";

const DATABASE_NAME = "marginalia-workspaces";
const DATABASE_VERSION = 1;
const COLLECTIONS_STORE = "collections";

interface DatabaseFactory {
  open(name: string, version?: number): IDBOpenDBRequest;
}

interface RepositoryOptions {
  databaseName?: string;
  factory?: DatabaseFactory;
}

export class IndexedDbWorkspaceRepository implements WorkspaceRepository {
  private readonly databaseName: string;
  private readonly factory: DatabaseFactory;
  private databasePromise?: Promise<IDBDatabase>;

  constructor(options: RepositoryOptions = {}) {
    this.databaseName = options.databaseName ?? DATABASE_NAME;
    this.factory = options.factory ?? globalThis.indexedDB;
  }

  private database(): Promise<IDBDatabase> {
    if (this.databasePromise) return this.databasePromise;

    const pending = new Promise<IDBDatabase>((resolve, reject) => {
      const request = this.factory.open(this.databaseName, DATABASE_VERSION);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(COLLECTIONS_STORE)) {
          request.result.createObjectStore(COLLECTIONS_STORE, { keyPath: "id" });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error("Could not open IndexedDB"));
      request.onblocked = () => reject(new Error("IndexedDB upgrade was blocked"));
    });
    const retryable = pending.catch((error) => {
      this.databasePromise = undefined;
      throw error;
    });
    this.databasePromise = retryable;
    return retryable;
  }

  private async request<T>(
    mode: IDBTransactionMode,
    operation: (store: IDBObjectStore) => IDBRequest<T>,
  ): Promise<T> {
    const database = await this.database();
    return new Promise<T>((resolve, reject) => {
      const transaction = database.transaction(COLLECTIONS_STORE, mode);
      const request = operation(transaction.objectStore(COLLECTIONS_STORE));
      let value: T;
      request.onsuccess = () => {
        value = request.result;
      };
      request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed"));
      transaction.oncomplete = () => resolve(value);
      transaction.onerror = () =>
        reject(transaction.error ?? new Error("IndexedDB transaction failed"));
      transaction.onabort = () =>
        reject(transaction.error ?? new Error("IndexedDB transaction was aborted"));
    });
  }

  async listCollections(): Promise<ResearchCollection[]> {
    const collections = await this.request<ResearchCollection[]>("readonly", (store) =>
      store.getAll(),
    );
    return collections.map(normalizeCollection).sort((a, b) => b.updatedAt - a.updatedAt);
  }

  async getCollection(id: string): Promise<ResearchCollection | null> {
    const collection = await this.request<ResearchCollection | undefined>(
      "readonly",
      (store) => store.get(id),
    );
    return collection ? normalizeCollection(collection) : null;
  }

  async saveCollection(collection: ResearchCollection): Promise<ResearchCollection> {
    const normalized = normalizeCollection(collection);
    await this.request<IDBValidKey>("readwrite", (store) => store.put(normalized));
    return normalized;
  }

  async deleteCollection(id: string): Promise<void> {
    await this.request<undefined>("readwrite", (store) => store.delete(id));
  }
}
