/**
 * Paper Map model — expansion doc §B2.
 *
 * The map may reorganize only objects that really exist in the manifest or the client-side
 * citation scan. These tests pin hierarchy, source assignment, and honest failure behavior.
 */

import { describe, expect, it } from "vitest";
import type { Citation } from "../citations";
import type { Asset, Manifest, Reference } from "../manifest";
import type { Mention } from "../mentions";
import { buildPaperMap, openableArxivId } from "./paper-map";

function asset(
  overrides: Partial<Asset> & Pick<Asset, "asset_id" | "kind" | "page">,
): Asset {
  return {
    label: overrides.asset_id,
    number: "1",
    bbox: [0.1, 0.1, 0.9, 0.4],
    caption: `${overrides.asset_id} caption`,
    caption_bbox: [0.1, 0.41, 0.9, 0.44],
    image_url: `/blob/abc/crops/${overrides.asset_id}.png`,
    image_width: 900,
    parent_id: null,
    ...overrides,
  } as Asset;
}

function reference(overrides: Partial<Reference> & Pick<Reference, "ref_id" | "marker">): Reference {
  return {
    raw: `[${overrides.marker}] Reference ${overrides.ref_id}`,
    title: `Paper ${overrides.ref_id}`,
    authors: ["Ada Author"],
    year: 2024,
    arxiv_id: null,
    openable: false,
    ...overrides,
  };
}

const REF_OPEN = reference({
  ref_id: "ref-1",
  marker: "1",
  arxiv_id: "2401.00001",
  openable: true,
});
const REF_CLOSED = reference({ ref_id: "ref-2", marker: "2" });

const MANIFEST = {
  doc_id: "sha256:" + "a".repeat(64),
  source: { type: "arxiv", arxiv_id: "1706.03762v7" },
  title: "Mapped Paper",
  page_count: 7,
  pages: [],
  assets: [
    asset({ asset_id: "fig-front", kind: "figure", page: 0 }),
    asset({ asset_id: "fig-1", kind: "figure", page: 2, label: "Figure 1" }),
    asset({ asset_id: "tab-1", kind: "table", page: 3, label: "Table 1" }),
    asset({ asset_id: "fig-2", kind: "figure", page: 5, label: "Figure 2" }),
  ],
  references: [REF_OPEN, REF_CLOSED],
  sections: [
    { title: "1 Introduction", page: 1, level: 1 },
    { title: "2 Method", page: 2, level: 1 },
    { title: "2.1 Details", page: 3, level: 2 },
    { title: "3 Results", page: 5, level: 1 },
  ],
  extraction: { version: "1.0.0", figure_backend: "caption-heuristic", warnings: [] },
} as unknown as Manifest;

const mention = (assetId: string, page: number): Mention =>
  ({ assetId, page, kind: "figure", number: "1", text: "Figure 1", rect: null, index: 0 }) as Mention;

const citation = (refIds: string[], text: string, openable = false): Citation => ({
  refIds,
  text,
  rect: null,
  openable,
});

const MENTIONS: Mention[][] = [
  [],
  [],
  [mention("fig-1", 2)],
  [],
  [mention("fig-1", 4), mention("fig-1", 4)],
  [],
  [],
];

const CITATIONS: Citation[][] = [
  [citation(["ref-2"], "[2]")],
  [],
  [citation(["ref-1"], "[1]", true), citation(["ref-1"], "[1]", true)],
  [citation(["ref-2"], "[2]")],
  [],
  [],
  [],
];

describe("section hierarchy", () => {
  it("preserves manifest heading levels as a stable tree", () => {
    const map = buildPaperMap(MANIFEST, MENTIONS, CITATIONS);

    expect(map.sections.map((section) => section.title)).toEqual([
      "Unsectioned",
      "1 Introduction",
      "2 Method",
      "3 Results",
    ]);
    expect(map.sections[2].children.map((section) => section.title)).toEqual(["2.1 Details"]);
  });

  it("keeps empty sections because they are real paper structure", () => {
    const map = buildPaperMap(MANIFEST, MENTIONS, CITATIONS);
    expect(map.sections[1].title).toBe("1 Introduction");
    expect(map.sections[1].assets).toEqual([]);
    expect(map.sections[1].citations).toEqual([]);
  });
});

