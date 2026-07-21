import { describe, expect, it } from "vitest";
import { createCollection } from "./collections";
import {
  addBoardNode,
  addPinnedEvidence,
  connectBoardNodes,
  moveBoardNode,
  removeBoardNode,
  saveComparison,
} from "./board";

const source = (assetId: string) => ({
  paperId: "paper-a",
  page: 2,
  kind: "figure" as const,
  assetId,
});

describe("pinboard mutations", () => {
  it("adds and moves a source-referenced node immutably", () => {
    const empty = createCollection("Board", { id: "board", now: 1 });
    const added = addBoardNode(empty, { id: "node-a", source: source("fig-1"), x: 20, y: 30 }, 2);
    const moved = moveBoardNode(added, "node-a", { x: 80, y: 90 }, 3);
    expect(empty.boardNodes).toEqual([]);
    expect(moved.boardNodes[0]).toMatchObject({ x: 80, y: 90, source: source("fig-1") });
  });

  it("creates only explicit user connections between existing distinct nodes", () => {
    let collection = createCollection("Board", { id: "board", now: 1 });
    collection = addBoardNode(collection, { id: "a", x: 0, y: 0 }, 2);
    collection = addBoardNode(collection, { id: "b", x: 10, y: 10 }, 3);
    const connected = connectBoardNodes(collection, "a", "b", { id: "edge-1", now: 4 });
    expect(connected.boardEdges).toEqual([
      { id: "edge-1", sourceNodeId: "a", targetNodeId: "b", type: "user-connected" },
    ]);
    expect(connectBoardNodes(connected, "a", "ghost", { id: "bad", now: 5 })).toBe(connected);
    expect(connectBoardNodes(connected, "a", "a", { id: "self", now: 5 })).toBe(connected);
  });

  it("removes dangling edges with a deleted node", () => {
    let collection = createCollection("Board", { id: "board", now: 1 });
    collection = addBoardNode(collection, { id: "a", x: 0, y: 0 }, 2);
    collection = addBoardNode(collection, { id: "b", x: 10, y: 10 }, 3);
    collection = connectBoardNodes(collection, "a", "b", { id: "edge-1", now: 4 });
    const removed = removeBoardNode(collection, "a", 5);
    expect(removed.boardNodes.map(({ id }) => id)).toEqual(["b"]);
    expect(removed.boardEdges).toEqual([]);
  });

  it("deduplicates pinned evidence by source identity", () => {
    const empty = createCollection("Board", { id: "board", now: 1 });
    const once = addPinnedEvidence(empty, source("fig-1"), 2);
    const twice = addPinnedEvidence(once, source("fig-1"), 3);
    expect(twice).toBe(once);
  });

  it("saves only comparisons with at least two distinct evidence pointers", () => {
    const empty = createCollection("Board", { id: "board", now: 1 });
    expect(saveComparison(empty, [source("fig-1")], { id: "one", now: 2 })).toBe(empty);
    const saved = saveComparison(empty, [source("fig-1"), source("fig-2")], {
      id: "comparison-1",
      now: 3,
    });
    expect(saved.comparisons[0]).toEqual({
      id: "comparison-1",
      evidence: [source("fig-1"), source("fig-2")],
      createdAt: 3,
    });
  });
});
