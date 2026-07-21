/**
 * The shared research graph (expansion doc §16).
 *
 * One graph model backs the citation graph, lineage, timeline and constellation views,
 * so that each visualization does not invent its own data shape.
 *
 * The rule these tests exist to enforce is §16's "critical" note: a literal citation, an
 * inferred relationship and a user-drawn line must never be indistinguishable. Encoding
 * edge type and the generated flag is what keeps a suggestion from being read as a fact.
 */

import { describe, expect, it } from "vitest";
import { addEdge, addNode, edgesOf, emptyGraph, neighbors, type ResearchGraphNode } from "./graph";

const paper = (id: string): ResearchGraphNode => ({
  id,
  type: "paper",
  label: `Paper ${id}`,
  metadata: {},
});

describe("nodes", () => {
  it("starts empty", () => {
    expect(emptyGraph()).toEqual({ nodes: [], edges: [] });
  });

  it("adds a node", () => {
    expect(addNode(emptyGraph(), paper("a")).nodes).toHaveLength(1);
  });

  it("does not duplicate a node already present", () => {
    // Exploring the graph revisits papers constantly; re-adding must be a no-op.
    const graph = addNode(addNode(emptyGraph(), paper("a")), paper("a"));
    expect(graph.nodes).toHaveLength(1);
  });

  it("does not mutate the graph it was given", () => {
    const before = emptyGraph();
    addNode(before, paper("a"));
    expect(before.nodes).toHaveLength(0);
  });
});

describe("edges", () => {
  const twoPapers = addNode(addNode(emptyGraph(), paper("a")), paper("b"));

  it("connects two existing nodes", () => {
    const graph = addEdge(twoPapers, { source: "a", target: "b", type: "cites" });
    expect(graph.edges).toEqual([{ source: "a", target: "b", type: "cites" }]);
  });

  it("refuses an edge with a missing endpoint", () => {
    // Precision over recall (§1.3): a dangling edge renders as a line to nowhere, which
    // reads as a claim the data does not support.
    const graph = addEdge(twoPapers, { source: "a", target: "ghost", type: "cites" });
    expect(graph.edges).toHaveLength(0);
  });

  it("does not duplicate the same relationship", () => {
    const once = addEdge(twoPapers, { source: "a", target: "b", type: "cites" });
    expect(addEdge(once, { source: "a", target: "b", type: "cites" }).edges).toHaveLength(1);
  });

  it("keeps two different relationships between the same pair", () => {
    // A cites B and a user also drew a line between them: both are true and distinct.
    const graph = addEdge(addEdge(twoPapers, { source: "a", target: "b", type: "cites" }), {
      source: "a",
      target: "b",
      type: "user-connected",
    });
    expect(graph.edges).toHaveLength(2);
  });

  it("preserves the generated flag", () => {
    const graph = addEdge(twoPapers, {
      source: "a",
      target: "b",
      type: "generated-related",
      generated: true,
    });
    expect(graph.edges[0].generated).toBe(true);
  });

  it("treats a literal edge and a generated edge as different relationships", () => {
    // If these collapsed into one, a suggestion would be rendered as a citation.
    const graph = addEdge(addEdge(twoPapers, { source: "a", target: "b", type: "cites" }), {
      source: "a",
      target: "b",
      type: "generated-related",
      generated: true,
    });
    expect(graph.edges.map((e) => e.type)).toEqual(["cites", "generated-related"]);
  });
});

describe("traversal", () => {
  const graph = addEdge(
    addEdge(addNode(addNode(addNode(emptyGraph(), paper("a")), paper("b")), paper("c")), {
      source: "a",
      target: "b",
      type: "cites",
    }),
    { source: "c", target: "a", type: "cites" },
  );

  it("finds edges touching a node in either direction", () => {
    expect(edgesOf(graph, "a")).toHaveLength(2);
  });

  it("finds neighbours in either direction", () => {
    expect(neighbors(graph, "a").map((n) => n.id).sort()).toEqual(["b", "c"]);
  });

  it("returns nothing for an unknown node", () => {
    expect(neighbors(graph, "ghost")).toEqual([]);
  });
});
