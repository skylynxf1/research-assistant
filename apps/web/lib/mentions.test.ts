/**
 * Mention detection runs in the client, not the server (plan deviation 1).
 *
 * The client already holds pdf.js `textContent.items`, so it runs the regex over those
 * directly. A server-side index would need a byte-identical text-normalization rule in
 * both Python and TypeScript, and keeping two implementations in two languages in sync
 * is a permanent bug source. The manifest therefore has no mentions[] array.
 */

import { describe, expect, it } from "vitest";
import { buildReverseIndex, findMentions, type PageTextItem } from "./mentions";

/**
 * One text item per word, laid out left to right with a real word gap between them.
 *
 * Deliberately no spaces inside `str`: pdf.js frequently emits adjacent runs with the
 * space implied by geometry alone, which is the case the flattener has to handle.
 */
const WORD_WIDTH = 0.02;
const WORD_GAP = 0.006;
const LINE_HEIGHT = 0.012;

function line(words: string[], y = 0.5): PageTextItem[] {
  return words.map((str, i) => {
    const x = 0.1 + i * (WORD_WIDTH + WORD_GAP);
    return {
      str,
      hasEOL: i === words.length - 1,
      rect: [x, y, x + WORD_WIDTH, y + LINE_HEIGHT] as [number, number, number, number],
    };
  });
}

const ASSETS = [
  { asset_id: "fig-1", kind: "figure", number: "1", page: 0, caption_bbox: null },
  { asset_id: "fig-2", kind: "figure", number: "2", page: 1, caption_bbox: null },
  { asset_id: "fig-3", kind: "figure", number: "3", page: 1, caption_bbox: null },
  { asset_id: "fig-4", kind: "figure", number: "4", page: 2, caption_bbox: null },
  { asset_id: "tab-1", kind: "table", number: "1", page: 2, caption_bbox: null },
  { asset_id: "fig-S3", kind: "figure", number: "S3", page: 9, caption_bbox: null },
];

function detect(items: PageTextItem[], page = 0, assets = ASSETS) {
  return findMentions(items, { page, assets });
}

describe("basic detection", () => {
  it("finds a figure mention", () => {
    const mentions = detect(line(["as", "shown", "in", "Figure", "1,", "the", "model"]));
    expect(mentions).toHaveLength(1);
    expect(mentions[0].assetId).toBe("fig-1");
    expect(mentions[0].text).toBe("Figure 1");
  });

  it("finds abbreviated forms", () => {
    expect(detect(line(["see", "Fig.", "2"]))[0]?.assetId).toBe("fig-2");
    expect(detect(line(["see", "Fig", "2"]))[0]?.assetId).toBe("fig-2");
  });

  it("finds tables and distinguishes them from figures", () => {
    const mentions = detect(line(["results", "in", "Table", "1", "and", "Figure", "1"]));
    expect(mentions.map((m) => m.assetId)).toEqual(["tab-1", "fig-1"]);
  });

  it("is case insensitive but reports the surface form", () => {
    expect(detect(line(["see", "figure", "1"]))[0].text).toBe("figure 1");
  });

  it("does not match a kind word it does not know", () => {
    expect(detect(line(["described", "in", "Section", "3", "below"]))).toHaveLength(0);
  });

  it("does not match across a sentence boundary", () => {
    expect(detect(line(["...the", "figure.", "1", "Introduction"]))).toHaveLength(0);
  });
});

describe("text-layer hazards", () => {
  it("joins a word split across a line break", () => {
    // "Fig-\nure 3" - pdf.js emits the hyphen at the end of one line.
    const items: PageTextItem[] = [
      ...line(["as", "shown", "in", "Fig-"], 0.5),
      ...line(["ure", "3", "the", "model"], 0.52),
    ];
    const mentions = detect(items);
    expect(mentions).toHaveLength(1);
    expect(mentions[0].assetId).toBe("fig-3");
  });

  it("normalizes ligatures", () => {
    // U+FB01. Without folding, "ﬁgure" never matches.
    const mentions = detect(line(["see", "ﬁgure", "1"]));
    expect(mentions[0]?.assetId).toBe("fig-1");
  });

  it("handles a mention split across items mid-word", () => {
    // pdf.js splits at arbitrary boundaries, including inside a word.
    const items: PageTextItem[] = [
      { str: "Fig", hasEOL: false, rect: [0.1, 0.5, 0.12, 0.51] },
      { str: "ure ", hasEOL: false, rect: [0.12, 0.5, 0.15, 0.51] },
      { str: "2", hasEOL: false, rect: [0.15, 0.5, 0.16, 0.51] },
    ];
    expect(detect(items)[0]?.assetId).toBe("fig-2");
  });

  it("finds appendix numbering", () => {
    expect(detect(line(["see", "Figure", "S3"]))[0]?.assetId).toBe("fig-S3");
  });
});

