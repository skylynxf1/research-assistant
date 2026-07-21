"use client";

import dynamic from "next/dynamic";
import { useParams } from "next/navigation";

const WorkspaceShell = dynamic(() => import("../../../components/workspace/WorkspaceShell"), {
  ssr: false,
  loading: () => <p className="p-8 opacity-60">Loading workspace…</p>,
});

export default function PaperWorkspacePage() {
  const params = useParams<{ digest: string }>();
  const digest = typeof params.digest === "string" ? params.digest : "";
  return <WorkspaceShell digest={digest} />;
}
