import { describe, expect, it } from "vitest";
import type { Citation } from "../citations";
import type { Manifest } from "../manifest";
import type { Mention, PageTextItem } from "../mentions";
import { buildReflowDocument } from "./reflow";

const item = (str: string, rect: [number, number, number, number]): PageTextItem => ({
  str,
  rect,
  hasEOL: true,
});

const manifest = {
  doc_id: `sha256:${"a".repeat(64)}`,
  title: "Reflow Paper",
  source: { type: "upload", arxiv_id: null },
  page_count: 1,
  pages: [],
  sections: [
    { title: "1 Introduction", page: 0, level: 1 },
    { title: "1.1 Details", page: 0, level: 2 },
  ],
  assets: [
    {
      asset_id: "fig-1",
      kind: "figure",
      label: "Figure 1",
      number: "1",
      page: 0,
      bbox: [0.1, 0.5, 0.9, 0.8],
      caption: "Figure 1: Architecture",
      caption_bbox: [0.1, 0.81, 0.9, 0.84],
      image_url: "/blob/a/crops/fig-1.png",
      image_width: 800,
      parent_id: null,
    },
  ],
  references: [
    {
      ref_id: "ref-1",
      marker: "1",
      raw: "[1] Source paper",
      title: "Source paper",
      authors: [],
      year: 2020,
      arxiv_id: "2001.00001",
      openable: true,
    },
  ],
  extraction: { version: "1", figure_backend: "test", warnings: [] },
} as unknown as Manifest;

const page: PageTextItem[] = [
  item("1 Introduction", [0.1, 0.08, 0.9, 0.11]),
  item("Left column opens with Figure 1.", [0.08, 0.2, 0.45, 0.22]),
  item("It continues here.", [0.08, 0.23, 0.42, 0.25]),
  item("Right column follows [1].", [0.56, 0.2, 0.92, 0.22]),
  item("1.1 Details", [0.56, 0.3, 0.82, 0.33]),
  item("Detailed evidence.", [0.56, 0.34, 0.9, 0.36]),
];

const mention: Mention = {
  assetId: "fig-1",
  kind: "figure",
  number: "1",
  page: 0,
  text: "Figure 1",
  rect: [0.3, 0.2, 0.4, 0.22],
  index: 0,
};

const citation: Citation = {
  refIds: ["ref-1"],
  text: "[1]",
  rect: [0.8, 0.2, 0.84, 0.22],
  openable: true,
};

describe("semantic reflow", () => {
  it("orders a two-column page left column before right column", () => {
    const result = buildReflowDocument(manifest, [page], [[mention]], [[citation]]);
    expect(result.status).toBe("ready");
    if (result.status !== "ready") return;
    const text = result.blocks.map((block) => block.type === "paragraph" ? block.text : block.title);
    expect(text).toEqual([
      "1 Introduction",
      "Left column opens with Figure 1. It continues here.",
      "Right column follows [1].",
      "1.1 Details",
      "Detailed evidence.",
    ]);
  });

  it("represents manifest hierarchy with semantic heading levels in stable order", () => {
    const result = buildReflowDocument(manifest, [page], [[mention]], [[citation]]);
    if (result.status !== "ready") throw new Error("expected ready reflow");
    expect(result.blocks.filter((block) => block.type === "heading")).toEqual([
      { type: "heading", title: "1 Introduction", level: 2, page: 0, sectionId: "sec-0" },
      { type: "heading", title: "1.1 Details", level: 3, page: 0, sectionId: "sec-1" },
    ]);
  });

  it("keeps resolved figure and citation actions on their source paragraph", () => {
    const result = buildReflowDocument(manifest, [page], [[mention]], [[citation]]);
    if (result.status !== "ready") throw new Error("expected ready reflow");
    const paragraphs = result.blocks.filter((block) => block.type === "paragraph");
    expect(paragraphs[0]).toMatchObject({ page: 0, assetIds: ["fig-1"] });
    expect(paragraphs[1]).toMatchObject({
      page: 0,
      citations: [{ text: "[1]", refIds: ["ref-1"], openable: true }],
    });
  });

  it("fails closed when narrow text crosses the column midpoint", () => {
    const uncertain = [item("Ambiguous line", [0.4, 0.2, 0.6, 0.23])];
    expect(buildReflowDocument(manifest, [uncertain], [[]], [[]])).toMatchObject({
      status: "uncertain",
    });
  });

  it("keeps a source page on every readable block", () => {
    const result = buildReflowDocument(manifest, [page], [[mention]], [[citation]]);
    if (result.status !== "ready") throw new Error("expected ready reflow");
    expect(result.blocks.every((block) => block.page === 0)).toBe(true);
  });
});
