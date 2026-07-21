"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { blobUrl } from "../../lib/api";
import { addPaperToCitationGraph, emptyCitationGraph } from "../../lib/explore/citation-graph";
import { buildAuthorMethodNetwork } from "../../lib/explore/author-method-network";
import { browseBenchmarks, buildCollectionIndex, searchCollection, type CollectionIndexEntry } from "../../lib/explore/collection-index";
import { loadPaperAnalysis, type PaperAnalysis } from "../../lib/explore/analysis";
import { buildConstellation, buildFigureTimeline, buildLineage, buildPaperTimeline } from "../../lib/explore/research-views";
import { IndexedDbWorkspaceRepository } from "../../lib/workspace/indexed-db";
import type { ResearchCollection } from "../../lib/workspace/types";

type ResearchTab = "search" | "benchmarks" | "lineage" | "timeline" | "constellation" | "networks";
const TABS: Array<{ id: ResearchTab; label: string }> = [
  { id: "search", label: "Search" },
  { id: "benchmarks", label: "Benchmarks" },
  { id: "lineage", label: "Lineage" },
  { id: "timeline", label: "Timeline" },
  { id: "constellation", label: "Constellation" },
  { id: "networks", label: "Authors & Methods" },
];

function SourceResults({ results }: { results: CollectionIndexEntry[] }) {
  if (results.length === 0) return <p className="mt-6 text-sm opacity-60">No source matches.</p>;
  return (
    <ul className="mt-6 space-y-3">
      {results.map((result, index) => (
        <li key={`${result.paper.paperId}-${result.field}-${result.evidence.page}-${index}`} className="rounded border border-neutral-300 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="font-medium">{result.label}</h3>
            <span className="font-mono text-[0.65rem] uppercase opacity-50">{result.field} · {result.paper.title}</span>
          </div>
          <p className="mt-2 line-clamp-3 text-sm leading-relaxed opacity-70">{result.text}</p>
          <a href={`/read/${result.paper.paperId}#page=${result.evidence.page}`} className="mt-2 inline-block text-sm text-sky-700 hover:underline dark:text-sky-300">Show source, page {result.evidence.page + 1} →</a>
        </li>
      ))}
    </ul>
  );
}

