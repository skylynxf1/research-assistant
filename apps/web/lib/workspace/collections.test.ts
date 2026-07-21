import { describe, expect, it } from "vitest";
import type { PaperRef, SourceEvidence } from "../evidence/source";
import {
  addNoteToCollection,
  addPaperToCollection,
  createCollection,
  partitionCollectionPapers,
  renameCollection,
} from "./collections";

const paper = (paperId: string): PaperRef => ({
  paperId,
  title: `Paper ${paperId}`,
  arxivId: null,
});

describe("collection mutations", () => {
  it("creates a versioned empty collection", () => {
    expect(createCollection("Vision", { id: "collection-1", now: 100 })).toEqual({
      version: 2,
      id: "collection-1",
      name: "Vision",
      createdAt: 100,
      updatedAt: 100,
      papers: [],
      pinnedEvidence: [],
      notes: [],
      comparisons: [],
      boardNodes: [],
      boardEdges: [],
    });
  });

  it("adds a paper once and leaves the input unchanged", () => {
    const before = createCollection("Vision", { id: "collection-1", now: 100 });
    const once = addPaperToCollection(before, paper("a"), 200);
    const twice = addPaperToCollection(once, paper("a"), 300);

    expect(before.papers).toEqual([]);
    expect(twice.papers).toEqual([paper("a")]);
    expect(twice.updatedAt).toBe(200);
  });

  it("renames without mutating the source collection", () => {
    const before = createCollection("Old", { id: "collection-1", now: 100 });
    const after = renameCollection(before, "  New name  ", 200);
    expect(before.name).toBe("Old");
    expect(after.name).toBe("New name");
    expect(after.updatedAt).toBe(200);
  });

  it("attaches notes to source evidence", () => {
    const source: SourceEvidence = {
      paperId: "a",
      page: 2,
      kind: "figure",
      assetId: "fig-1",
    };
    const before = createCollection("Vision", { id: "collection-1", now: 100 });
    const after = addNoteToCollection(before, "Key result", source, {
      id: "note-1",
      now: 200,
    });

    expect(after.notes).toEqual([
      { id: "note-1", text: "Key result", source, createdAt: 200 },
    ]);
  });

  it("retains missing paper references while identifying available papers", () => {
    const collection = {
      ...createCollection("Vision", { id: "collection-1", now: 100 }),
      papers: [paper("cached"), paper("deleted")],
    };

    expect(partitionCollectionPapers(collection, new Set(["cached"]))).toEqual({
      available: [paper("cached")],
      missing: [paper("deleted")],
    });
    expect(collection.papers).toHaveLength(2);
  });
});
