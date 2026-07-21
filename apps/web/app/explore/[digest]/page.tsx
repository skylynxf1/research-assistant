"use client";

import dynamic from "next/dynamic";
import { useParams } from "next/navigation";

/*
 * Loaded client-side only: the exploration surfaces build the mention index from pdf.js,
 * which touches DOM APIs at import. "use client" alone is not enough, because client
 * components are still server-rendered for the initial HTML.
 */
const ExploreShell = dynamic(() => import("../../../components/explore/ExploreShell"), {
  ssr: false,
  loading: () => <p className="p-8 opacity-60">Loading explorer…</p>,
});

export default function ExplorePage() {
  const params = useParams<{ digest: string }>();
  const digest = typeof params.digest === "string" ? params.digest : "";
  return <ExploreShell digest={digest} />;
}
