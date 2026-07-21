"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { digestOf, fetchArxiv } from "../../lib/api";
import type { PaperAnalysis } from "../../lib/explore/analysis";
import {
  buildPaperMap,
  openableArxivId,
  type PaperMapCitation,
  type PaperMapSection,
} from "../../lib/explore/paper-map";
import type { Reference } from "../../lib/manifest";

interface Props {
  analysis: PaperAnalysis;
  digest: string;
}

interface SectionNodeProps {
  section: PaperMapSection;
  digest: string;
  openingRefId: string | null;
  onOpenReference: (reference: Reference) => void;
}

/** Structural view of one paper, built only from source-grounded browser analysis (§B2). */
export default function PaperMap({ analysis, digest }: Props) {
  const router = useRouter();
  const [openingRefId, setOpeningRefId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const model = useMemo(
    () => buildPaperMap(analysis.manifest, analysis.mentionsByPage, analysis.citationsByPage),
    [analysis],
  );

  const openReference = async (reference: Reference) => {
    const arxivId = openableArxivId(reference);
    if (!arxivId || openingRefId) return;

    setOpeningRefId(reference.ref_id);
    setError(null);
    try {
      const citedPaper = await fetchArxiv(arxivId);
      router.push(`/read/${digestOf(citedPaper)}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      setOpeningRefId(null);
    }
  };

  if (model.sections.length === 0) {
    return (
      <div className="mx-auto max-w-4xl p-8">
        <h2 className="text-lg font-semibold">Paper map</h2>
        <p className="mt-2 text-sm opacity-60">
          No sections, assets, or cited passages were detected for this paper.
        </p>
      </div>
    );
  }

  return (
    <section aria-labelledby="paper-map-heading" className="mx-auto max-w-5xl px-5 py-8 sm:px-8">
      <header className="mb-8 grid gap-3 border-b border-neutral-300 pb-6 dark:border-neutral-800 sm:grid-cols-[1fr_auto] sm:items-end">
        <div>
          <p className="mb-2 font-mono text-[0.65rem] uppercase tracking-[0.2em] text-sky-700 dark:text-sky-400">
            Document structure
          </p>
          <h2 id="paper-map-heading" className="text-2xl font-semibold tracking-tight">
            Paper map
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed opacity-65">
            Follow the paper's own outline, figures, tables, and cited sources. Every item
            links back to primary material.
          </p>
        </div>
        <p className="font-mono text-xs opacity-55">
          {analysis.manifest.sections.length} sections · {model.objectCount} source objects
        </p>
      </header>

      {error ? (
        <p role="alert" className="mb-5 rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
          Could not open the cited paper: {error}
        </p>
      ) : null}

      <ol className="ml-2 border-l border-sky-300/80 pl-5 dark:border-sky-900">
        {model.sections.map((section) => (
          <SectionNode
            key={section.id}
            section={section}
            digest={digest}
            openingRefId={openingRefId}
            onOpenReference={openReference}
          />
        ))}
      </ol>
    </section>
  );
}

function SectionNode({
  section,
  digest,
  openingRefId,
  onOpenReference,
}: SectionNodeProps) {
  const headingLevel = Math.min(6, Math.max(3, section.level + 2));
  const sourceCount = section.assets.length + section.citations.length;

  return (
    <li className="relative mb-4 last:mb-0">
      <span
        aria-hidden="true"
        className="absolute -left-[1.48rem] top-[1.15rem] h-2 w-2 rounded-full border-2 border-neutral-100 bg-sky-600 ring-2 ring-sky-100 dark:border-neutral-950 dark:ring-sky-950"
      />
      <details open className="group rounded-md border border-neutral-300 bg-white dark:border-neutral-800 dark:bg-neutral-900">
        <summary className="cursor-pointer list-none px-4 py-3 marker:hidden focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600">
          <span className="flex min-w-0 items-baseline gap-3">
            <span
              role="heading"
              aria-level={headingLevel}
              className="min-w-0 flex-1 truncate text-sm font-semibold"
            >
              {section.title}
            </span>
            {section.page !== null ? (
              <span className="font-mono text-xs text-sky-700 dark:text-sky-400">
                p.{section.page + 1}
              </span>
            ) : null}
            <span className="font-mono text-[0.65rem] opacity-45">
              {sourceCount} {sourceCount === 1 ? "item" : "items"}
            </span>
            <span aria-hidden="true" className="text-xs opacity-45 transition-transform group-open:rotate-90">
              ▸
            </span>
          </span>
        </summary>

        <div className="border-t border-neutral-200 px-4 py-3 dark:border-neutral-800">
          {section.page !== null ? (
            <a
              href={`/read/${digest}#page=${section.page}`}
              className="mb-3 inline-block text-xs text-sky-700 underline-offset-2 hover:underline dark:text-sky-400"
              title={`Open the paper (${section.title} starts on page ${section.page + 1})`}
            >
              Open section in the paper →
            </a>
          ) : null}

          {section.assets.length === 0 && section.citations.length === 0 ? (
            <p className="text-xs opacity-45">No extracted assets or citation markers in this section.</p>
          ) : null}

          {section.assets.length > 0 ? (
            <div>
              <p className="mb-2 font-mono text-[0.62rem] uppercase tracking-[0.16em] opacity-45">
                Figures and tables
              </p>
              <ul className="space-y-2">
                {section.assets.map(({ asset, mentionPages }) => (
                  <li key={asset.asset_id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm">
                    <a
                      href={`/read/${digest}#page=${asset.page}`}
                      className="font-medium text-sky-800 underline-offset-2 hover:underline dark:text-sky-300"
                      title={`Open the paper (${asset.label} is on page ${asset.page + 1})`}
                    >
                      {asset.label}
                    </a>
                    <span className="font-mono text-[0.68rem] uppercase opacity-45">{asset.kind} · p.{asset.page + 1}</span>
                    {mentionPages.length > 0 ? (
                      <span className="text-xs opacity-55">
                        mentioned on {mentionPages.map((page) => `p.${page + 1}`).join(", ")}
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {section.citations.length > 0 ? (
            <div className={section.assets.length > 0 ? "mt-5" : undefined}>
              <p className="mb-2 font-mono text-[0.62rem] uppercase tracking-[0.16em] opacity-45">
                Cited here
              </p>
              <ul className="space-y-2">
                {section.citations.map((citation) => (
                  <CitationEntry
                    key={citation.reference.ref_id}
                    citation={citation}
                    opening={openingRefId === citation.reference.ref_id}
                    onOpenReference={onOpenReference}
                  />
                ))}
              </ul>
            </div>
          ) : null}

          {section.children.length > 0 ? (
            <ol className="mt-4 ml-2 border-l border-neutral-300 pl-5 dark:border-neutral-700">
              {section.children.map((child) => (
                <SectionNode
                  key={child.id}
                  section={child}
                  digest={digest}
                  openingRefId={openingRefId}
                  onOpenReference={onOpenReference}
                />
              ))}
            </ol>
          ) : null}
        </div>
      </details>
    </li>
  );
}

function CitationEntry({
  citation,
  opening,
  onOpenReference,
}: {
  citation: PaperMapCitation;
  opening: boolean;
  onOpenReference: (reference: Reference) => void;
}) {
  const { reference } = citation;
  const arxivId = openableArxivId(reference);
  const label = reference.title || reference.raw;

  return (
    <li className="grid gap-1 text-sm sm:grid-cols-[minmax(0,1fr)_auto] sm:items-baseline sm:gap-4">
      <div className="min-w-0">
        <span className="mr-2 font-mono text-xs opacity-45">[{reference.marker}]</span>
        <span>{label}</span>
        <span className="ml-2 font-mono text-[0.68rem] opacity-45">cited p.{citation.page + 1}</span>
      </div>
      {arxivId ? (
        <button
          type="button"
          onClick={() => onOpenReference(reference)}
          disabled={opening}
          className="justify-self-start rounded border border-sky-300 px-2 py-1 text-xs text-sky-800 hover:bg-sky-50 disabled:cursor-wait disabled:opacity-50 dark:border-sky-800 dark:text-sky-300 dark:hover:bg-sky-950 sm:justify-self-end"
        >
          {opening ? "Opening…" : "Open cited paper"}
        </button>
      ) : (
        <span className="font-mono text-[0.65rem] uppercase tracking-wide opacity-40">Unresolved</span>
      )}
    </li>
  );
}
