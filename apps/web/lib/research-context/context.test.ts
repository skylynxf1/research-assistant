import { describe, expect, it } from "vitest";
import type { Manifest } from "../manifest";
import type { PageTextItem } from "../mentions";
import { buildResearchContext } from "./context";
import type { SelectionContext } from "./types";

const manifest = {
  doc_id: `sha256:${"a".repeat(64)}`,
  source: { type: "arxiv", arxiv_id: "1706.03762" },
  title: "Attention Is All You Need",
  page_count: 2,
  pages: [
    { index: 0, width_pt: 600, height_pt: 800 },
    { index: 1, width_pt: 600, height_pt: 800 },
  ],
  assets: [
    {
      asset_id: "fig-1",
      kind: "figure",
      label: "Figure 1",
      number: "1",
      page: 1,
      bbox: [0.15, 0.42, 0.85, 0.72],
      caption: "The Transformer architecture.",
      caption_bbox: [0.15, 0.72, 0.85, 0.78],
      image_url: "/blob/example/crops/fig-1.png",
      image_width: 1200,
      parent_id: null,
    },
  ],
  references: [],
  sections: [
    { title: "Introduction", page: 0, level: 1 },
    { title: "Model Architecture", page: 1, level: 1 },
  ],
  extraction: { version: "1.0.0", figure_backend: "caption-heuristic", warnings: [] },
} satisfies Manifest;

function line(str: string, y: number): PageTextItem[] {
  return [{ str, hasEOL: true, rect: [0.1, y, 0.9, y + 0.02] }];
}

const selection: SelectionContext = {
  text: "multi-head attention",
  page: 1,
  itemRanges: [{ itemIndex: 0, startOffset: 4, endOffset: 24 }],
  bbox: [0.2, 0.35, 0.5, 0.37],
};

describe("buildResearchContext", () => {
  const context = buildResearchContext({
    manifest,
    selection,
    pages: [
      { items: line("Transformers avoid recurrence.", 0.2), mentions: [], citations: [] },
      {
        items: [
          ...line("The multi-head attention block is shown below.", 0.35),
          ...line("Each head uses separate projections.", 0.39),
        ],
        mentions: [],
        citations: [],
      },
    ],
  });

  it("resolves the paper and containing section", () => {
    expect(context.paper.paperId).toBe(manifest.doc_id.replace("sha256:", ""));
    expect(context.selection?.page).toBe(1);
    expect(context.section?.title).toBe("Model Architecture");
  });

  it("finds nearby manifest assets without creating a second coordinate model", () => {
    expect(context.nearbyAssets.map((asset) => asset.assetId)).toEqual(["fig-1"]);
    expect(context.nearbyAssets[0].bbox).toEqual(manifest.assets[0].bbox);
  });

  it("builds a bounded source window around the selection", () => {
    expect(context.sourceWindow.selected?.page).toBe(1);
    expect(context.sourceWindow.selected?.text).toContain("multi-head attention");
    expect(context.surroundingPassages.length).toBeLessThanOrEqual(5);
  });
});
