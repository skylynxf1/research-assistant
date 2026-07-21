import { citationEvidence, paperIdOf } from "../evidence/source";
import type { Manifest, Reference } from "../manifest";
import { flattenPage } from "../mentions";
import {
  addEdge,
  addNode,
  emptyGraph,
  type ResearchGraph,
  type ResearchGraphNode,
} from "./graph";
import type { PaperAnalysis } from "./analysis";

export interface CitationOccurrence {
  page: number;
  text: string;
}

export interface CitationTrail {
  sourceNodeId: string;
  targetNodeId: string;
  refId: string;
  reference: Reference;
  occurrences: CitationOccurrence[];
}

export interface CitationGraphModel {
  graph: ResearchGraph;
  trails: CitationTrail[];
}

export function emptyCitationGraph(): CitationGraphModel {
  return { graph: emptyGraph(), trails: [] };
}

export function normalizeArxivId(arxivId: string): string {
  return arxivId.trim().toLowerCase().replace(/^arxiv:\s*/, "").replace(/v\d+$/, "");
}

export function paperNodeId(manifest: Manifest): string {
  return manifest.source.arxiv_id
    ? `arxiv:${normalizeArxivId(manifest.source.arxiv_id)}`
    : `paper:${paperIdOf(manifest)}`;
}

function referenceNodeId(reference: Reference): string | null {
  return reference.openable && reference.arxiv_id
    ? `arxiv:${normalizeArxivId(reference.arxiv_id)}`
    : null;
}

function sentenceAround(text: string, surface: string): string {
  const index = text.toLowerCase().indexOf(surface.toLowerCase());
  if (index < 0) return surface;
  const before = text.slice(0, index);
  const boundary = Math.max(before.lastIndexOf(". "), before.lastIndexOf("? "), before.lastIndexOf("! "));
  const start = boundary < 0 ? 0 : boundary + 2;
  const tail = text.slice(index + surface.length);
  const endMatch = tail.match(/[.!?](?:\s|$)/);
  const end = endMatch?.index === undefined
    ? text.length
    : index + surface.length + endMatch.index + 1;
  return text.slice(start, end).replace(/\s+/g, " ").trim();
}

function occurrencesFor(analysis: PaperAnalysis, refId: string): CitationOccurrence[] {
  const occurrences: CitationOccurrence[] = [];
  analysis.citationsByPage.forEach((citations, page) => {
    const pageText = flattenPage(analysis.pageItems[page] ?? []).text;
    for (const citation of citations) {
      if (!citation.refIds.includes(refId)) continue;
      const occurrence = { page, text: sentenceAround(pageText, citation.text) };
      if (!occurrences.some((item) => item.page === page && item.text === occurrence.text)) {
        occurrences.push(occurrence);
      }
    }
  });
  return occurrences;
}

function upsertNode(graph: ResearchGraph, node: ResearchGraphNode): ResearchGraph {
  const existing = graph.nodes.find(({ id }) => id === node.id);
  if (!existing) return addNode(graph, node);
  return {
    ...graph,
    nodes: graph.nodes.map((item) => item.id === node.id ? { ...item, ...node } : item),
  };
}

export function addPaperToCitationGraph(
  model: CitationGraphModel,
  analysis: PaperAnalysis,
): CitationGraphModel {
  const sourceNodeId = paperNodeId(analysis.manifest);
  let graph = upsertNode(model.graph, {
    id: sourceNodeId,
    type: "paper",
    label: analysis.manifest.title || "Untitled paper",
    metadata: {
      loaded: true,
      paperId: paperIdOf(analysis.manifest),
      arxivId: analysis.manifest.source.arxiv_id,
    },
  });
  let trails = [...model.trails];

  for (const reference of analysis.manifest.references) {
    const targetNodeId = referenceNodeId(reference);
    if (!targetNodeId) continue;
    const occurrences = occurrencesFor(analysis, reference.ref_id);
    if (occurrences.length === 0) continue;

    graph = upsertNode(graph, {
      id: targetNodeId,
      type: "paper",
      label: reference.title || reference.raw,
      source: citationEvidence(paperIdOf(analysis.manifest), reference, occurrences[0].page),
      metadata: {
        loaded: Boolean(graph.nodes.find(({ id }) => id === targetNodeId)?.metadata.loaded),
        paperId: graph.nodes.find(({ id }) => id === targetNodeId)?.metadata.paperId ?? null,
        arxivId: reference.arxiv_id,
        refId: reference.ref_id,
      },
    });
    graph = addEdge(graph, { source: sourceNodeId, target: targetNodeId, type: "cites" });

    const trail: CitationTrail = {
      sourceNodeId,
      targetNodeId,
      refId: reference.ref_id,
      reference,
      occurrences,
    };
    const key = `${sourceNodeId}|${targetNodeId}|${reference.ref_id}`;
    trails = [...trails.filter((item) => `${item.sourceNodeId}|${item.targetNodeId}|${item.refId}` !== key), trail];
  }

  return { graph, trails };
}

export function loadedPaperRefs(model: CitationGraphModel) {
  return model.graph.nodes
    .filter((node) => node.type === "paper" && node.metadata.loaded && node.metadata.paperId)
    .map((node) => ({
      paperId: node.metadata.paperId as string,
      title: node.label,
      arxivId: (node.metadata.arxivId as string | null) ?? null,
    }));
}
