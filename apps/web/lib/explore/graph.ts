/**
 * The shared research graph — expansion doc §16.
 *
 * One model backs the citation graph, lineage, timeline and constellation views, so each
 * visualization does not invent its own data shape.
 *
 * §16's critical rule, and the reason `type` and `generated` are not optional decoration:
 *
 * > Citation != semantic similarity != chronology != user-created relation.
 *
 * A literal citation, an inferred relationship and a line the user drew must never look
 * identical. Renderers are expected to distinguish them — solid for literal, dashed for
 * generated, distinct styling for user-created — and they can only do that if the data
 * says which is which. All operations here are pure; callers hold the graph.
 */

import type { SourceEvidence } from "../evidence/source";

export type ResearchGraphNodeType =
  | "paper"
  | "section"
  | "concept"
  | "figure"
  | "table"
  | "author"
  | "dataset";

export type ResearchGraphEdgeType =
  | "cites"
  | "contains"
  | "mentions"
  | "uses"
  | "user-connected"
  | "generated-related";

export interface ResearchGraphNode {
  id: string;
  type: ResearchGraphNodeType;
  label: string;
  /** Where this node came from in a real document, so it stays traceable. */
  source?: SourceEvidence;
  metadata: Record<string, unknown>;
}

export interface ResearchGraphEdge {
  source: string;
  target: string;
  type: ResearchGraphEdgeType;
  /** True only for inferred relationships. Renderers must not draw these as citations. */
  generated?: boolean;
}

export interface ResearchGraph {
  nodes: ResearchGraphNode[];
  edges: ResearchGraphEdge[];
}

export function emptyGraph(): ResearchGraph {
  return { nodes: [], edges: [] };
}

export function hasNode(graph: ResearchGraph, id: string): boolean {
  return graph.nodes.some((node) => node.id === id);
}

/** Add a node, ignoring one already present. Exploration revisits papers constantly. */
export function addNode(graph: ResearchGraph, node: ResearchGraphNode): ResearchGraph {
  if (hasNode(graph, node.id)) return graph;
  return { nodes: [...graph.nodes, node], edges: graph.edges };
}

export function addNodes(graph: ResearchGraph, nodes: ResearchGraphNode[]): ResearchGraph {
  return nodes.reduce(addNode, graph);
}

/**
 * Add an edge between two nodes that already exist.
 *
 * An edge with a missing endpoint is dropped rather than drawn: precision over recall
 * (§1.3). A line to nowhere reads as a relationship the underlying data does not support.
 * Identity is (source, target, type), so a citation and a user-drawn line between the
 * same two papers are two edges, not one.
 */
export function addEdge(graph: ResearchGraph, edge: ResearchGraphEdge): ResearchGraph {
  if (!hasNode(graph, edge.source) || !hasNode(graph, edge.target)) return graph;

  const exists = graph.edges.some(
    (existing) =>
      existing.source === edge.source &&
      existing.target === edge.target &&
      existing.type === edge.type,
  );
  if (exists) return graph;

  return { nodes: graph.nodes, edges: [...graph.edges, edge] };
}

export function addEdges(graph: ResearchGraph, edges: ResearchGraphEdge[]): ResearchGraph {
  return edges.reduce(addEdge, graph);
}

/** Every edge touching `nodeId`, in either direction. */
export function edgesOf(graph: ResearchGraph, nodeId: string): ResearchGraphEdge[] {
  return graph.edges.filter((edge) => edge.source === nodeId || edge.target === nodeId);
}

export function neighbors(graph: ResearchGraph, nodeId: string): ResearchGraphNode[] {
  const ids = new Set(
    edgesOf(graph, nodeId).map((edge) => (edge.source === nodeId ? edge.target : edge.source)),
  );
  return graph.nodes.filter((node) => ids.has(node.id));
}

export function nodeById(graph: ResearchGraph, id: string): ResearchGraphNode | null {
  return graph.nodes.find((node) => node.id === id) ?? null;
}
