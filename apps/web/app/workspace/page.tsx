"use client";

import dynamic from "next/dynamic";

const WorkspaceShell = dynamic(() => import("../../components/workspace/WorkspaceShell"), {
  ssr: false,
  loading: () => <p className="p-8 opacity-60">Loading workspace…</p>,
});

export default function WorkspacePage() {
  return <WorkspaceShell />;
}
