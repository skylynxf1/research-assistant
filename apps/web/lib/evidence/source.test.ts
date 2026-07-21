import { describe, expect, it } from "vitest";
import type { Asset, Manifest, Reference } from "../manifest";
import {
  assetEvidence,
  captionEvidence,
  citationEvidence,
  evidenceKey,
  paperRefOf,
  passageEvidence,
  sectionIdFor,
  sectionRefsOf,
} from "./source";

const FIGURE: Asset = {
  asset_id: "fig-1",
  kind: "figure",
  label: "Figure 1",
  number: "1",
  page: 2,
  bbox: [0.32, 0.09, 0.68, 0.5],
  caption: "Figure 1: The Transformer model architecture.",
  caption_bbox: [0.3, 0.51, 0.7, 0.54],
  image_url: "/blob/abc/crops/fig-1.png",
  image_width: 950,
  parent_id: null,
};

const REFERENCE: Reference = {
  ref_id: "ref-12",
  marker: "12",
  raw: "[12] A. Vaswani et al. Attention is all you need. NeurIPS 2017.",
  title: "Attention is all you need",
  authors: ["A. Vaswani"],
  year: 2017,
  arxiv_id: "1706.03762",
  openable: true,
};

const MANIFEST = {
  doc_id: `sha256:${"a".repeat(64)}`,
  source: { type: "arxiv", arxiv_id: "1706.03762v7" },
  title: "Attention Is All You Need",
  page_count: 15,
  pages: [],
  assets: [FIGURE],
  references: [REFERENCE],
  sections: [
    { title: "1 Introduction", page: 0, level: 1 },
    { title: "3 Method", page: 2, level: 1 },
  ],
  extraction: { version: "1.0.0", figure_backend: "caption-heuristic", warnings: [] },
} as unknown as Manifest;

describe("shared evidence source", () => {
  it("uses the digest rather than an arXiv id as the paper identity", () => {
    expect(paperRefOf(MANIFEST).paperId).toBe("a".repeat(64));
    expect(paperRefOf(MANIFEST).arxivId).toBe("1706.03762v7");
  });

  it("derives stable section references from manifest order", () => {
    expect(sectionIdFor(1)).toBe(sectionIdFor(1));
    expect(sectionRefsOf(MANIFEST)[1]).toMatchObject({ sectionId: "sec-1", page: 2 });
  });

  it("reuses canonical asset and caption geometry without converting it", () => {
    expect(assetEvidence("paper-1", FIGURE)).toMatchObject({
      kind: "figure",
      assetId: "fig-1",
      bbox: FIGURE.bbox,
    });
    expect(captionEvidence("paper-1", FIGURE)).toMatchObject({
      kind: "caption",
      bbox: FIGURE.caption_bbox,
    });
  });

  it("carries the reference id for citation resolution", () => {
    expect(citationEvidence("paper-1", REFERENCE, 9)).toMatchObject({
      kind: "citation",
      citationRefId: "ref-12",
      page: 9,
    });
  });

  it("keeps a passage resource handle in the canonical evidence pointer", () => {
    const evidence = passageEvidence("paper-1", 3, "as shown in Figure 1", {
      passageId: "paper-1:page-3:passage-0",
      bbox: [0.1, 0.2, 0.5, 0.22],
      sectionId: sectionIdFor(1),
    });
    expect(evidence.passageId).toBe("paper-1:page-3:passage-0");
    expect(evidenceKey(evidence)).toContain(evidence.passageId);
  });

  it("separates otherwise identical passages by their canonical resource handles", () => {
    const one = passageEvidence("paper-1", 3, "same text", { passageId: "passage-1" });
    const two = passageEvidence("paper-1", 3, "same text", { passageId: "passage-2" });
    expect(evidenceKey(one)).not.toBe(evidenceKey(two));
  });
});
