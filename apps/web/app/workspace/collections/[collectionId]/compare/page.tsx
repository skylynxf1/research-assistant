"use client";

import dynamic from "next/dynamic";
import { useParams } from "next/navigation";

const EvidenceComparison = dynamic(() => import("../../../../../components/workspace/EvidenceComparison"), { ssr: false });

export default function ComparisonPage() {
  const { collectionId } = useParams<{ collectionId: string }>();
  return <EvidenceComparison collectionId={collectionId} />;
}
