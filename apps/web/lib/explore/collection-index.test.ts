import { describe, expect, it } from "vitest";
import type { Manifest } from "../manifest";
import type { PaperAnalysis } from "./analysis";
import { browseBenchmarks, buildCollectionIndex, searchCollection } from "./collection-index";

const analysis = {
  manifest: {
    doc_id: `sha256:${"a".repeat(64)}`, title: "Residual ImageNet Models",
    source: { type: "arxiv", arxiv_id: "1512.03385" }, page_count: 2, pages: [],
    sections: [{ title: "4 Experiments", page: 1, level: 1 }],
    assets: [{ asset_id: "table-3", kind: "table", label: "Table 3", number: "3", page: 1, bbox: [0,0,1,1], caption: "ImageNet validation error", caption_bbox: [0,0,1,1], image_url: "/blob/a/table.png", image_width: 800, parent_id: null }],
    references: [{ ref_id: "ref-1", marker: "1", raw: "[1] ImageNet classification benchmark", title: "ImageNet Classification", authors: [], year: 2012, arxiv_id: null, openable: false }],
    extraction: { version: "1", figure_backend: "test", warnings: [] },
  } as unknown as Manifest,
  reverseIndex: new Map(), mentionsByPage: [[], []],
  citationsByPage: [[], [{ refIds: ["ref-1"], text: "[1]", rect: null, openable: false }]],
  pageItems: [[], [{ str: "We evaluate top-1 accuracy on ImageNet.", hasEOL: true, rect: [0,0,1,1] }]],
} as PaperAnalysis;

describe("collection lexical index", () => {
  const index = buildCollectionIndex([analysis]);

  it("indexes title, section, page text, caption, reference, and asset label", () => {
    expect(new Set(index.map(({ field }) => field))).toEqual(new Set(["title", "section", "text", "caption", "reference", "asset"]));
  });

  it("searches case-insensitively with bounded source-linked results", () => {
    const results = searchCollection(index, "imagenet", 2);
    expect(results).toHaveLength(2);
    expect(results.every(({ evidence }) => evidence.paperId === "a".repeat(64))).toBe(true);
  });

  it("limits benchmark browsing to original tables/captions/passages without metrics normalization", () => {
    const results = browseBenchmarks(index, "ImageNet");
    expect(results.some(({ field }) => field === "caption")).toBe(true);
    expect(results.some(({ field }) => field === "text")).toBe(true);
    expect(results.every(({ text }) => text.includes("ImageNet"))).toBe(true);
  });
});
