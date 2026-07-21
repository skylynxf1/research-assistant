import type { PaperRef, SourceEvidence } from "../evidence/source";

export interface WorkspaceNote {
  id: string;
  text: string;
  source?: SourceEvidence;
  createdAt: number;
}

export interface WorkspaceComparison {
  id: string;
  evidence: SourceEvidence[];
  createdAt: number;
}

export interface BoardNode {
  id: string;
  source?: SourceEvidence;
  note?: string;
  x: number;
  y: number;
}

export interface ResearchCollection {
  version: 1;
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  papers: PaperRef[];
  pinnedEvidence: SourceEvidence[];
  notes: WorkspaceNote[];
  comparisons: WorkspaceComparison[];
  boardNodes: BoardNode[];
}

export interface WorkspaceRepository {
  listCollections(): Promise<ResearchCollection[]>;
  getCollection(id: string): Promise<ResearchCollection | null>;
  saveCollection(collection: ResearchCollection): Promise<ResearchCollection>;
  deleteCollection(id: string): Promise<void>;
}
