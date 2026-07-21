import type { PaperRef, SourceEvidence } from "../evidence/source";
import type { ResearchCollection } from "./types";

type IdentityOptions = { id?: string; now?: number };

const newId = () => globalThis.crypto.randomUUID();

export function createCollection(
  name: string,
  options: IdentityOptions = {},
): ResearchCollection {
  const now = options.now ?? Date.now();
  return {
    version: 2,
    id: options.id ?? newId(),
    name: name.trim(),
    createdAt: now,
    updatedAt: now,
    papers: [],
    pinnedEvidence: [],
    notes: [],
    comparisons: [],
    boardNodes: [],
    boardEdges: [],
  };
}

/** Upgrade durable browser records without resetting or splitting the canonical store. */
export function normalizeCollection(value: ResearchCollection | (Omit<ResearchCollection, "version" | "boardEdges"> & { version: 1 })): ResearchCollection {
  if (value.version === 2) return { ...value, boardEdges: value.boardEdges ?? [] };
  return { ...value, version: 2, boardEdges: [] };
}

export function renameCollection(
  collection: ResearchCollection,
  name: string,
  now = Date.now(),
): ResearchCollection {
  const trimmed = name.trim();
  if (!trimmed || trimmed === collection.name) return collection;
  return { ...collection, name: trimmed, updatedAt: now };
}

export function addPaperToCollection(
  collection: ResearchCollection,
  paper: PaperRef,
  now = Date.now(),
): ResearchCollection {
  if (collection.papers.some(({ paperId }) => paperId === paper.paperId)) return collection;
  return { ...collection, papers: [...collection.papers, paper], updatedAt: now };
}

export function addNoteToCollection(
  collection: ResearchCollection,
  text: string,
  source?: SourceEvidence,
  options: IdentityOptions = {},
): ResearchCollection {
  const trimmed = text.trim();
  if (!trimmed) return collection;
  const now = options.now ?? Date.now();
  return {
    ...collection,
    notes: [
      ...collection.notes,
      { id: options.id ?? newId(), text: trimmed, source, createdAt: now },
    ],
    updatedAt: now,
  };
}

export function partitionCollectionPapers(
  collection: ResearchCollection,
  availablePaperIds: ReadonlySet<string>,
): { available: PaperRef[]; missing: PaperRef[] } {
  return collection.papers.reduce(
    (result, paper) => {
      result[availablePaperIds.has(paper.paperId) ? "available" : "missing"].push(paper);
      return result;
    },
    { available: [] as PaperRef[], missing: [] as PaperRef[] },
  );
}
