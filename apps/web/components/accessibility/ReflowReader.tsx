"use client";

import { createElement, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { digestOf, fetchArxiv } from "../../lib/api";
import { buildReflowDocument, type ReflowBlock } from "../../lib/accessibility/reflow";
import { loadPaperAnalysis, type PaperAnalysis } from "../../lib/explore/analysis";
import type { Reference } from "../../lib/manifest";

function HeadingBlock({ block, digest }: { block: Extract<ReflowBlock, { type: "heading" }>; digest: string }) {
  return createElement(
    `h${block.level}`,
    {
      id: block.sectionId,
      className: "group mt-10 scroll-mt-6 font-semibold tracking-tight first:mt-0",
    },
    block.title,
    createElement(
      "a",
      {
        href: `/read/${digest}#page=${block.page}`,
        className: "ml-3 align-middle font-mono text-[0.65rem] font-normal text-sky-700 opacity-70 hover:underline dark:text-sky-300",
        "aria-label": `Open ${block.title} in the PDF on page ${block.page + 1}`,
      },
      `PDF p.${block.page + 1}`,
    ),
  );
}

export default function ReflowReader({ digest }: { digest: string }) {
  const router = useRouter();
  const [analysis, setAnalysis] = useState<PaperAnalysis | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openingRefId, setOpeningRefId] = useState<string | null>(null);

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

  const document = useMemo(
    () => analysis
      ? buildReflowDocument(
          analysis.manifest,
          analysis.pageItems,
          analysis.mentionsByPage,
          analysis.citationsByPage,
        )
      : null,
    [analysis],
  );

  const openReference = async (reference: Reference) => {
    if (!reference.openable || !reference.arxiv_id || openingRefId) return;
    setOpeningRefId(reference.ref_id);
    setError(null);
    try {
      router.push(`/read/${digestOf(await fetchArxiv(reference.arxiv_id))}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      setOpeningRefId(null);
    }
  };

  if (error && !analysis) {
    return <main className="mx-auto max-w-3xl p-8"><p role="alert" className="text-red-700 dark:text-red-300">Could not build reader view: {error}</p></main>;
  }
  if (!analysis || !document) {
    return <main className="mx-auto max-w-3xl p-8"><p className="opacity-60">Building reader view…</p></main>;
  }

  if (document.status === "uncertain") {
    return (
      <main className="min-h-screen bg-neutral-50 px-5 py-12 dark:bg-neutral-950 dark:text-neutral-100">
        <section className="mx-auto max-w-2xl rounded-lg border border-amber-300 bg-amber-50 p-6 dark:border-amber-900 dark:bg-amber-950/40">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-amber-800 dark:text-amber-300">Original layout recommended</p>
          <h1 className="mt-3 text-2xl font-semibold">Reading order is uncertain</h1>
          <p className="mt-3 leading-relaxed opacity-75">
            This paper’s column geometry cannot be reordered with enough confidence. Marginalia will not present a plausible-looking but broken text order.
          </p>
          <a href={`/read/${digest}`} className="mt-6 inline-block rounded bg-neutral-900 px-4 py-2 text-sm text-white hover:bg-neutral-700 dark:bg-white dark:text-neutral-950">Read the original PDF</a>
        </section>
      </main>
    );
  }

  const assetById = new Map(analysis.manifest.assets.map((asset) => [asset.asset_id, asset]));
  const referenceById = new Map(analysis.manifest.references.map((reference) => [reference.ref_id, reference]));

  return (
    <main className="min-h-screen bg-neutral-50 px-5 py-8 text-neutral-950 dark:bg-neutral-950 dark:text-neutral-100 sm:px-8">
      <article className="mx-auto max-w-[44rem]">
        <header className="mb-10 border-b border-neutral-300 pb-8 dark:border-neutral-800">
          <nav className="mb-6 flex flex-wrap gap-4 text-sm" aria-label="Paper views">
            <a href={`/read/${digest}`} className="text-sky-700 hover:underline dark:text-sky-300">← Original PDF</a>
            <a href={`/explore/${digest}`} className="text-sky-700 hover:underline dark:text-sky-300">Explore paper</a>
          </nav>
          <p className="font-mono text-[0.68rem] uppercase tracking-[0.2em] opacity-55">Semantic reader view · source text only</p>
          <h1 className="mt-3 text-3xl font-semibold leading-tight tracking-tight">{analysis.manifest.title || "Untitled paper"}</h1>
        </header>

        {error ? <p role="alert" className="mb-6 rounded border border-red-300 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">{error}</p> : null}

        <div className="text-[1.05rem] leading-[1.8]">
          {document.blocks.map((block, index) => {
            if (block.type === "heading") {
              return <HeadingBlock key={`${block.sectionId}-${index}`} block={block} digest={digest} />;
            }

            const assets = block.assetIds.map((id) => assetById.get(id)).filter(Boolean);
            const references = block.citations
              .flatMap((citation) => citation.refIds.map((id) => referenceById.get(id)))
              .filter((reference): reference is Reference => Boolean(reference?.openable && reference.arxiv_id));
            return (
              <section key={`paragraph-${block.page}-${index}`} className="group mt-5" aria-label={`Source paragraph, PDF page ${block.page + 1}`}>
                <p>{block.text}</p>
                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2 text-xs">
                  <a href={`/read/${digest}#page=${block.page}`} className="font-mono text-sky-700 opacity-75 hover:underline dark:text-sky-300">Source p.{block.page + 1} →</a>
                  {assets.map((asset) => asset ? (
                    <a key={asset.asset_id} href={`/read/${digest}#page=${asset.page}`} className="rounded border border-sky-300 px-2 py-1 text-sky-800 hover:bg-sky-50 dark:border-sky-800 dark:text-sky-300 dark:hover:bg-sky-950">Open {asset.label}</a>
                  ) : null)}
                  {references.map((reference) => (
                    <button key={reference.ref_id} type="button" disabled={openingRefId !== null} onClick={() => void openReference(reference)} className="rounded border border-neutral-300 px-2 py-1 hover:bg-neutral-100 disabled:opacity-50 dark:border-neutral-700 dark:hover:bg-neutral-900">
                      {openingRefId === reference.ref_id ? "Opening…" : `Open cited paper: ${reference.title || reference.marker}`}
                    </button>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      </article>
    </main>
  );
}
