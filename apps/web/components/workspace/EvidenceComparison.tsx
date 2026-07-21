"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { blobUrl, loadManifest } from "../../lib/api";
import { evidenceKey, type SourceEvidence } from "../../lib/evidence/source";
import type { Manifest } from "../../lib/manifest";
import { saveComparison } from "../../lib/workspace/board";
import { evidenceCandidates, evidenceLabel } from "../../lib/workspace/evidence";
import { IndexedDbWorkspaceRepository } from "../../lib/workspace/indexed-db";
import type { ResearchCollection } from "../../lib/workspace/types";

export default function EvidenceComparison({ collectionId }: { collectionId: string }) {
  const repository = useMemo(() => new IndexedDbWorkspaceRepository(), []);
  const [collection, setCollection] = useState<ResearchCollection | null>(null);
  const [manifests, setManifests] = useState<Map<string, Manifest>>(new Map());
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    repository.getCollection(collectionId).then(async (result) => {
      if (cancelled) return;
      setCollection(result);
      if (!result) return;
      const ids = new Set(evidenceCandidates(result).map(({ paperId }) => paperId));
      const loaded = await Promise.allSettled([...ids].map(async (id) => [id, await loadManifest(id)] as const));
      if (!cancelled) setManifests(new Map(loaded.flatMap((item) => item.status === "fulfilled" ? [item.value] : [])));
    }).catch((cause) => !cancelled && setError(cause instanceof Error ? cause.message : String(cause)));
    return () => { cancelled = true; };
  }, [collectionId, repository]);

  if (!collection) return <main className="p-8">{error ? <p role="alert" className="text-red-700">{error}</p> : <p className="opacity-60">Loading comparison…</p>}</main>;
  const candidates = evidenceCandidates(collection);
  const chosen = candidates.filter((item) => selected.has(evidenceKey(item)));

  const save = async () => {
    try { setCollection(await repository.saveCollection(saveComparison(collection, chosen))); }
    catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
  };

  const evidenceCard = (item: SourceEvidence) => {
    const manifest = manifests.get(item.paperId) ?? null;
    const asset = item.assetId ? manifest?.assets.find(({ asset_id }) => asset_id === item.assetId) : null;
    return (
      <article key={evidenceKey(item)} className="rounded-lg border border-neutral-300 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
        <h3 className="font-medium">{evidenceLabel(item, manifest)}</h3>
        {asset?.image_url ? <Image unoptimized src={blobUrl(asset.image_url)} alt={asset.caption || asset.label} width={asset.image_width || 800} height={Math.max(240, Math.round((asset.image_width || 800) * 0.62))} className="mt-3 h-auto w-full rounded border bg-white object-contain" /> : null}
        <p className="mt-3 text-sm leading-relaxed opacity-75">{item.text || asset?.caption || "Source pointer; open the paper for the original content."}</p>
        {manifest ? <a href={`/read/${item.paperId}#page=${item.page}`} className="mt-3 inline-block text-sm text-sky-700 hover:underline dark:text-sky-300">Show source, page {item.page + 1} →</a> : <p className="mt-3 text-sm text-amber-700 dark:text-amber-300">Source unavailable locally</p>}
      </article>
    );
  };

  return (
    <main className="min-h-screen bg-neutral-100 p-4 dark:bg-neutral-950 dark:text-neutral-100 sm:p-8">
      <div className="mx-auto max-w-7xl">
        <header className="border-b border-neutral-300 pb-5 dark:border-neutral-800">
          <a href={`/workspace/collections/${collection.id}/board`} className="text-sm text-sky-700 hover:underline dark:text-sky-300">← Pinboard</a>
          <h1 className="mt-2 text-2xl font-semibold">{collection.name} · Evidence comparison</h1>
          <p className="mt-1 text-sm opacity-60">Select original evidence. Marginalia does not generate a verdict or normalize metrics.</p>
        </header>
        {error ? <p role="alert" className="mt-4 text-red-700 dark:text-red-300">{error}</p> : null}
        {candidates.length === 0 ? <p className="mt-8 rounded border border-dashed p-8 text-center opacity-60">Add source-linked cards or notes before comparing.</p> : (
          <>
            <fieldset className="mt-6 grid gap-2 rounded-lg border border-neutral-300 bg-white p-4 sm:grid-cols-2 dark:border-neutral-800 dark:bg-neutral-900">
              <legend className="px-2 text-sm font-medium">Evidence to compare</legend>
              {candidates.map((item) => {
                const key = evidenceKey(item); return <label key={key} className="flex gap-2 rounded border p-3 text-sm"><input type="checkbox" checked={selected.has(key)} onChange={(event) => setSelected((current) => { const next = new Set(current); event.target.checked ? next.add(key) : next.delete(key); return next; })} /><span>{evidenceLabel(item, manifests.get(item.paperId) ?? null)}</span></label>;
              })}
              <button type="button" disabled={chosen.length < 2} onClick={() => void save()} className="rounded bg-sky-600 px-4 py-2 text-sm text-white disabled:opacity-40 sm:col-span-2">Save comparison ({chosen.length})</button>
            </fieldset>
            <section className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3" aria-label="Selected evidence side by side">{chosen.map(evidenceCard)}</section>
          </>
        )}
      </div>
    </main>
  );
}
