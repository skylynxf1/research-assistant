import { paperRefOf, type PaperRef } from "../evidence/source";
import type { Asset, Manifest } from "../manifest";
import type { PaperAnalysis } from "./analysis";
import type { ResearchGraph, ResearchGraphEdge, ResearchGraphNode } from "./graph";

export function paperYear(manifest: Manifest): number | null {
  const id = manifest.source.arxiv_id?.replace(/v\d+$/, "") ?? "";
  const modern = id.match(/^(\d{2})\d{2}\./);
  const legacy = id.match(/^[a-z.-]+\/(\d{2})/i);
  const twoDigits = modern?.[1] ?? legacy?.[1];
  if (!twoDigits) return null;
  const year = Number(twoDigits);
  return year >= 91 ? 1900 + year : 2000 + year;
}

export interface PaperTimelineEntry extends PaperRef {
  year: number | null;
}

export function buildPaperTimeline(analyses: readonly PaperAnalysis[]): PaperTimelineEntry[] {
  return analyses
    .map((analysis) => ({ ...paperRefOf(analysis.manifest), year: paperYear(analysis.manifest) }))
    .sort((a, b) => (a.year ?? Number.POSITIVE_INFINITY) - (b.year ?? Number.POSITIVE_INFINITY) || a.title.localeCompare(b.title));
}

export interface FigureTimelineEntry {
  paper: PaperRef;
  year: number | null;
  asset: Asset;
}

export function buildFigureTimeline(analyses: readonly PaperAnalysis[]): FigureTimelineEntry[] {
  return analyses
    .flatMap((analysis) => analysis.manifest.assets
      .filter((asset) => asset.kind === "figure")
      .map((asset) => ({ paper: paperRefOf(analysis.manifest), year: paperYear(analysis.manifest), asset })))
    .sort((a, b) => (a.year ?? Number.POSITIVE_INFINITY) - (b.year ?? Number.POSITIVE_INFINITY) || a.asset.page - b.asset.page);
}

function selectedNodeIds(graph: ResearchGraph, paperIds: ReadonlySet<string>): Set<string> {
  return new Set(graph.nodes
    .filter((node) => node.type === "paper" && typeof node.metadata.paperId === "string" && paperIds.has(node.metadata.paperId))
    .map(({ id }) => id));
}

export function buildLineage(graph: ResearchGraph, paperIds: ReadonlySet<string>): ResearchGraph {
  const ids = selectedNodeIds(graph, paperIds);
  return {
    nodes: graph.nodes.filter(({ id }) => ids.has(id)),
    edges: graph.edges.filter((edge) => ids.has(edge.source) && ids.has(edge.target)),
  };
}

export interface ConstellationNode extends ResearchGraphNode {
  x: number;
  y: number;
  radius: 9;
  clusterId: string;
}

export interface ConstellationModel {
  nodes: ConstellationNode[];
  edges: ResearchGraphEdge[];
  radiusMeaning: "fixed display size; no importance encoding";
}

export function buildConstellation(
  graph: ResearchGraph,
  paperIds: ReadonlySet<string>,
  collectionId: string,
): ConstellationModel {
  const lineage = buildLineage(graph, paperIds);
  const count = Math.max(1, lineage.nodes.length);
  return {
    nodes: lineage.nodes.map((node, index) => {
      const angle = -Math.PI / 2 + (index * Math.PI * 2) / count;
      return {
        ...node,
        x: 250 + Math.cos(angle) * 170,
        y: 220 + Math.sin(angle) * 150,
        radius: 9,
        clusterId: collectionId,
      };
    }),
    edges: lineage.edges.filter((edge) => edge.type === "cites"),
    radiusMeaning: "fixed display size; no importance encoding",
  };
}
