import { describe, expect, it } from "vitest";
import { createEvidenceResolver } from "../evidence/resource";
import { evidenceKey, passageEvidence } from "../evidence/source";
import { getPaperLearningIndex, type PaperLearningPage } from "../learning/paper-index";
import type { Manifest } from "../manifest";
import { buildResearchContext } from "../research-context/context";
import type { SelectionContext } from "../research-context/types";
import { boundedModelExcerpt, createVisualGenerationRequest } from "./request";

const manifest = {
  doc_id: `sha256:${"b".repeat(64)}`,
  source: { type: "arxiv", arxiv_id: "1706.03762" },
  title: "Long passage paper",
  page_count: 1,
  pages: [{ index: 0, width_pt: 600, height_pt: 800 }],
  assets: [],
  references: [],
  sections: [{ title: "Method", page: 0, level: 1 }],
  extraction: { version: "1", figure_backend: "caption-heuristic", warnings: [] },
} as Manifest;

const selectedText = "The first stage is attention and the second stage is a feed-forward network.";
const longBefore = `${"Earlier verified context. ".repeat(240)} End of earlier context.`;
const longSelected = `${"Selected verified context. ".repeat(130)} ${selectedText} ${"Later selected context. ".repeat(130)}`;
const longAfter = `${"Later verified context. ".repeat(240)} End of later context.`;
const pages: PaperLearningPage[] = [{
  items: [
    { str: longBefore, hasEOL: true, rect: [0.1, 0.1, 0.9, 0.14] },
    { str: longSelected, hasEOL: true, rect: [0.1, 0.3, 0.9, 0.34] },
    { str: longAfter, hasEOL: true, rect: [0.1, 0.5, 0.9, 0.54] },
  ],
  mentions: [],
  citations: [],
}];

describe("visual generation request bounding", () => {
  it("bounds large pdf.js passages before schema validation while retaining canonical evidence ids", () => {
    const index = getPaperLearningIndex(manifest, pages);
    const selection: SelectionContext = {
      text: selectedText,
      page: 0,
      itemRanges: [{ itemIndex: 1, startOffset: longSelected.indexOf(selectedText), endOffset: longSelected.indexOf(selectedText) + selectedText.length }],
      bbox: [0.3, 0.3, 0.7, 0.34],
    };
    const context = buildResearchContext({ manifest, selection, pages, index });
    const request = createVisualGenerationRequest(context, index, createEvidenceResolver([index]), {
      intent: "process-game",
      learningMode: "play",
    });

    expect(request).not.toBeNull();
    expect(request?.sourceWindow.every(({ text }) => text.length <= 4_000)).toBe(true);
    expect(request?.sourceEvidence.every(({ source }) => !source.text || source.text.length <= 3_000)).toBe(true);
    expect(request?.sourceWindow.find(({ id }) => id === context.sourceWindow.selected?.id)?.text).toContain(selectedText);

    const selectedPassage = context.sourceWindow.selected!;
    const canonicalId = evidenceKey(passageEvidence(index.paperId, selectedPassage.page, selectedPassage.text, {
      ...(selectedPassage.bbox ? { bbox: selectedPassage.bbox } : {}),
      ...(selectedPassage.sectionId ? { sectionId: selectedPassage.sectionId } : {}),
    }));
    expect(request?.sourceEvidence.some(({ id }) => id === canonicalId)).toBe(true);
  });

  it("keeps an anchor in a bounded excerpt", () => {
    const value = `${"before ".repeat(1_000)}${selectedText}${" after".repeat(1_000)}`;
    const excerpt = boundedModelExcerpt(value, 400, selectedText);
    expect(excerpt.length).toBeLessThanOrEqual(400);
    expect(excerpt).toContain(selectedText);
  });
});
