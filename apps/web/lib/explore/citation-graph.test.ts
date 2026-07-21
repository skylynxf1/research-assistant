import { describe, expect, it } from "vitest";
import type { Manifest, Reference } from "../manifest";
import type { PaperAnalysis } from "./analysis";
import { addPaperToCitationGraph, emptyCitationGraph, paperNodeId } from "./citation-graph";

const reference = (id: string, openable: boolean): Reference => ({
  ref_id: id,
  marker: id.replace("ref-", ""),
  raw: `[${id}] Paper ${id}`,
  title: `Paper ${id}`,
  authors: [],
  year: 2020,
  arxiv_id: openable ? `2001.0000${id.at(-1)}` : null,
  openable,
});

const analysis = (
  digest: string,
  arxivId: string,
  references: Reference[],
  observed: Array<{ refId: string; text: string }>,
): PaperAnalysis => {
  const line = `A literal claim ${observed.map(({ text }) => text).join(" and ")} supports the method.`;
  return {
    manifest: {
      doc_id: `sha256:${digest}`,
      title: `Paper ${digest.slice(0, 4)}`,
      source: { type: "arxiv", arxiv_id: arxivId },
      page_count: 1,
      pages: [],
      sections: [],
      assets: [],
      references,
      extraction: { version: "1", figure_backend: "test", warnings: [] },
    } as unknown as Manifest,
    reverseIndex: new Map(),
    mentionsByPage: [[]],
    pageItems: [[{ str: line, hasEOL: true, rect: [0.1, 0.2, 0.9, 0.23] }]],
    citationsByPage: [[
      ...observed.map(({ refId, text }) => ({ refIds: [refId], text, rect: null, openable: true })),
    ]],
  };
};

describe("citation graph precision", () => {
  it("creates an edge only for an observed openable reference", () => {
    const open = reference("ref-1", true);
    const closed = reference("ref-2", false);
    const unseen = reference("ref-3", true);
    const model = addPaperToCitationGraph(
      emptyCitationGraph(),
      analysis("a".repeat(64), "2101.00001", [open, closed, unseen], [
        { refId: "ref-1", text: "[1]" },
        { refId: "ref-2", text: "[2]" },
      ]),
    );

    expect(model.graph.edges).toEqual([
      {
        source: "arxiv:2101.00001",
        target: "arxiv:2001.00001",
        type: "cites",
      },
    ]);
    expect(model.graph.nodes.map(({ id }) => id).sort()).toEqual([
      "arxiv:2001.00001",
      "arxiv:2101.00001",
    ]);
  });

  it("retains literal sentence context and source page in the citation trail", () => {
    const model = addPaperToCitationGraph(
      emptyCitationGraph(),
      analysis("a".repeat(64), "2101.00001", [reference("ref-1", true)], [
        { refId: "ref-1", text: "[1]" },
      ]),
    );
    expect(model.trails[0]).toMatchObject({
      refId: "ref-1",
      occurrences: [{ page: 0, text: "A literal claim [1] supports the method." }],
    });
  });

  it("expands one loaded paper without duplicating its node or edge", () => {
    const first = analysis("a".repeat(64), "2101.00001", [reference("ref-1", true)], [
      { refId: "ref-1", text: "[1]" },
    ]);
    const second = analysis("b".repeat(64), "2001.00001", [reference("ref-4", true)], [
      { refId: "ref-4", text: "[4]" },
    ]);
    const once = addPaperToCitationGraph(addPaperToCitationGraph(emptyCitationGraph(), first), second);
    const twice = addPaperToCitationGraph(once, second);

    expect(twice.graph.nodes).toHaveLength(3);
    expect(twice.graph.edges).toHaveLength(2);
    expect(twice.graph.nodes.find(({ id }) => id === "arxiv:2001.00001")?.metadata).toMatchObject({
      loaded: true,
      paperId: "b".repeat(64),
    });
  });

  it("uses the content hash for an uploaded paper node", () => {
    const upload = analysis("c".repeat(64), "", [], []);
    upload.manifest.source = { type: "upload", arxiv_id: null };
    expect(paperNodeId(upload.manifest)).toBe(`paper:${"c".repeat(64)}`);
  });
});
