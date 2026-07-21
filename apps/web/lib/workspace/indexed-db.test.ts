import { IDBFactory } from "fake-indexeddb";
import { describe, expect, it } from "vitest";
import { createCollection } from "./collections";
import { IndexedDbWorkspaceRepository } from "./indexed-db";

const repository = () =>
  new IndexedDbWorkspaceRepository({
    databaseName: `marginalia-test-${crypto.randomUUID()}`,
    factory: new IDBFactory(),
  });

describe("IndexedDbWorkspaceRepository", () => {
  it("round-trips pinned source evidence exactly", async () => {
    const repo = repository();
    const source = {
      paperId: "paper-a",
      page: 3,
      kind: "table" as const,
      assetId: "table-2",
      bbox: [0.1, 0.2, 0.8, 0.6] as [number, number, number, number],
      text: "Table 2: Results",
    };
    const collection = {
      ...createCollection("Results", { id: "results", now: 100 }),
      pinnedEvidence: [source],
    };

    await repo.saveCollection(collection);

    expect(await repo.getCollection("results")).toEqual(collection);
  });

  it("lists the most recently updated collection first", async () => {
    const repo = repository();
    await repo.saveCollection(createCollection("Older", { id: "old", now: 100 }));
    await repo.saveCollection(createCollection("Newer", { id: "new", now: 200 }));

    expect((await repo.listCollections()).map(({ id }) => id)).toEqual(["new", "old"]);
  });

  it("upserts and deletes only the requested collection", async () => {
    const repo = repository();
    await repo.saveCollection(createCollection("First", { id: "one", now: 100 }));
    await repo.saveCollection(createCollection("Second", { id: "two", now: 200 }));
    await repo.saveCollection({
      ...createCollection("Renamed", { id: "one", now: 100 }),
      updatedAt: 300,
    });

    await repo.deleteCollection("two");

    expect((await repo.getCollection("one"))?.name).toBe("Renamed");
    expect(await repo.getCollection("two")).toBeNull();
  });

  it("surfaces IndexedDB errors instead of falling back to another store", async () => {
    const repo = new IndexedDbWorkspaceRepository({
      databaseName: "broken",
      factory: {
        open() {
          throw new Error("IndexedDB unavailable");
        },
      },
    });

    await expect(repo.listCollections()).rejects.toThrow("IndexedDB unavailable");
  });

  it("migrates a version-1 collection without losing source references", async () => {
    const repo = repository();
    const legacy = {
      ...createCollection("Legacy", { id: "legacy", now: 100 }),
      version: 1,
      pinnedEvidence: [{ paperId: "p", page: 1, kind: "figure" as const, assetId: "fig-1" }],
    };
    delete (legacy as { boardEdges?: unknown }).boardEdges;
    await repo.saveCollection(legacy as unknown as ReturnType<typeof createCollection>);

    expect(await repo.getCollection("legacy")).toMatchObject({
      version: 2,
      boardEdges: [],
      pinnedEvidence: [{ paperId: "p", page: 1, kind: "figure", assetId: "fig-1" }],
    });
  });
});
