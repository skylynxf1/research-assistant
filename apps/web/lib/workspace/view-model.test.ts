import { describe, expect, it } from "vitest";
import { createCollection } from "./collections";
import { collectionRows, collectionHasPaper } from "./view-model";

const paper = (paperId: string, title = paperId) => ({ paperId, title, arxivId: null });

describe("workspace view model", () => {
  it("orders collection rows by most recent activity", () => {
    const old = createCollection("Old", { id: "old", now: 100 });
    const recent = createCollection("Recent", { id: "recent", now: 200 });
    expect(collectionRows([old, recent], new Set()).map(({ collection }) => collection.id)).toEqual([
      "recent",
      "old",
    ]);
  });

  it("marks retained paper references unavailable without dropping them", () => {
    const collection = {
      ...createCollection("Papers", { id: "papers", now: 100 }),
      papers: [paper("cached"), paper("missing", "Still named")],
    };

    const [row] = collectionRows([collection], new Set(["cached"]));
    expect(row.papers).toEqual([
      { paper: paper("cached"), available: true },
      { paper: paper("missing", "Still named"), available: false },
    ]);
  });

  it("reports candidate membership by stable paper id", () => {
    const collection = {
      ...createCollection("Papers", { id: "papers", now: 100 }),
      papers: [paper("candidate")],
    };
    expect(collectionHasPaper(collection, "candidate")).toBe(true);
    expect(collectionHasPaper(collection, "other")).toBe(false);
  });
});
