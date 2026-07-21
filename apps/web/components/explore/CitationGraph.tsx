"use client";

import { useMemo, useState } from "react";
import { digestOf, fetchArxiv } from "../../lib/api";
import { loadPaperAnalysis, type PaperAnalysis } from "../../lib/explore/analysis";
import {
  addPaperToCitationGraph,
  emptyCitationGraph,
  paperNodeId,
  type CitationGraphModel,
} from "../../lib/explore/citation-graph";

interface Props {
  analysis: PaperAnalysis;
  digest: string;
}

function positions(model: CitationGraphModel): Map<string, { x: number; y: number }> {
  const result = new Map<string, { x: number; y: number }>();
  model.graph.nodes.forEach((node, index) => {
    if (index === 0) result.set(node.id, { x: 400, y: 65 });
    else {
      const offset = index - 1;
      const column = offset % 4;
      const row = Math.floor(offset / 4);
      result.set(node.id, { x: 110 + column * 195, y: 180 + row * 110 });
    }
  });
  return result;
}

export default function CitationGraph({ analysis, digest }: Props) {
  const [model, setModel] = useState(() => addPaperToCitationGraph(emptyCitationGraph(), analysis));
  const [selectedId, setSelectedId] = useState(() => paperNodeId(analysis.manifest));
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const layout = useMemo(() => positions(model), [model]);
  const selected = model.graph.nodes.find(({ id }) => id === selectedId) ?? model.graph.nodes[0];
  const trails = model.trails.filter(
    (trail) => trail.sourceNodeId === selected?.id || trail.targetNodeId === selected?.id,
  );

  const expand = async (nodeId: string) => {
    const node = model.graph.nodes.find(({ id }) => id === nodeId);
    const arxivId = node?.metadata.arxivId;
    if (!node || node.metadata.loaded || typeof arxivId !== "string" || loadingId) return;
    setLoadingId(nodeId);
    setError(null);
    try {
      const manifest = await fetchArxiv(arxivId);
      const citedAnalysis = await loadPaperAnalysis(digestOf(manifest));
      setModel((current) => addPaperToCitationGraph(current, citedAnalysis));
      setSelectedId(nodeId);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setLoadingId(null);
    }
  };

  if (model.graph.edges.length === 0) {
    return (
      <section className="mx-auto max-w-4xl p-8" aria-labelledby="citation-graph-heading">
        <h2 id="citation-graph-heading" className="text-2xl font-semibold">Citation graph</h2>
        <p className="mt-2 opacity-65">No directly openable references were found in the paper body.</p>
        <a href={`/read/${digest}`} className="mt-4 inline-block text-sm text-sky-700 hover:underline dark:text-sky-300">Return to the paper</a>
      </section>
    );
  }

  const graphHeight = Math.max(310, 250 + Math.ceil((model.graph.nodes.length - 1) / 4) * 110);

  return (
    <section className="mx-auto max-w-6xl px-5 py-8 sm:px-8" aria-labelledby="citation-graph-heading">
      <header className="mb-6 border-b border-neutral-300 pb-5 dark:border-neutral-800">
        <p className="font-mono text-[0.65rem] uppercase tracking-[0.2em] text-sky-700 dark:text-sky-400">Literal references · one hop at a time</p>
        <h2 id="citation-graph-heading" className="mt-2 text-2xl font-semibold">Citation graph</h2>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed opacity-65">Every solid line is an observed citation. Select a paper to inspect its source trail; load a cited paper only when you want to expand it.</p>
      </header>

      {error ? <p role="alert" className="mb-5 rounded border border-red-300 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">Could not expand the cited paper: {error}</p> : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(18rem,0.8fr)]">
        <div className="overflow-x-auto rounded-lg border border-neutral-300 bg-white dark:border-neutral-800 dark:bg-neutral-900">
          <svg viewBox={`0 0 800 ${graphHeight}`} className="min-w-[48rem]" role="img" aria-label={`${model.graph.nodes.length} papers connected by ${model.graph.edges.length} literal citations`}>
            {model.graph.edges.map((edge) => {
              const from = layout.get(edge.source);
              const to = layout.get(edge.target);
              return from && to ? <line key={`${edge.source}-${edge.target}`} x1={from.x} y1={from.y} x2={to.x} y2={to.y} stroke="currentColor" strokeWidth="1.5" className="text-sky-500" /> : null;
            })}
            {model.graph.nodes.map((node) => {
              const point = layout.get(node.id);
              if (!point) return null;
              return (
                <g key={node.id} aria-hidden="true">
                  <circle cx={point.x} cy={point.y} r="18" className={node.id === selectedId ? "fill-sky-600" : node.metadata.loaded ? "fill-neutral-700 dark:fill-neutral-200" : "fill-white stroke-sky-500 stroke-2 dark:fill-neutral-900"} />
                  <text x={point.x} y={point.y + 34} textAnchor="middle" className="fill-current text-[11px]">{node.label.length > 28 ? `${node.label.slice(0, 27)}…` : node.label}</text>
                </g>
              );
            })}
          </svg>
          <ul className="grid gap-2 border-t border-neutral-200 p-4 sm:grid-cols-2 dark:border-neutral-800">
            {model.graph.nodes.map((node) => (
              <li key={node.id}>
                <button type="button" onClick={() => setSelectedId(node.id)} aria-pressed={selectedId === node.id} className="w-full rounded border border-neutral-300 px-3 py-2 text-left text-sm hover:bg-neutral-100 aria-pressed:border-sky-500 aria-pressed:bg-sky-50 dark:border-neutral-700 dark:hover:bg-neutral-800 dark:aria-pressed:bg-sky-950">
                  <span className="block truncate font-medium">{node.label}</span>
                  <span className="font-mono text-[0.65rem] uppercase opacity-50">{node.metadata.loaded ? "Loaded paper" : "Openable reference"}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>

        <aside className="rounded-lg border border-neutral-300 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-900" aria-live="polite">
          <p className="font-mono text-[0.65rem] uppercase tracking-[0.16em] opacity-50">Selected paper</p>
          <h3 className="mt-2 text-lg font-semibold">{selected?.label}</h3>
          {selected?.metadata.loaded ? (
            <a href={`/read/${selected.metadata.paperId}`} className="mt-3 inline-block text-sm text-sky-700 hover:underline dark:text-sky-300">Read loaded paper →</a>
          ) : (
            <button type="button" disabled={loadingId !== null} onClick={() => selected && void expand(selected.id)} className="mt-3 rounded bg-sky-600 px-3 py-2 text-sm text-white hover:bg-sky-500 disabled:opacity-50">{loadingId === selected?.id ? "Loading and analysing…" : "Load and expand one hop"}</button>
          )}

          <h4 className="mt-6 text-sm font-semibold">Citation trail</h4>
          {trails.length === 0 ? <p className="mt-2 text-sm opacity-55">No trail touches this paper yet.</p> : (
            <ul className="mt-3 space-y-4">
              {trails.map((trail) => (
                <li key={`${trail.sourceNodeId}-${trail.refId}`} className="border-l-2 border-sky-400 pl-3 text-sm">
                  <p className="font-medium">{trail.reference.title || trail.reference.raw}</p>
                  <ul className="mt-2 space-y-2">
                    {trail.occurrences.map((occurrence, index) => (
                      <li key={`${occurrence.page}-${index}`}>
                        <q className="opacity-75">{occurrence.text}</q>
                        <a href={`/read/${model.graph.nodes.find(({ id }) => id === trail.sourceNodeId)?.metadata.paperId}#page=${occurrence.page}`} className="mt-1 block font-mono text-[0.68rem] text-sky-700 hover:underline dark:text-sky-300">Source p.{occurrence.page + 1} →</a>
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          )}
        </aside>
      </div>
    </section>
  );
}
