import { evidenceKey, type SourceEvidence } from "../evidence/source";
import type { Manifest } from "../manifest";
import type { ResearchCollection } from "./types";

export function evidenceCandidates(collection: ResearchCollection): SourceEvidence[] {
  const candidates = [
    ...collection.pinnedEvidence,
    ...collection.boardNodes.flatMap((node) => node.source ? [node.source] : []),
    ...collection.notes.flatMap((note) => note.source ? [note.source] : []),
  ];
  return [...new Map(candidates.map((item) => [evidenceKey(item), item])).values()];
}

export function evidenceLabel(evidence: SourceEvidence, manifest: Manifest | null): string {
  const asset = evidence.assetId
    ? manifest?.assets.find(({ asset_id }) => asset_id === evidence.assetId)
    : null;
  if (asset) return `${asset.label} · page ${evidence.page + 1}`;
  const detail = evidence.assetId ? ` · ${evidence.assetId}` : "";
  return `${evidence.kind}${detail} · page ${evidence.page + 1}`;
}
