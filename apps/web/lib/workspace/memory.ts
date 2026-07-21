import type { ResearchCollection, WorkspaceRepository } from "./types";
import { normalizeCollection } from "./collections";

/** Non-durable repository for deterministic consumers and tests. Never a persistence fallback. */
export class MemoryWorkspaceRepository implements WorkspaceRepository {
  private readonly collections = new Map<string, ResearchCollection>();

  async listCollections(): Promise<ResearchCollection[]> {
    return [...this.collections.values()]
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .map((collection) => structuredClone(normalizeCollection(collection)));
  }

  async getCollection(id: string): Promise<ResearchCollection | null> {
    const collection = this.collections.get(id);
    return collection ? structuredClone(normalizeCollection(collection)) : null;
  }

  async saveCollection(collection: ResearchCollection): Promise<ResearchCollection> {
    const stored = structuredClone(normalizeCollection(collection));
    this.collections.set(stored.id, stored);
    return structuredClone(stored);
  }

  async deleteCollection(id: string): Promise<void> {
    this.collections.delete(id);
  }
}
