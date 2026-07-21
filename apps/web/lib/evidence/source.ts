/**
 * Shared evidence contracts — expansion doc §5.
 *
 * These are the objects that cross the Developer A / Developer B boundary. Neither side
 * imports the other's components; they exchange these. Keep this module small: §3 warns
 * that a "shared utilities" layer becomes a dumping ground.
 *
 * Coordinates are normalized top-left schema coordinates and are passed through unchanged.
 * Evidence is a pointer to source material, never detached generated content.
 */

import type { Asset, BBox, Manifest, Reference, Section } from "../manifest";

/** Normalized [x0, y0, x1, y1], top-left origin. */
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
 * §5.2's union, plus "algorithm" because the manifest represents algorithms directly.
 */
export type SourceEvidenceKind =
  | "passage"
  | "figure"
  | "table"
  | "algorithm"
  | "equation"
  | "caption"
  | "citation";

/**
 * Canonical pointer to primary-source material.
 *
 * `passageId` and `citationRefId` are additive resource handles needed for fail-closed
 * scored interactions. They are optional for non-scored reader affordances so existing
 * consumers remain compatible, but a resolver will reject a scored passage/citation
 * relationship when its corresponding handle is absent.
 */
export interface SourceEvidence {
  paperId: string;
  page: number;
  kind: SourceEvidenceKind;
  text?: string;
  assetId?: string;
  bbox?: NormalizedBBox;
  sectionId?: string;
  passageId?: string;
  citationRefId?: string;
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
 * Section ids are derived from manifest order because headings need not be unique.
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
    citationRefId: reference.ref_id,
    text: reference.title ?? reference.raw,
  };
}

export function passageEvidence(
  paperId: string,
  page: number,
  text: string,
  extra: {
    bbox?: NormalizedBBox;
    sectionId?: string;
    passageId?: string;
  } = {},
): SourceEvidence {
  return { paperId, page, kind: "passage", text, ...extra };
}

/**
 * Stable identity for an evidence pointer. Resource handles are preferred, while bbox and
 * text make non-scored, legacy reader evidence distinguishable without inventing a second
 * identity model.
 */
export function evidenceKey(evidence: SourceEvidence): string {
  return [
    evidence.paperId,
    evidence.kind,
    evidence.page,
    evidence.assetId ?? "",
    evidence.passageId ?? "",
    evidence.citationRefId ?? "",
    evidence.bbox?.join(",") ?? "",
    evidence.text ?? "",
  ].join("|");
}

export function isSameEvidence(a: SourceEvidence, b: SourceEvidence): boolean {
  return evidenceKey(a) === evidenceKey(b);
}
