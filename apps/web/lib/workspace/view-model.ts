import type { PaperRef } from "../evidence/source";
import type { ResearchCollection } from "./types";

export interface CollectionPaperRow {
  paper: PaperRef;
  available: boolean;
}

export interface CollectionRow {
  collection: ResearchCollection;
  papers: CollectionPaperRow[];
}

export function collectionRows(
  collections: readonly ResearchCollection[],
  availablePaperIds: ReadonlySet<string>,
): CollectionRow[] {
  return [...collections]
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .map((collection) => ({
      collection,
      papers: collection.papers.map((paper) => ({
        paper,
        available: availablePaperIds.has(paper.paperId),
      })),
    }));
}

export function collectionHasPaper(
  collection: ResearchCollection,
  paperId: string,
): boolean {
  return collection.papers.some((paper) => paper.paperId === paperId);
}
