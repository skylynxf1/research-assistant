"use client";

import dynamic from "next/dynamic";
import { useParams } from "next/navigation";

const WorkspacePinboard = dynamic(() => import("../../../../../components/workspace/WorkspacePinboard"), { ssr: false });

export default function PinboardPage() {
  const { collectionId } = useParams<{ collectionId: string }>();
  return <WorkspacePinboard collectionId={collectionId} />;
}
