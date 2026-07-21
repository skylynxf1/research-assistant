import { describe, expect, it } from "vitest";
import type { Manifest } from "../manifest";
import type { PaperAnalysis } from "./analysis";
import { buildAuthorMethodNetwork } from "./author-method-network";

const analysis: PaperAnalysis = {
  manifest: {
    doc_id: `sha256:${"a".repeat(64)}`,
    title: "Explicit Networks",
    source: { type: "upload", arxiv_id: null },
    page_count: 3, pages: [], assets: [],
    sections: [
      { title: "1 Introduction", page: 0, level: 1 },
      { title: "2 Proposed Architecture", page: 1, level: 1 },
      { title: "3 Results", page: 2, level: 1 },
    ],
    references: [
      { ref_id: "ref-1", marker: "1", raw: "[1] Ada Lovelace and Alan Turing", title: "Literal work", authors: ["Ada Lovelace", "Alan Turing"], year: 1950, arxiv_id: null, openable: false },
      { ref_id: "ref-2", marker: "2", raw: "[2] Unobserved Author", title: "Unobserved", authors: ["Unobserved Author"], year: 2020, arxiv_id: null, openable: false },
    ],
    extraction: { version: "1", figure_backend: "test", warnings: [] },
  } as unknown as Manifest,
  reverseIndex: new Map(), mentionsByPage: [[], [], []], pageItems: [[], [], []],
  citationsByPage: [[{ refIds: ["ref-1"], text: "[1]", rect: null, openable: false }], [], []],
};

describe("literal author and method networks", () => {
  it("creates authors and coauthor edges only from observed references", () => {
    const graph = buildAuthorMethodNetwork([analysis]);
    expect(graph.nodes.filter(({ type }) => type === "author").map(({ label }) => label).sort()).toEqual([
      "Ada Lovelace", "Alan Turing",
    ]);
    expect(graph.edges.filter(({ type }) => type === "coauthored")).toHaveLength(1);
    expect(graph.edges.find(({ type }) => type === "coauthored")?.evidence).toMatchObject({
      kind: "citation", page: 0,
    });
  });

  it("creates paper-local method nodes only from explicit method headings", () => {
    const graph = buildAuthorMethodNetwork([analysis]);
    expect(graph.nodes.filter(({ type }) => type === "method").map(({ label }) => label)).toEqual([
      "2 Proposed Architecture",
    ]);
    expect(graph.edges.filter(({ type }) => type === "describes-method")).toHaveLength(1);
    expect(graph.nodes.find(({ type }) => type === "method")?.source).toMatchObject({
      kind: "passage", page: 1, sectionId: "sec-1",
    });
  });

  it("never creates generated relationships", () => {
    expect(buildAuthorMethodNetwork([analysis]).edges.every(({ generated }) => generated !== true)).toBe(true);
  });
});