describe("source assignment", () => {
  it("assigns assets to the last section beginning at or before their page", () => {
    const map = buildPaperMap(MANIFEST, MENTIONS, CITATIONS);

    expect(map.sections[2].assets.map(({ asset }) => asset.asset_id)).toEqual(["fig-1"]);
    expect(map.sections[2].children[0].assets.map(({ asset }) => asset.asset_id)).toEqual(["tab-1"]);
    expect(map.sections[3].assets.map(({ asset }) => asset.asset_id)).toEqual(["fig-2"]);
  });

  it("assigns every manifest asset exactly once", () => {
    const map = buildPaperMap(MANIFEST, MENTIONS, CITATIONS);
    const collect = (sections: typeof map.sections): string[] =>
      sections.flatMap((section) => [
        ...section.assets.map(({ asset }) => asset.asset_id),
        ...collect(section.children),
      ]);

    expect(collect(map.sections).sort()).toEqual(MANIFEST.assets.map((item) => item.asset_id).sort());
  });

  it("carries distinct reverse-mention pages in reading order", () => {
    const entry = buildPaperMap(MANIFEST, MENTIONS, CITATIONS).sections[2].assets[0];
    expect(entry.mentionPages).toEqual([2, 4]);
  });

  it("uses one honest Unsectioned node for content before the first heading", () => {
    const unsectioned = buildPaperMap(MANIFEST, MENTIONS, CITATIONS).sections[0];
    expect(unsectioned.assets.map(({ asset }) => asset.asset_id)).toEqual(["fig-front"]);
    expect(unsectioned.citations.map(({ reference }) => reference.ref_id)).toEqual(["ref-2"]);
  });
});

describe("section-local citations", () => {
  it("deduplicates repeated markers within a section while retaining first-source context", () => {
    const method = buildPaperMap(MANIFEST, MENTIONS, CITATIONS).sections[2];
    expect(method.citations).toHaveLength(1);
    expect(method.citations[0]).toMatchObject({ page: 2, surface: "[1]" });
    expect(method.citations[0].reference.ref_id).toBe("ref-1");
  });

  it("retains unresolved references as non-openable source text", () => {
    const details = buildPaperMap(MANIFEST, MENTIONS, CITATIONS).sections[2].children[0];
    expect(details.citations[0].reference).toMatchObject({
      ref_id: "ref-2",
      arxiv_id: null,
      openable: false,
    });
  });

  it("opens only references that explicitly resolved to an arXiv paper", () => {
    expect(openableArxivId(REF_OPEN)).toBe("2401.00001");
    expect(openableArxivId(REF_CLOSED)).toBeNull();
    expect(openableArxivId({ ...REF_OPEN, openable: false })).toBeNull();
    expect(openableArxivId({ ...REF_OPEN, arxiv_id: null })).toBeNull();
  });
});

describe("sparse papers", () => {
  it("groups page-bound objects under Unsectioned when no outline was extracted", () => {
    const manifest = { ...MANIFEST, sections: [] } as Manifest;
    const map = buildPaperMap(manifest, MENTIONS, CITATIONS);
    expect(map.sections).toHaveLength(1);
    expect(map.sections[0].title).toBe("Unsectioned");
    expect(map.sections[0].assets).toHaveLength(MANIFEST.assets.length);
  });

  it("renders no invented nodes when the paper has no structural objects", () => {
    const manifest = { ...MANIFEST, sections: [], assets: [], references: [] } as Manifest;
    const map = buildPaperMap(manifest, [], []);
    expect(map.sections).toEqual([]);
    expect(map.objectCount).toBe(0);
  });
});
