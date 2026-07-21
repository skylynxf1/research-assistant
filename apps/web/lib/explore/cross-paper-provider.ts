import {
  assetEvidence,
  captionEvidence,
  citationEvidence,
  paperRefOf,
  passageEvidence,
  type PaperRef,
  type SourceEvidence,
  type SourceEvidenceKind,
} from "../evidence/source";
import { flattenPage } from "../mentions";
import type { ResearchCollection } from "../workspace/types";
import type { PaperAnalysis } from "./analysis";
import type { CitationGraphModel } from "./citation-graph";

export interface EvidenceQuery {
  text?: string;
  paperIds?: string[];
  kinds?: SourceEvidenceKind[];
  assetIds?: string[];
  limit?: number;
}

export interface CrossPaperContextProvider {
  getPaper(paperId: string): PaperRef | null;
  getConnectedPapers(paperId: string): PaperRef[];
  getCollectionPapers(collectionId: string): PaperRef[];
  findEvidence(query: EvidenceQuery): SourceEvidence[];
}

export class IndexedCrossPaperContextProvider implements CrossPaperContextProvider {
  private readonly papers = new Map<string, PaperRef>();
  private readonly collections = new Map<string, ResearchCollection>();
  private readonly evidence: SourceEvidence[] = [];
  private readonly graph: CitationGraphModel;

  constructor(
    analyses: readonly PaperAnalysis[],
    collections: readonly ResearchCollection[],
    graph: CitationGraphModel,
  ) {
    this.graph = graph;
    for (const collection of collections) this.collections.set(collection.id, collection);

    for (const analysis of analyses) {
      const paper = paperRefOf(analysis.manifest);
      this.papers.set(paper.paperId, paper);
      for (const asset of analysis.manifest.assets) {
        this.evidence.push(assetEvidence(paper.paperId, asset));
        this.evidence.push(captionEvidence(paper.paperId, asset));
      }
      analysis.pageItems.forEach((items, page) => {
        const text = flattenPage(items).text.replace(/\s+/g, " ").trim();
        if (text) this.evidence.push(passageEvidence(paper.paperId, page, text));
      });
    }

    for (const trail of graph.trails) {
      const sourceNode = graph.graph.nodes.find(({ id }) => id === trail.sourceNodeId);
      const paperId = sourceNode?.metadata.paperId;
      if (typeof paperId !== "string") continue;
      for (const occurrence of trail.occurrences) {
        this.evidence.push({
          ...citationEvidence(paperId, trail.reference, occurrence.page),
          text: occurrence.text,
        });
      }
    }
  }

  getPaper(paperId: string): PaperRef | null {
    return this.papers.get(paperId) ?? null;
  }

  getConnectedPapers(paperId: string): PaperRef[] {
    const node = this.graph.graph.nodes.find((candidate) => candidate.metadata.paperId === paperId);
    if (!node) return [];
    const connectedIds = new Set(
      this.graph.graph.edges
        .filter((edge) => edge.type === "cites" && (edge.source === node.id || edge.target === node.id))
        .map((edge) => edge.source === node.id ? edge.target : edge.source),
    );
    return this.graph.graph.nodes
      .filter((candidate) => connectedIds.has(candidate.id) && candidate.metadata.loaded)
      .map((candidate) => this.papers.get(candidate.metadata.paperId as string))
      .filter((paper): paper is PaperRef => Boolean(paper));
  }

  getCollectionPapers(collectionId: string): PaperRef[] {
    return [...(this.collections.get(collectionId)?.papers ?? [])];
  }

  findEvidence(query: EvidenceQuery): SourceEvidence[] {
    const paperIds = query.paperIds ? new Set(query.paperIds) : null;
    const kinds = query.kinds ? new Set(query.kinds) : null;
    const assetIds = query.assetIds ? new Set(query.assetIds) : null;
    const needle = query.text?.trim().toLowerCase();
    const limit = Math.min(200, Math.max(1, query.limit ?? 50));

    return this.evidence
      .filter((item) => !paperIds || paperIds.has(item.paperId))
      .filter((item) => !kinds || kinds.has(item.kind))
      .filter((item) => !assetIds || (item.assetId ? assetIds.has(item.assetId) : false))
      .filter((item) => !needle || item.text?.toLowerCase().includes(needle))
      .slice(0, limit);
  }
}
