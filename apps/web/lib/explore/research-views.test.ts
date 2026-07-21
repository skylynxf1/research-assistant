import { describe, expect, it } from "vitest";
import type { Manifest } from "../manifest";
import type { PaperAnalysis } from "./analysis";
import { addEdge, addNode, emptyGraph } from "./graph";
import { buildConstellation, buildFigureTimeline, buildLineage, buildPaperTimeline, paperYear } from "./research-views";

const analysis = (id: string, arxivId: string | null, title: string): PaperAnalysis => ({
  manifest: {
    doc_id: `sha256:${id}`,
    title,
    source: { type: arxivId ? "arxiv" : "upload", arxiv_id: arxivId },
    page_count: 1, pages: [], sections: [], references: [],
    assets: [{ asset_id: `fig-${id[0]}`, kind: "figure", label: "Figure 1", number: "1", page: 0, bbox: [0, 0, 1, 1], caption: "Original figure", caption_bbox: null, image_url: `/blob/${id}/fig.png`, image_width: 800, parent_id: null }],
    extraction: { version: "1", figure_backend: "test", warnings: [] },
  } as unknown as Manifest,
  reverseIndex: new Map(), mentionsByPage: [[]], citationsByPage: [[]], pageItems: [[]],
});

describe("research view models", () => {
  const first = analysis("a".repeat(64), "1706.03762v7", "Older");
  const second = analysis("b".repeat(64), "2101.00001", "Newer");
  const unknown = analysis("c".repeat(64), null, "Unknown date");

  it("derives only explicit arXiv chronology and keeps unknown dates unknown", () => {
    expect(paperYear(first.manifest)).toBe(2017);
    expect(paperYear(unknown.manifest)).toBeNull();
    expect(buildPaperTimeline([unknown, second, first]).map(({ title }) => title)).toEqual(["Older", "Newer", "Unknown date"]);
  });

  it("uses original manifest assets in figure chronology", () => {
    const figures = buildFigureTimeline([second, first]);
    expect(figures.map(({ year }) => year)).toEqual([2017, 2021]);
    expect(figures[0].asset.image_url).toContain("/blob/");
  });

  it("builds lineage only from user-selected paper nodes and preserves edge semantics", () => {
    let graph = emptyGraph();
    for (const [id, paperId] of [["one", "a".repeat(64)], ["two", "b".repeat(64)], ["three", "c".repeat(64)]]) {
      graph = addNode(graph, { id, type: "paper", label: id, metadata: { paperId, loaded: true } });
    }
    graph = addEdge(graph, { source: "one", target: "two", type: "cites" });
    graph = addEdge(graph, { source: "two", target: "three", type: "generated-related", generated: true });
    const lineage = buildLineage(graph, new Set(["a".repeat(64), "b".repeat(64)]));
    expect(lineage.nodes.map(({ id }) => id)).toEqual(["one", "two"]);
    expect(lineage.edges).toEqual([{ source: "one", target: "two", type: "cites" }]);
  });

  it("uses a fixed declared constellation radius rather than implied importance", () => {
    let graph = emptyGraph();
    graph = addNode(graph, { id: "one", type: "paper", label: "One", metadata: { paperId: "a".repeat(64) } });
    graph = addNode(graph, { id: "two", type: "paper", label: "Two", metadata: { paperId: "b".repeat(64) } });
    graph = addEdge(graph, { source: "one", target: "two", type: "cites" });
    expect(buildConstellation(graph, new Set(["a".repeat(64), "b".repeat(64)]), "vision").nodes.map(({ radius, clusterId }) => ({ radius, clusterId }))).toEqual([
      { radius: 9, clusterId: "vision" }, { radius: 9, clusterId: "vision" },
    ]);
  });
});
