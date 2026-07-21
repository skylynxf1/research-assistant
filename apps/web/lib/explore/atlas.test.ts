/**
 * Figure Atlas model (expansion doc §B1).
 *
 * Visual skimming of a paper through its extracted assets. The two tests §19 requires of
 * this surface are that every displayed asset maps to a real manifest asset, and that a
 * missing crop does not produce a broken card — the atlas must never invent an entry or
 * render a dead image.
 */

import { describe, expect, it } from "vitest";
import type { Asset, Manifest } from "../manifest";
import type { Mention } from "../mentions";
import {
  buildAtlasEntries,
  groupByKind,
  groupBySection,
  sectionForPage,
} from "./atlas";

function asset(overrides: Partial<Asset> & Pick<Asset, "asset_id" | "kind" | "page">): Asset {
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

const MANIFEST = {
  doc_id: "sha256:" + "a".repeat(64),
  source: { type: "arxiv", arxiv_id: "1706.03762v7" },
  title: "Attention Is All You Need",
  page_count: 15,
  pages: [],
  assets: [
    asset({ asset_id: "fig-1", kind: "figure", page: 2, label: "Figure 1" }),
    asset({ asset_id: "tab-1", kind: "table", page: 5, label: "Table 1" }),
    asset({ asset_id: "fig-2", kind: "figure", page: 3, label: "Figure 2" }),
    asset({ asset_id: "alg-1", kind: "algorithm", page: 8, label: "Algorithm 1" }),
  ],
  references: [],
  sections: [
    { title: "1 Introduction", page: 0, level: 1 },
    { title: "3 Method", page: 2, level: 1 },
    { title: "4 Experiments", page: 5, level: 1 },
  ],
  extraction: { version: "1.0.0", figure_backend: "caption-heuristic", warnings: [] },
} as unknown as Manifest;

const mention = (page: number): Mention =>
  ({ assetId: "fig-1", page, kind: "figure", number: "1", text: "Figure 1", rect: null, index: 0 }) as Mention;

const REVERSE = new Map<string, Mention[]>([["fig-1", [mention(2), mention(7), mention(7)]]]);

describe("entries", () => {
  it("produces exactly one entry per manifest asset", () => {
    // §19: every displayed asset maps to a manifest asset. No invented entries.
    const entries = buildAtlasEntries(MANIFEST, REVERSE);
    expect(entries.map((e) => e.ref.assetId).sort()).toEqual(
      MANIFEST.assets.map((a) => a.asset_id).sort(),
    );
  });

  it("orders entries by page so the atlas reads in document order", () => {
    expect(buildAtlasEntries(MANIFEST, REVERSE).map((e) => e.ref.page)).toEqual([2, 3, 5, 8]);
  });

  it("carries evidence pointing back to the asset's own region", () => {
    const entry = buildAtlasEntries(MANIFEST, REVERSE)[0];
    expect(entry.evidence.assetId).toBe("fig-1");
    expect(entry.evidence.page).toBe(2);
    expect(entry.evidence.bbox).toEqual([0.1, 0.1, 0.9, 0.4]);
  });

  it("counts distinct pages the asset is referenced from", () => {
    // Two mentions on page 7 are one place to jump to, not two.
    const entry = buildAtlasEntries(MANIFEST, REVERSE).find((e) => e.ref.assetId === "fig-1")!;
    expect(entry.mentionPages).toEqual([2, 7]);
    expect(entry.mentionCount).toBe(3);
  });

  it("reports zero mentions rather than failing when an asset is never referenced", () => {
    const entry = buildAtlasEntries(MANIFEST, REVERSE).find((e) => e.ref.assetId === "tab-1")!;
    expect(entry.mentionCount).toBe(0);
    expect(entry.mentionPages).toEqual([]);
  });
});

describe("missing crops", () => {
  it("reports no crop url when the manifest has no image", () => {
    // §19: a missing crop must not create a broken card. The caller renders a
    // caption-only entry instead of an <img> that 404s.
    const broken = {
      ...MANIFEST,
      assets: [asset({ asset_id: "fig-9", kind: "figure", page: 1, image_url: "" })],
    } as Manifest;
    expect(buildAtlasEntries(broken, REVERSE)[0].cropUrl).toBeNull();
  });

  it("reports no crop url when the rendered image has no width", () => {
    const broken = {
      ...MANIFEST,
      assets: [asset({ asset_id: "fig-9", kind: "figure", page: 1, image_width: 0 })],
    } as Manifest;
    expect(buildAtlasEntries(broken, REVERSE)[0].cropUrl).toBeNull();
  });

  it("still lists the asset, because its caption is real content", () => {
    const broken = {
      ...MANIFEST,
      assets: [asset({ asset_id: "fig-9", kind: "figure", page: 1, image_url: "" })],
    } as Manifest;
    expect(buildAtlasEntries(broken, REVERSE)).toHaveLength(1);
  });
});

describe("grouping by kind", () => {
  const groups = groupByKind(buildAtlasEntries(MANIFEST, REVERSE));

  it("groups in a stable reading order", () => {
    expect(groups.map((g) => g.label)).toEqual(["Figures", "Tables", "Algorithms"]);
  });

  it("omits kinds the paper does not contain", () => {
    expect(groups.map((g) => g.key)).not.toContain("equation");
  });

  it("keeps every entry", () => {
    expect(groups.flatMap((g) => g.entries)).toHaveLength(4);
  });
});

describe("grouping by section", () => {
  it("assigns an asset to the last section starting at or before its page", () => {
    expect(sectionForPage(MANIFEST, 3)?.title).toBe("3 Method");
    expect(sectionForPage(MANIFEST, 5)?.title).toBe("4 Experiments");
    expect(sectionForPage(MANIFEST, 0)?.title).toBe("1 Introduction");
  });

  it("returns nothing for a page before the first section", () => {
    const late = {
      ...MANIFEST,
      sections: [{ title: "3 Method", page: 4, level: 1 }],
    } as Manifest;
    expect(sectionForPage(late, 1)).toBeNull();
  });

  it("returns nothing when the paper has no outline", () => {
    expect(sectionForPage({ ...MANIFEST, sections: [] } as Manifest, 3)).toBeNull();
  });

  it("groups assets under their section, in document order", () => {
    const groups = groupBySection(buildAtlasEntries(MANIFEST, REVERSE), MANIFEST);
    expect(groups.map((g) => g.label)).toEqual(["3 Method", "4 Experiments"]);
    expect(groups[0].entries.map((e) => e.ref.assetId)).toEqual(["fig-1", "fig-2"]);
  });

  it("collects assets with no section under one honest heading", () => {
    const late = {
      ...MANIFEST,
      sections: [{ title: "4 Experiments", page: 5, level: 1 }],
    } as Manifest;
    const groups = groupBySection(buildAtlasEntries(late, REVERSE), late);
    expect(groups[0].label).toBe("Unsectioned");
    expect(groups[0].entries.map((e) => e.ref.assetId)).toEqual(["fig-1", "fig-2"]);
  });
});
