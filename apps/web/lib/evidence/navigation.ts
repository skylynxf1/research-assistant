import type { NormalizedBBox, SourceEvidence } from "./source";

export interface EvidenceTarget {
  paperId: string;
  page: number;
  assetId?: string;
  bbox?: NormalizedBBox;
}

export function evidenceTarget(
  evidence: SourceEvidence,
  paperPageCounts: Record<string, number>,
): EvidenceTarget | null {
  const pageCount = paperPageCounts[evidence.paperId];
  if (evidence.page < 0 || pageCount === undefined || evidence.page >= pageCount) return null;
  return {
    paperId: evidence.paperId,
    page: evidence.page,
    ...(evidence.assetId ? { assetId: evidence.assetId } : {}),
    ...(evidence.bbox ? { bbox: evidence.bbox } : {}),
  };
}
