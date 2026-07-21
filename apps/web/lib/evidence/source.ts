/**
 * Shared evidence contracts — expansion doc §5.
 *
 * These are the objects that cross the Developer A / Developer B boundary. Neither side
 * imports the other's components; they exchange these. Keep this module small: §3 warns
 * that a "shared utilities" layer becomes a dumping ground.
 *
 * Two invariants this module exists to protect:
 *
 * 1. **One coordinate model.** `NormalizedBBox` is an alias of the generated schema's
 *    `BBox`, not a new type. Coordinates are converted exactly once, in
 *    `apps/api/extract/geometry.py` (§1.2); everything here passes them through
 *    untouched. Never re-derive or "helpfully" flip a box.
 * 2. **Evidence is a pointer, never a copy.** Every generated or organised artifact must
 *    be able to send the reader back to the page it came from, which is what makes
 *    "Show evidence →" possible (§6).
 */

import type { Asset, BBox, Manifest, Reference, Section } from "../manifest";

/** Normalized [x0, y0, x1, y1], top-left origin. Same type the manifest already uses. */
export type NormalizedBBox = BBox;

export interface PaperRef {
  /** The content hash (spec D1). Present for uploads too, unlike an arXiv id. */
  paperId: string;
  title: string;
  arxivId: string | null;
}

export interface SectionRef {
  sectionId: string;
  title: string;
  page: number;
  level: number;
}

export interface AssetRef {
  paperId: string;
  assetId: string;
  kind: Asset["kind"];
  label: string;
  page: number;
}

export interface CitationRef {
  paperId: string;
  refId: string;
  marker: string;
  arxivId: string | null;
  openable: boolean;
}

export interface MentionRef {
  paperId: string;
  /** null when the paper cites something we did not extract. Never render an affordance. */
  assetId: string | null;
  page: number;
  text: string;
  bbox?: NormalizedBBox;
}

export interface ConceptRef {
  conceptId: string;
  label: string;
}

export interface PassageRef {
  paperId: string;
  page: number;
  text: string;
  bbox?: NormalizedBBox;
  sectionId?: string;
}

/**
 * §5.2's union, plus `"algorithm"`.
 *
 * The extraction manifest produces algorithm assets, and the doc's six kinds have no way
 * to say so. Labelling an algorithm a "figure" would put a wrong label on primary source
 * material, which this product exists not to do. The addition is additive — nothing that
 * only emits the original six breaks — and TypeScript will flag any exhaustive switch
 * that needs updating rather than failing silently. Flagged for coordination.
 */
export type SourceEvidenceKind =
  | "passage"
  | "figure"
  | "table"
  | "algorithm"
  | "equation"
  | "caption"
  | "citation";

export interface SourceEvidence {
  paperId: string;
  page: number;
  kind: SourceEvidenceKind;

  text?: string;
  assetId?: string;
  bbox?: NormalizedBBox;

  sectionId?: string;
}

/** The digest, which is how every blob path and cache entry is keyed (spec D1). */
export function paperIdOf(manifest: Manifest): string {
  return manifest.doc_id.replace(/^sha256:/, "");
}

export function paperRefOf(manifest: Manifest): PaperRef {
  return {
    paperId: paperIdOf(manifest),
    title: manifest.title,
    arxivId: manifest.source.arxiv_id,
  };
}

/**
 * Section ids are derived from manifest order.
 *
 * The manifest deliberately does not carry section ids, and titles are not unique (plenty
 * of papers have two "Results" headings), so position is the only stable handle. Same
 * manifest in, same id out.
 */
export function sectionIdFor(index: number): string {
  return `sec-${index}`;
}

export function sectionRefsOf(manifest: Manifest): SectionRef[] {
  return manifest.sections.map((section: Section, index: number) => ({
    sectionId: sectionIdFor(index),
    title: section.title,
    page: section.page,
    level: section.level,
  }));
}

export function assetRefOf(paperId: string, asset: Asset): AssetRef {
  return {
    paperId,
    assetId: asset.asset_id,
    kind: asset.kind,
    label: asset.label,
    page: asset.page,
  };
}

/** Evidence pointing at the asset's own region. */
export function assetEvidence(paperId: string, asset: Asset): SourceEvidence {
  return {
    paperId,
    page: asset.page,
    kind: asset.kind,
    assetId: asset.asset_id,
    bbox: asset.bbox,
    text: asset.caption || undefined,
  };
}

/** Evidence pointing at the caption text, which is a different region from the asset. */
export function captionEvidence(paperId: string, asset: Asset): SourceEvidence {
  return {
    paperId,
    page: asset.page,
    kind: "caption",
    assetId: asset.asset_id,
    bbox: asset.caption_bbox ?? undefined,
    text: asset.caption,
  };
}

export function citationEvidence(
  paperId: string,
  reference: Reference,
  page: number,
): SourceEvidence {
  return {
    paperId,
    page,
    kind: "citation",
    text: reference.title ?? reference.raw,
  };
}

export function passageEvidence(
  paperId: string,
  page: number,
  text: string,
  extra: { bbox?: NormalizedBBox; sectionId?: string } = {},
): SourceEvidence {
  return { paperId, page, kind: "passage", text, ...extra };
}

/**
 * A stable identity for a piece of evidence, for deduplication and persistence.
 *
 * Includes the paper id because asset ids are only unique within a paper — every paper
 * ever written has a `fig-1`.
 */
export function evidenceKey(evidence: SourceEvidence): string {
  return [
    evidence.paperId,
    evidence.kind,
    evidence.page,
    evidence.assetId ?? "",
    evidence.bbox?.join(",") ?? "",
  ].join("|");
}

export function isSameEvidence(a: SourceEvidence, b: SourceEvidence): boolean {
  return evidenceKey(a) === evidenceKey(b);
}