export default function CollectionResearch({ collectionId }: { collectionId: string }) {
  const repository = useMemo(() => new IndexedDbWorkspaceRepository(), []);
  const [collection, setCollection] = useState<ResearchCollection | null>(null);
  const [analyses, setAnalyses] = useState<PaperAnalysis[]>([]);
  const [tab, setTab] = useState<ResearchTab>("search");
  const [query, setQuery] = useState("");
  const [benchmark, setBenchmark] = useState("");
  const [lineagePaperIds, setLineagePaperIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    repository.getCollection(collectionId).then(async (result) => {
      if (cancelled) return;
      setCollection(result);
      if (!result) return;
      const loaded = await Promise.allSettled(result.papers.map(({ paperId }) => loadPaperAnalysis(paperId)));
      if (!cancelled) setAnalyses(loaded.flatMap((item) => item.status === "fulfilled" ? [item.value] : []));
    }).catch((cause) => !cancelled && setError(cause instanceof Error ? cause.message : String(cause)));
    return () => { cancelled = true; };
  }, [collectionId, repository]);

  const index = useMemo(() => buildCollectionIndex(analyses), [analyses]);
  const citationModel = useMemo(
    () => analyses.reduce(addPaperToCitationGraph, emptyCitationGraph()),
    [analyses],
  );
  const authorMethodNetwork = useMemo(() => buildAuthorMethodNetwork(analyses), [analyses]);

  if (!collection) return <main className="p-8">{error ? <p role="alert" className="text-red-700">{error}</p> : <p className="opacity-60">Loading research views…</p>}</main>;
  const unavailable = collection.papers.filter((paper) => !analyses.some((analysis) => analysis.manifest.doc_id.endsWith(paper.paperId)));
  const paperTimeline = buildPaperTimeline(analyses);
  const figureTimeline = buildFigureTimeline(analyses);
  const loadedIds = new Set(paperTimeline.map(({ paperId }) => paperId));
  const constellation = buildConstellation(citationModel.graph, loadedIds, collection.id);
  const constellationById = new Map(constellation.nodes.map((node) => [node.id, node]));
  const lineage = buildLineage(citationModel.graph, lineagePaperIds);

  return (
    <main className="min-h-screen bg-neutral-100 p-4 dark:bg-neutral-950 dark:text-neutral-100 sm:p-8">
      <div className="mx-auto max-w-6xl">
        <header className="border-b border-neutral-300 pb-5 dark:border-neutral-800">
          <a href="/workspace" className="text-sm text-sky-700 hover:underline dark:text-sky-300">← Collections</a>
          <h1 className="mt-2 text-2xl font-semibold">{collection.name} · Research views</h1>
          <p className="mt-1 text-sm opacity-60">Deterministic views over {analyses.length} locally available {analyses.length === 1 ? "paper" : "papers"}.</p>
          {unavailable.length > 0 ? <p className="mt-2 text-sm text-amber-700 dark:text-amber-300">Unavailable locally: {unavailable.map(({ title }) => title).join(", ")}</p> : null}
        </header>
        {error ? <p role="alert" className="mt-4 text-red-700 dark:text-red-300">{error}</p> : null}

        <nav className="mt-5 flex flex-wrap gap-2" aria-label="Collection research views">
          {TABS.map((item) => <button key={item.id} type="button" onClick={() => setTab(item.id)} aria-current={tab === item.id ? "page" : undefined} className={`rounded px-3 py-2 text-sm ${tab === item.id ? "bg-sky-600 text-white" : "border border-neutral-300 bg-white dark:border-neutral-700 dark:bg-neutral-900"}`}>{item.label}</button>)}
        </nav>

        {tab === "search" ? (
          <section className="mt-6" aria-labelledby="search-heading">
            <h2 id="search-heading" className="text-xl font-semibold">Cross-paper lexical search</h2>
            <p className="mt-1 text-sm opacity-60">Titles, sections, extracted text, captions, observed references, and asset labels.</p>
            <input value={query} onChange={(event) => setQuery(event.target.value)} type="search" placeholder="Search this collection" aria-label="Search this collection" className="mt-4 w-full rounded border border-neutral-300 bg-white px-4 py-3 dark:border-neutral-700 dark:bg-neutral-900" />
            <SourceResults results={searchCollection(index, query)} />
          </section>
        ) : null}

        {tab === "benchmarks" ? (
          <section className="mt-6" aria-labelledby="benchmarks-heading">
            <h2 id="benchmarks-heading" className="text-xl font-semibold">Dataset and benchmark browser</h2>
            <p className="mt-1 text-sm opacity-60">Enter a dataset or benchmark name. Results preserve original wording; metrics are not normalized.</p>
            <input value={benchmark} onChange={(event) => setBenchmark(event.target.value)} type="search" placeholder="e.g. ImageNet" aria-label="Dataset or benchmark" className="mt-4 w-full rounded border border-neutral-300 bg-white px-4 py-3 dark:border-neutral-700 dark:bg-neutral-900" />
            <SourceResults results={browseBenchmarks(index, benchmark)} />
          </section>
        ) : null}

        {tab === "lineage" ? (
          <section className="mt-6" aria-labelledby="lineage-heading">
            <h2 id="lineage-heading" className="text-xl font-semibold">User-selected research lineage</h2>
            <p className="mt-1 text-sm opacity-60">Choose papers; only literal citation edges are present in Phase 1.</p>
            <fieldset className="mt-4 flex flex-wrap gap-2"><legend className="sr-only">Papers in lineage</legend>{paperTimeline.map((paper) => <label key={paper.paperId} className="rounded border border-neutral-300 bg-white px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"><input type="checkbox" className="mr-2" checked={lineagePaperIds.has(paper.paperId)} onChange={(event) => setLineagePaperIds((current) => { const next = new Set(current); event.target.checked ? next.add(paper.paperId) : next.delete(paper.paperId); return next; })} />{paper.title}</label>)}</fieldset>
            <div className="mt-6 grid gap-3 sm:grid-cols-2">{lineage.nodes.map((node) => <article key={node.id} className="rounded border border-neutral-300 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900"><h3 className="font-medium">{node.label}</h3><a href={`/read/${node.metadata.paperId}`} className="mt-2 inline-block text-sm text-sky-700 hover:underline dark:text-sky-300">Read source →</a></article>)}</div>
            {lineage.edges.length > 0 ? <ul className="mt-4 space-y-2">{lineage.edges.map((edge) => <li key={`${edge.source}-${edge.target}-${edge.type}`} className={`border-l-2 pl-3 text-sm ${edge.generated ? "border-dashed border-violet-500" : "border-sky-500"}`}>{edge.type === "cites" ? "Literal citation" : "Generated relationship"}: {lineage.nodes.find(({ id }) => id === edge.source)?.label} → {lineage.nodes.find(({ id }) => id === edge.target)?.label}</li>)}</ul> : <p className="mt-5 text-sm opacity-55">Select connected papers to see literal lineage edges.</p>}
          </section>
        ) : null}

        {tab === "timeline" ? (
          <section className="mt-6" aria-labelledby="timeline-heading">
            <h2 id="timeline-heading" className="text-xl font-semibold">Paper and figure timeline</h2>
            <ol className="mt-5 border-l border-sky-400 pl-5">{paperTimeline.map((paper) => <li key={paper.paperId} className="mb-6"><p className="font-mono text-xs text-sky-700 dark:text-sky-300">{paper.year ?? "Date unknown"}</p><h3 className="font-medium">{paper.title}</h3><a href={`/read/${paper.paperId}`} className="text-sm text-sky-700 hover:underline dark:text-sky-300">Open paper →</a><div className="mt-3 grid gap-3 sm:grid-cols-2">{figureTimeline.filter((item) => item.paper.paperId === paper.paperId).map(({ asset }) => <article key={asset.asset_id} className="rounded border bg-white p-3 dark:border-neutral-800 dark:bg-neutral-900"><Image unoptimized src={blobUrl(asset.image_url)} alt={asset.caption || asset.label} width={asset.image_width || 800} height={Math.max(240, Math.round((asset.image_width || 800) * 0.62))} className="h-auto w-full bg-white object-contain" /><a href={`/read/${paper.paperId}#page=${asset.page}`} className="mt-2 block text-sm text-sky-700 hover:underline dark:text-sky-300">{asset.label} · source p.{asset.page + 1}</a></article>)}</div></li>)}</ol>
          </section>
        ) : null}

        {tab === "constellation" ? (
          <section className="mt-6" aria-labelledby="constellation-heading">
            <h2 id="constellation-heading" className="text-xl font-semibold">Collection constellation</h2>
            <p className="mt-1 text-sm opacity-60">Every star has the same radius; size carries no importance claim. Lines are literal citations.</p>
            <div className="mt-5 overflow-x-auto rounded border border-neutral-300 bg-neutral-950 dark:border-neutral-800"><svg viewBox="0 0 500 440" className="min-w-[32rem] text-white" role="img" aria-label={`${constellation.nodes.length} fixed-size paper stars and ${constellation.edges.length} citation edges`}>{constellation.edges.map((edge) => { const from = constellationById.get(edge.source); const to = constellationById.get(edge.target); return from && to ? <line key={`${edge.source}-${edge.target}`} x1={from.x} y1={from.y} x2={to.x} y2={to.y} stroke="#38bdf8" strokeWidth="1" /> : null; })}{constellation.nodes.map((node) => <g key={node.id}><circle cx={node.x} cy={node.y} r={node.radius} fill="#f8fafc" /><text x={node.x} y={node.y + 24} textAnchor="middle" fill="#e2e8f0" fontSize="10">{node.label.length > 28 ? `${node.label.slice(0, 27)}…` : node.label}</text></g>)}</svg></div>
          </section>
        ) : null}

        {tab === "networks" ? (
          <section className="mt-6" aria-labelledby="networks-heading">
            <h2 id="networks-heading" className="text-xl font-semibold">Literal author and method networks</h2>
            <p className="mt-1 max-w-3xl text-sm opacity-60">Author strings and coauthor lines come only from references observed in paper text. Method nodes come only from explicit section headings; names and methods are not inferred or merged.</p>
            <div className="mt-6 grid gap-6 lg:grid-cols-2">
              <section aria-labelledby="authors-heading" className="rounded-lg border border-neutral-300 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-900">
                <h3 id="authors-heading" className="font-semibold">Referenced authors</h3>
                {authorMethodNetwork.nodes.filter(({ type }) => type === "author").length === 0 ? <p className="mt-3 text-sm opacity-55">No observed references with parsed author strings.</p> : (
                  <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                    {authorMethodNetwork.nodes.filter(({ type }) => type === "author").map((node) => <li key={node.id} className="rounded border border-neutral-200 p-3 text-sm dark:border-neutral-800"><span className="font-medium">{node.label}</span>{node.source ? <a href={`/read/${node.source.paperId}#page=${node.source.page}`} className="mt-1 block text-xs text-sky-700 hover:underline dark:text-sky-300">Observed source p.{node.source.page + 1} →</a> : null}</li>)}
                  </ul>
                )}
                <h4 className="mt-5 text-sm font-semibold">Exact coauthor links</h4>
                <ul className="mt-2 space-y-2 text-sm">{authorMethodNetwork.edges.filter(({ type }) => type === "coauthored").map((edge) => <li key={`${edge.source}-${edge.target}`} className="border-l-2 border-sky-500 pl-3">{authorMethodNetwork.nodes.find(({ id }) => id === edge.source)?.label} — {authorMethodNetwork.nodes.find(({ id }) => id === edge.target)?.label}</li>)}</ul>
              </section>
              <section aria-labelledby="methods-heading" className="rounded-lg border border-neutral-300 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-900">
                <h3 id="methods-heading" className="font-semibold">Explicit method sections</h3>
                {authorMethodNetwork.nodes.filter(({ type }) => type === "method").length === 0 ? <p className="mt-3 text-sm opacity-55">No section heading explicitly names a method, approach, architecture, or model.</p> : (
                  <ul className="mt-3 space-y-3">{authorMethodNetwork.nodes.filter(({ type }) => type === "method").map((node) => <li key={node.id} className="rounded border border-neutral-200 p-3 text-sm dark:border-neutral-800"><span className="font-medium">{node.label}</span><span className="mt-1 block text-xs opacity-55">{String(node.metadata.paperTitle || "Paper")}</span>{node.source ? <a href={`/read/${node.source.paperId}#page=${node.source.page}`} className="mt-2 block text-xs text-sky-700 hover:underline dark:text-sky-300">Open method heading on p.{node.source.page + 1} →</a> : null}</li>)}</ul>
                )}
              </section>
            </div>
          </section>
        ) : null}
      </div>
    </main>
  );
}