describe("ranges and lists", () => {
  it("expands an en-dash range into one mention per figure", () => {
    const mentions = detect(line(["see", "Figures", "2–4", "below"]));
    expect(mentions.map((m) => m.assetId)).toEqual(["fig-2", "fig-3", "fig-4"]);
  });

  it("expands a hyphen range", () => {
    expect(detect(line(["Figures", "2-4"])).map((m) => m.assetId)).toEqual([
      "fig-2",
      "fig-3",
      "fig-4",
    ]);
  });

  it("expands an 'and' list into two mentions", () => {
    expect(detect(line(["Figures", "2", "and", "3"])).map((m) => m.assetId)).toEqual([
      "fig-2",
      "fig-3",
    ]);
  });

  it("expands a comma list", () => {
    expect(detect(line(["Figures", "1,", "2", "and", "3"])).map((m) => m.assetId)).toEqual([
      "fig-1",
      "fig-2",
      "fig-3",
    ]);
  });

  it("refuses an implausibly large range", () => {
    // "Figures 2-99" in a paper with four figures is a typo or a page range.
    expect(detect(line(["Figures", "2-99"]))).toHaveLength(0);
  });
});

describe("caption self-reference exclusion", () => {
  const captioned = [
    { ...ASSETS[0], caption_bbox: [0.05, 0.6, 0.95, 0.65] as [number, number, number, number] },
    ...ASSETS.slice(1),
  ];

  it("ignores the caption's own label", () => {
    // "Figure 1: Overview" IS the caption, not a mention of itself. Without this every
    // figure gains a spurious self-mention and the reverse index is wrong on every paper.
    const items = line(["Figure", "1:", "Overview", "of", "the", "model"], 0.61);
    expect(findMentions(items, { page: 0, assets: captioned })).toHaveLength(0);
  });

  it("still finds a real mention elsewhere on the same page", () => {
    const items = line(["as", "shown", "in", "Figure", "1,", "we"], 0.2);
    expect(findMentions(items, { page: 0, assets: captioned })).toHaveLength(1);
  });
});

describe("precision over recall", () => {
  it("keeps an unmatched mention but gives it no asset", () => {
    // The paper cites Figure 9 but only four figures were found. Spec section 6 stage 6:
    // keep it, warn, and never render a hotspot for it.
    const mentions = detect(line(["see", "Figure", "9"]));
    expect(mentions).toHaveLength(1);
    expect(mentions[0].assetId).toBeNull();
  });

  it("resolves an ambiguous number to the nearest asset by page", () => {
    // Appendix figures can restart numbering, so (kind, number) is not a unique key.
    const assets = [
      { asset_id: "fig-1", kind: "figure", number: "1", page: 1, caption_bbox: null },
      { asset_id: "fig-1-appendix", kind: "figure", number: "1", page: 20, caption_bbox: null },
    ];
    expect(findMentions(line(["Figure", "1"]), { page: 19, assets })[0].assetId).toBe(
      "fig-1-appendix",
    );
    expect(findMentions(line(["Figure", "1"]), { page: 2, assets })[0].assetId).toBe("fig-1");
  });

  it("underlines only the mention, not the whole line it sits in", () => {
    // pdf.js often emits a whole line as one item. Using that item's rect verbatim
    // underlines half a paragraph, which is both ugly and overlaps other hotspots.
    const items: PageTextItem[] = [
      {
        str: "connected layers, shown in Figure 1, respectively.",
        hasEOL: true,
        rect: [0.1, 0.5, 0.9, 0.512],
      },
    ];
    const rect = detect(items)[0].rect!;
    const width = rect[2] - rect[0];
    expect(width).toBeLessThan(0.3); // "Figure 1" is a small part of a 0.8-wide line
    expect(rect[0]).toBeGreaterThan(0.4); // and it starts well into the line
  });

  it("gives every mention a rect covering its surface form", () => {
    const mention = detect(line(["as", "shown", "in", "Figure", "1,", "we"]))[0];
    expect(mention.rect).not.toBeNull();
    expect(mention.rect![2]).toBeGreaterThan(mention.rect![0]);
    expect(mention.rect![3]).toBeGreaterThan(mention.rect![1]);
  });
});

describe("reverse index", () => {
  it("groups mentions by asset in reading order", () => {
    const index = buildReverseIndex([
      { assetId: "fig-1", page: 7 } as never,
      { assetId: "fig-1", page: 2 } as never,
      { assetId: "fig-2", page: 3 } as never,
      { assetId: null, page: 4 } as never,
    ]);
    expect(index.get("fig-1")?.map((m) => m.page)).toEqual([2, 7]);
    expect(index.get("fig-2")?.map((m) => m.page)).toEqual([3]);
  });

  it("omits unmatched mentions, which have nothing to link to", () => {
    const index = buildReverseIndex([{ assetId: null, page: 4 } as never]);
    expect(index.size).toBe(0);
  });
});
