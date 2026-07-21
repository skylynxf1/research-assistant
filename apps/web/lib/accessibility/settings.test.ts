import { describe, expect, it } from "vitest";
import type { ReflowDocument } from "./reflow";
import {
  DEFAULT_READING_SETTINGS,
  moveParagraphIndex,
  normalizeReadingSettings,
  speechParagraphs,
} from "./settings";

describe("reading accessibility settings", () => {
  it("clamps independent typography values to readable bounds", () => {
    expect(normalizeReadingSettings({ fontSize: 100, lineHeight: 0.5, paragraphSpacing: 9, measure: 10 })).toMatchObject({
      fontSize: 32,
      lineHeight: 1.2,
      paragraphSpacing: 3,
      measure: 28,
    });
  });

  it("retains defaults for unspecified controls", () => {
    expect(normalizeReadingSettings({ highContrast: true })).toEqual({
      ...DEFAULT_READING_SETTINGS,
      highContrast: true,
    });
  });

  it("moves paragraph focus without escaping the document", () => {
    expect(moveParagraphIndex(0, -1, 3)).toBe(0);
    expect(moveParagraphIndex(1, 1, 3)).toBe(2);
    expect(moveParagraphIndex(2, 1, 3)).toBe(2);
  });

  it("feeds speech only literal reflow paragraph text", () => {
    const document: ReflowDocument = {
      status: "ready",
      blocks: [
        { type: "heading", title: "1 Method", level: 2, page: 0, sectionId: "sec-0" },
        { type: "paragraph", text: "Original first paragraph.", page: 0, assetIds: [], citations: [] },
        { type: "paragraph", text: "Original second paragraph.", page: 1, assetIds: [], citations: [] },
      ],
    };
    expect(speechParagraphs(document)).toEqual([
      "Original first paragraph.",
      "Original second paragraph.",
    ]);
    expect(speechParagraphs({ status: "uncertain", reasons: ["unknown order"] })).toEqual([]);
  });
});
