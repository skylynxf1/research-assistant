import { evidenceKey, type SourceEvidence } from "../evidence/source";
import type { BoardNode, ResearchCollection } from "./types";

type IdentityOptions = { id?: string; now?: number };
const newId = () => globalThis.crypto.randomUUID();

export function addBoardNode(
  collection: ResearchCollection,
  node: BoardNode,
  now = Date.now(),
): ResearchCollection {
  if (collection.boardNodes.some(({ id }) => id === node.id)) return collection;
  return { ...collection, boardNodes: [...collection.boardNodes, node], updatedAt: now };
}

export function moveBoardNode(
  collection: ResearchCollection,
  nodeId: string,
  position: { x: number; y: number },
  now = Date.now(),
): ResearchCollection {
  if (!collection.boardNodes.some(({ id }) => id === nodeId)) return collection;
  return {
    ...collection,
    boardNodes: collection.boardNodes.map((node) =>
      node.id === nodeId
        ? { ...node, x: Math.max(0, position.x), y: Math.max(0, position.y) }
        : node,
    ),
    updatedAt: now,
  };
}

export function removeBoardNode(
  collection: ResearchCollection,
  nodeId: string,
  now = Date.now(),
): ResearchCollection {
  if (!collection.boardNodes.some(({ id }) => id === nodeId)) return collection;
  return {
    ...collection,
    boardNodes: collection.boardNodes.filter(({ id }) => id !== nodeId),
    boardEdges: collection.boardEdges.filter(
      (edge) => edge.sourceNodeId !== nodeId && edge.targetNodeId !== nodeId,
    ),
    updatedAt: now,
  };
}

export function connectBoardNodes(
  collection: ResearchCollection,
  sourceNodeId: string,
  targetNodeId: string,
  options: IdentityOptions = {},
): ResearchCollection {
  const ids = new Set(collection.boardNodes.map(({ id }) => id));
  if (sourceNodeId === targetNodeId || !ids.has(sourceNodeId) || !ids.has(targetNodeId)) {
    return collection;
  }
  const exists = collection.boardEdges.some(
    (edge) =>
      (edge.sourceNodeId === sourceNodeId && edge.targetNodeId === targetNodeId) ||
      (edge.sourceNodeId === targetNodeId && edge.targetNodeId === sourceNodeId),
  );
  if (exists) return collection;
  return {
    ...collection,
    boardEdges: [
      ...collection.boardEdges,
      {
        id: options.id ?? newId(),
        sourceNodeId,
        targetNodeId,
        type: "user-connected",
      },
    ],
    updatedAt: options.now ?? Date.now(),
  };
}

export function addPinnedEvidence(
  collection: ResearchCollection,
  evidence: SourceEvidence,
  now = Date.now(),
): ResearchCollection {
  const key = evidenceKey(evidence);
  if (collection.pinnedEvidence.some((item) => evidenceKey(item) === key)) return collection;
  return { ...collection, pinnedEvidence: [...collection.pinnedEvidence, evidence], updatedAt: now };
}

export function saveComparison(
  collection: ResearchCollection,
  evidence: SourceEvidence[],
  options: IdentityOptions = {},
): ResearchCollection {
  const distinct = [...new Map(evidence.map((item) => [evidenceKey(item), item])).values()];
  if (distinct.length < 2) return collection;
  const now = options.now ?? Date.now();
  return {
    ...collection,
    comparisons: [
      ...collection.comparisons,
      { id: options.id ?? newId(), evidence: distinct, createdAt: now },
    ],
    updatedAt: now,
  };
}
