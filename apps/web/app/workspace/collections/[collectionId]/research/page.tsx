"use client";

import dynamic from "next/dynamic";
import { useParams } from "next/navigation";

const CollectionResearch = dynamic(() => import("../../../../../components/workspace/CollectionResearch"), { ssr: false });

export default function CollectionResearchPage() {
  const { collectionId } = useParams<{ collectionId: string }>();
  return <CollectionResearch collectionId={collectionId} />;
}
