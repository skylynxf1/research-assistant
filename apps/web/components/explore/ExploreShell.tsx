"use client";

import { useEffect, useState } from "react";
import { loadPaperAnalysis, type PaperAnalysis } from "../../lib/explore/analysis";
import FigureAtlas from "./FigureAtlas";
import PaperMap from "./PaperMap";
import CitationGraph from "./CitationGraph";

/**
 * Host for the exploration surfaces (§25).
 *
 * Kept as its own route rather than a panel inside the reader, so Developer B's work
 * lands without touching Reader.tsx (§18). Tabs are added here as each surface is built;
 * a surface that does not exist yet is not listed, rather than shown disabled — the same
 * "never render a dead affordance" rule the reader follows.
 */

export type ExploreTab = "figures" | "paper-map" | "citations";

const TABS: { key: ExploreTab; label: string }[] = [
  { key: "figures", label: "Figures" },
  { key: "paper-map", label: "Paper Map" },
  { key: "citations", label: "Citations" },
];

export default function ExploreShell({ digest }: { digest: string }) {
  const [analysis, setAnalysis] = useState<PaperAnalysis | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<ExploreTab>("figures");

  useEffect(() => {
    let cancelled = false;
    loadPaperAnalysis(digest)
      .then((result) => {
        if (!cancelled) setAnalysis(result);
      })
      .catch((cause) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : String(cause));
      });
    return () => {
      cancelled = true;
    };
  }, [digest]);

  if (error) {
    return <p className="p-8 text-red-600">Could not open this paper: {error}</p>;
  }
  if (!analysis) {
    return <p className="p-8 opacity-60">Reading paper…</p>;
  }

  return (
    <div className="min-h-screen bg-neutral-100 dark:bg-neutral-950 dark:text-neutral-100">
      <header className="flex items-center gap-4 border-b border-neutral-300 bg-white px-4 py-2 dark:border-neutral-800 dark:bg-neutral-900">
        <a
          href={`/read/${digest}`}
          className="rounded px-2 py-1 text-sm hover:bg-neutral-200 dark:hover:bg-neutral-800"
          title="Back to the paper"
        >
          ← Read
        </a>
        <h1 className="truncate text-sm font-medium">
          {analysis.manifest.title || "Untitled paper"}
        </h1>

        <a
          href={`/workspace/${digest}`}
          className="rounded px-2 py-1 text-sm hover:bg-neutral-200 dark:hover:bg-neutral-800"
        >
          Workspace
        </a>

        <a
          href={`/reflow/${digest}`}
          className="rounded px-2 py-1 text-sm hover:bg-neutral-200 dark:hover:bg-neutral-800"
        >
          Reflow
        </a>

        <nav className="ml-auto flex gap-1" aria-label="Exploration views">
          {TABS.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              aria-current={tab === key ? "page" : undefined}
              className={`rounded px-3 py-1 text-sm ${
                tab === key
                  ? "bg-sky-600 text-white"
                  : "hover:bg-neutral-200 dark:hover:bg-neutral-800"
              }`}
            >
              {label}
            </button>
          ))}
        </nav>
      </header>

      <main>
        {tab === "figures" && <FigureAtlas analysis={analysis} digest={digest} />}
        {tab === "paper-map" && <PaperMap analysis={analysis} digest={digest} />}
        {tab === "citations" && <CitationGraph analysis={analysis} digest={digest} />}
      </main>
    </div>
  );
}
