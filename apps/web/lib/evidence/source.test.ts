/**
 * Shared evidence contracts (expansion doc §5.2).
 *
 * These are the objects both developers pass across the A/B boundary, so the tests here
 * pin down the parts that are easy to get subtly wrong: that a reference back to the
 * paper always carries enough to navigate to it, and that coordinates are reused rather
 * than re-derived (§1.2 — coordinates convert exactly once, in extract/geometry.py).
 */

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
  caption: "Figure 1: The Transformer - model architecture.",
  caption_bbox: [0.3, 0.51, 0.7, 0.54],
  image_url: "/blob/abc/crops/fig-1.png",
  image_width: 950,
  parent_id: null,
};

const ALGORITHM: Asset = { ...FIGURE, asset_id: "alg-1", kind: "algorithm", label: "Algorithm 1" };

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
  doc_id: "sha256:" + "a".repeat(64),
  source: { type: "arxiv", arxiv_id: "1706.03762v7" },
  title: "Attention Is All You Need",
  page_count: 15,
  pages: [],
  assets: [FIGURE],
  references: [REFERENCE],
  sections: [
    { title: "1 Introduction", page: 0, level: 1 },
    { title: "3 Method", page: 2, level: 1 },
    { title: "3.1 Encoder", page: 2, level: 2 },
  ],
  extraction: { version: "1.0.0", figure_backend: "caption-heuristic", warnings: [] },
} as unknown as Manifest;

describe("paperRefOf", () => {
  it("uses the content hash as the paper id, not the arXiv id", () => {
    // A paper can be opened by upload with no arXiv id at all, so the digest is the only
    // identifier guaranteed to exist. It is also what every blob path is keyed by (D1).
    expect(paperRefOf(MANIFEST).paperId).toBe("a".repeat(64));
  });

  it("carries the title and arXiv id for display and cross-paper lookup", () => {
    const ref = paperRefOf(MANIFEST);
    expect(ref.title).toBe("Attention Is All You Need");
    expect(ref.arxivId).toBe("1706.03762v7");
  });

  it("tolerates an upload with no arXiv id", () => {
    const upload = { ...MANIFEST, source: { type: "upload", arxiv_id: null } } as Manifest;
    expect(paperRefOf(upload).arxivId).toBeNull();
  });
});

describe("section identity", () => {
  it("derives a stable id from manifest order", () => {
    // The manifest has no section ids, and titles repeat across papers, so position is
    // the only stable handle. Same manifest must always yield the same id.
    expect(sectionIdFor(1)).toBe(sectionIdFor(1));
    expect(sectionIdFor(1)).not.toBe(sectionIdFor(2));
  });

  it("preserves order, page and depth", () => {
    const sections = sectionRefsOf(MANIFEST);
    expect(sections.map((s) => s.title)).toEqual([
      "1 Introduction",
      "3 Method",
      "3.1 Encoder",
    ]);
    expect(sections[2].level).toBe(2);
    expect(sections[2].page).toBe(2);
  });
});

describe("evidence constructors", () => {
  it("reuses the asset's bbox rather than recomputing one", () => {
    // §1.2: no feature may apply a second coordinate conversion.
    const evidence = assetEvidence("paper-1", FIGURE);
    expect(evidence.bbox).toEqual(FIGURE.bbox);
    expect(evidence.page).toBe(2);
    expect(evidence.assetId).toBe("fig-1");
    expect(evidence.kind).toBe("figure");
  });

  it("keeps an algorithm labelled as an algorithm", () => {
    // The manifest has algorithm assets. Calling one a "figure" to fit a narrower union
    // would put a wrong label on primary source material.
    expect(assetEvidence("paper-1", ALGORITHM).kind).toBe("algorithm");
  });

  it("points caption evidence at the caption box, not the asset box", () => {
    const evidence = captionEvidence("paper-1", FIGURE);
    expect(evidence.kind).toBe("caption");
    expect(evidence.bbox).toEqual(FIGURE.caption_bbox);
    expect(evidence.text).toContain("The Transformer");
  });

  it("survives an asset whose caption box is unknown", () => {
    const noBox = { ...FIGURE, caption_bbox: null };
    expect(captionEvidence("paper-1", noBox).bbox).toBeUndefined();
  });

  it("builds citation evidence from a resolved reference", () => {
    const evidence = citationEvidence("paper-1", REFERENCE, 9);
    expect(evidence.kind).toBe("citation");
    expect(evidence.page).toBe(9);
    expect(evidence.text).toContain("Attention is all you need");
  });

  it("builds passage evidence carrying the text needed to show it", () => {
    const evidence = passageEvidence("paper-1", 3, "as shown in Figure 1", {
      bbox: [0.1, 0.2, 0.5, 0.22],
      sectionId: sectionIdFor(1),
    });
    expect(evidence.kind).toBe("passage");
    expect(evidence.text).toBe("as shown in Figure 1");
    expect(evidence.sectionId).toBe(sectionIdFor(1));
  });
});

describe("evidenceKey", () => {
  it("is stable for the same evidence", () => {
    expect(evidenceKey(assetEvidence("p", FIGURE))).toBe(
      evidenceKey(assetEvidence("p", FIGURE)),
    );
  });

  it("separates the asset from its caption", () => {
    expect(evidenceKey(assetEvidence("p", FIGURE))).not.toBe(
      evidenceKey(captionEvidence("p", FIGURE)),
    );
  });

  it("separates the same asset id in two different papers", () => {
    // fig-1 exists in every paper ever written; the paper id has to be part of the key.
    expect(evidenceKey(assetEvidence("paper-a", FIGURE))).not.toBe(
      evidenceKey(assetEvidence("paper-b", FIGURE)),
    );
  });

  it("separates two passages on different pages", () => {
    expect(evidenceKey(passageEvidence("p", 1, "text"))).not.toBe(
      evidenceKey(passageEvidence("p", 2, "text")),
    );
  });
});
