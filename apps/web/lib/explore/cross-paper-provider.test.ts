import { describe, expect, it } from "vitest";
import type { Manifest } from "../manifest";
import { createCollection } from "../workspace/collections";
import type { PaperAnalysis } from "./analysis";
import { addPaperToCitationGraph, emptyCitationGraph } from "./citation-graph";
import { IndexedCrossPaperContextProvider } from "./cross-paper-provider";

const makeAnalysis = (paperId: string, title: string, arxivId: string): PaperAnalysis => ({
  manifest: {
    doc_id: `sha256:${paperId}`,
    title,
    source: { type: "arxiv", arxiv_id: arxivId },
    page_count: 1,
    pages: [],
    sections: [{ title: "1 Results", page: 0, level: 1 }],
    assets: [{
      asset_id: "table-1",
      kind: "table",
      label: "Table 1",
      number: "1",
      page: 0,
      bbox: [0.1, 0.3, 0.9, 0.7],
      caption: `${title} ImageNet benchmark results`,
      caption_bbox: [0.1, 0.71, 0.9, 0.74],
      image_url: `/blob/${paperId}/crops/table-1.png`,
      image_width: 800,
      parent_id: null,
    }],
    references: [],
    extraction: { version: "1", figure_backend: "test", warnings: [] },
  } as unknown as Manifest,
  reverseIndex: new Map(),
  mentionsByPage: [[]],
  citationsByPage: [[]],
  pageItems: [[{ str: `${title} evaluates ImageNet.`, hasEOL: true, rect: [0.1, 0.2, 0.9, 0.23] }]],
});

describe("cross-paper context provider", () => {
  const first = makeAnalysis("a".repeat(64), "First paper", "2101.00001");
  const second = makeAnalysis("b".repeat(64), "Second paper", "2101.00002");

  it("returns loaded paper refs by content hash", () => {
    const provider = new IndexedCrossPaperContextProvider([first], [], emptyCitationGraph());
    expect(provider.getPaper("a".repeat(64))).toEqual({
      paperId: "a".repeat(64),
      title: "First paper",
      arxivId: "2101.00001",
    });
    expect(provider.getPaper("missing")).toBeNull();
  });

  it("returns only loaded literal graph neighbours", () => {
    const graph = addPaperToCitationGraph(addPaperToCitationGraph(emptyCitationGraph(), first), second);
    graph.graph.edges.push({ source: "arxiv:2101.00001", target: "arxiv:2101.00002", type: "cites" });
    const provider = new IndexedCrossPaperContextProvider([first, second], [], graph);
    expect(provider.getConnectedPapers("a".repeat(64)).map(({ paperId }) => paperId)).toEqual([
      "b".repeat(64),
    ]);
  });

  it("reads collection paper refs without importing workspace UI", () => {
    const collection = {
      ...createCollection("Vision", { id: "vision", now: 1 }),
      papers: [{ paperId: "stored", title: "Stored paper", arxivId: null }],
    };
    const provider = new IndexedCrossPaperContextProvider([], [collection], emptyCitationGraph());
    expect(provider.getCollectionPapers("vision")).toEqual(collection.papers);
  });

  it("finds bounded source evidence lexically", () => {
    const provider = new IndexedCrossPaperContextProvider([first, second], [], emptyCitationGraph());
    const results = provider.findEvidence({ text: "ImageNet", kinds: ["caption"], limit: 1 });
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ kind: "caption", paperId: "a".repeat(64), assetId: "table-1" });
  });
});
