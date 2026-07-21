import {
  assetEvidence,
  captionEvidence,
  citationEvidence,
  paperRefOf,
  passageEvidence,
  sectionIdFor,
  type PaperRef,
  type SourceEvidence,
} from "../evidence/source";
import { flattenPage } from "../mentions";
import type { PaperAnalysis } from "./analysis";

export type CollectionIndexField = "title" | "section" | "text" | "caption" | "reference" | "asset";

export interface CollectionIndexEntry {
  field: CollectionIndexField;
  label: string;
  text: string;
  paper: PaperRef;
  evidence: SourceEvidence;
}

export function buildCollectionIndex(analyses: readonly PaperAnalysis[]): CollectionIndexEntry[] {
  const entries: CollectionIndexEntry[] = [];
  for (const analysis of analyses) {
    const paper = paperRefOf(analysis.manifest);
    entries.push({ field: "title", label: paper.title, text: paper.title, paper, evidence: passageEvidence(paper.paperId, 0, paper.title) });
    analysis.manifest.sections.forEach((section, index) => entries.push({
      field: "section", label: section.title, text: section.title, paper,
      evidence: passageEvidence(paper.paperId, section.page, section.title, { sectionId: sectionIdFor(index) }),
    }));
    analysis.pageItems.forEach((items, page) => {
      const text = flattenPage(items).text.replace(/\s+/g, " ").trim();
      if (text) entries.push({ field: "text", label: `Page ${page + 1}`, text, paper, evidence: passageEvidence(paper.paperId, page, text) });
    });
    for (const asset of analysis.manifest.assets) {
      entries.push({ field: "asset", label: asset.label, text: asset.label, paper, evidence: assetEvidence(paper.paperId, asset) });
      if (asset.caption) entries.push({ field: "caption", label: asset.label, text: asset.caption, paper, evidence: captionEvidence(paper.paperId, asset) });
    }
    const seenReferences = new Set<string>();
    analysis.citationsByPage.forEach((citations, page) => citations.forEach((citation) => citation.refIds.forEach((refId) => {
      if (seenReferences.has(refId)) return;
      const reference = analysis.manifest.references.find((item) => item.ref_id === refId);
      if (!reference) return;
      seenReferences.add(refId);
      const text = [reference.title, reference.raw].filter(Boolean).join(" · ");
      entries.push({ field: "reference", label: reference.title || reference.marker, text, paper, evidence: citationEvidence(paper.paperId, reference, page) });
    })));
  }
  return entries;
}

export function searchCollection(
  index: readonly CollectionIndexEntry[],
  query: string,
  limit = 50,
): CollectionIndexEntry[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [];
  return index.filter((entry) => entry.text.toLowerCase().includes(needle)).slice(0, Math.min(200, Math.max(1, limit)));
}

export function browseBenchmarks(
  index: readonly CollectionIndexEntry[],
  term: string,
  limit = 100,
): CollectionIndexEntry[] {
  const allowed = new Set<CollectionIndexField>(["text", "caption", "asset"]);
  return searchCollection(index.filter((entry) => allowed.has(entry.field)), term, limit);
}
