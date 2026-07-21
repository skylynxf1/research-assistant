/**
 * Figure Atlas model — expansion doc §B1.
 *
 * Lets a reader skim a paper through its extracted assets instead of scrolling pages.
 * Pure data: everything here is derived from the manifest plus the client-side reverse
 * mention index, with no new extraction and no server round trip.
 *
 * Ownership boundary (§B1): Developer B owns browsing, gallery and compare. Learning
 * interactions *inside* a figure belong to Developer A, so this module deliberately
 * exposes `SourceEvidence` per entry and stops there.
 */

import type { Asset, Manifest } from "../manifest";
import type { Mention } from "../mentions";
import {
  assetEvidence,
  assetRefOf,
  paperIdOf,
  sectionIdFor,
  type AssetRef,
  type SourceEvidence,
} from "../evidence/source";

export interface AtlasEntry {
  ref: AssetRef;
  label: string;
  caption: string;
  /** null when there is no usable crop; render the caption alone, never a dead image. */
  cropUrl: string | null;
  /** Total references to this asset in the body text. */
  mentionCount: number;
  /** Distinct pages it is referenced from, ascending — the reverse links (spec §8). */
  mentionPages: number[];
  evidence: SourceEvidence;
}

export interface AtlasGroup {
  key: string;
  label: string;
  entries: AtlasEntry[];
}

export interface AtlasSection {
  sectionId: string;
  title: string;
  page: number;
}

/** Reading order for kind groups, and their display names. */
const KIND_ORDER: { key: Asset["kind"]; label: string }[] = [
  { key: "figure", label: "Figures" },
  { key: "table", label: "Tables" },
  { key: "algorithm", label: "Algorithms" },
  { key: "equation", label: "Equations" },
];

const UNSECTIONED = "Unsectioned";

/**
 * True when the manifest describes a crop we can actually show.
 *
 * An asset can legitimately exist with no usable image, and an `<img>` pointed at
 * nothing renders as a broken card. Precision over recall (§1.3): show the caption,
 * which is real content, and omit the picture.
 */
function cropUrlOf(asset: Asset): string | null {
  if (!asset.image_url || asset.image_width <= 0) return null;
  return asset.image_url;
}

export function buildAtlasEntries(
  manifest: Manifest,
  reverseIndex: Map<string, Mention[]>,
): AtlasEntry[] {
  const paperId = paperIdOf(manifest);

  return manifest.assets
    .map((asset) => {
      const mentions = reverseIndex.get(asset.asset_id) ?? [];
      // Distinct pages: two mentions on one page are one place to jump to.
      const pages = [...new Set(mentions.map((m) => m.page))].sort((a, b) => a - b);

      return {
        ref: assetRefOf(paperId, asset),
        label: asset.label,
        caption: asset.caption,
        cropUrl: cropUrlOf(asset),
        mentionCount: mentions.length,
        mentionPages: pages,
        evidence: assetEvidence(paperId, asset),
      };
    })
    .sort((a, b) => a.ref.page - b.ref.page || a.ref.assetId.localeCompare(b.ref.assetId));
}

export function groupByKind(entries: AtlasEntry[]): AtlasGroup[] {
  return KIND_ORDER.map(({ key, label }) => ({
    key,
    label,
    entries: entries.filter((entry) => entry.ref.kind === key),
  })).filter((group) => group.entries.length > 0);
}

/**
 * The section an asset on `page` belongs to: the last one starting at or before it.
 *
 * Returns null for a page that precedes the first heading — front matter, or a paper
 * whose outline was not detected. Guessing a section there would attach a figure to a
 * heading it does not belong under.
 */
export function sectionForPage(manifest: Manifest, page: number): AtlasSection | null {
  let found: AtlasSection | null = null;

  manifest.sections.forEach((section, index) => {
    if (section.page <= page) {
      found = { sectionId: sectionIdFor(index), title: section.title, page: section.page };
    }
  });

  return found;
}

export function groupBySection(entries: AtlasEntry[], manifest: Manifest): AtlasGroup[] {
  const groups = new Map<string, AtlasGroup>();

  for (const entry of entries) {
    const section = sectionForPage(manifest, entry.ref.page);
    const key = section?.sectionId ?? UNSECTIONED;
    const existing = groups.get(key);
    if (existing) {
      existing.entries.push(entry);
    } else {
      groups.set(key, { key, label: section?.title ?? UNSECTIONED, entries: [entry] });
    }
  }

  // Entries already arrive in document order, so first appearance orders the groups.
  return [...groups.values()];
}
