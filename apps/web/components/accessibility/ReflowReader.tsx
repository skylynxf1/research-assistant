"use client";

import { createElement, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { digestOf, fetchArxiv } from "../../lib/api";
import { buildReflowDocument, type ReflowBlock } from "../../lib/accessibility/reflow";
import {
  DEFAULT_READING_SETTINGS,
  moveParagraphIndex,
  normalizeReadingSettings,
  speechParagraphs,
  type ReadingFont,
  type ReadingSettings,
} from "../../lib/accessibility/settings";
import { loadPaperAnalysis, type PaperAnalysis } from "../../lib/explore/analysis";
import type { Reference } from "../../lib/manifest";

function HeadingBlock({ block, digest }: { block: Extract<ReflowBlock, { type: "heading" }>; digest: string }) {
  return createElement(
    `h${block.level}`,
    { id: block.sectionId, className: "group mt-10 scroll-mt-6 font-semibold tracking-tight first:mt-0" },
    block.title,
    createElement(
      "a",
      {
        href: `/read/${digest}#page=${block.page}`,
        className: "ml-3 align-middle font-mono text-[0.65rem] font-normal text-sky-700 hover:underline dark:text-sky-300",
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
  const [settings, setSettings] = useState<ReadingSettings>(DEFAULT_READING_SETTINGS);
  const [paragraphIndex, setParagraphIndex] = useState(0);
  const [speaking, setSpeaking] = useState(false);
  const [status, setStatus] = useState("Reader ready");
  const [speechSupported, setSpeechSupported] = useState(false);
  const paragraphRefs = useRef<Array<HTMLElement | null>>([]);

  useEffect(() => {
    setSpeechSupported("speechSynthesis" in window && "SpeechSynthesisUtterance" in window);
  }, []);

  useEffect(() => {
    let cancelled = false;
    loadPaperAnalysis(digest)
      .then((result) => { if (!cancelled) setAnalysis(result); })
      .catch((cause) => { if (!cancelled) setError(cause instanceof Error ? cause.message : String(cause)); });
    return () => { cancelled = true; };
  }, [digest]);

  const document = useMemo(
    () => analysis
      ? buildReflowDocument(analysis.manifest, analysis.pageItems, analysis.mentionsByPage, analysis.citationsByPage)
      : null,
    [analysis],
  );
  const paragraphs = useMemo(() => document ? speechParagraphs(document) : [], [document]);

  const focusParagraph = useCallback((next: number) => {
    if (paragraphs.length === 0) return;
    const clamped = Math.min(paragraphs.length - 1, Math.max(0, next));
    setParagraphIndex(clamped);
    setStatus(`Paragraph ${clamped + 1} of ${paragraphs.length}`);
    requestAnimationFrame(() => {
      paragraphRefs.current[clamped]?.focus({ preventScroll: true });
      paragraphRefs.current[clamped]?.scrollIntoView({
        block: "center",
        behavior: settings.reducedMotion ? "auto" : "smooth",
      });
    });
  }, [paragraphs.length, settings.reducedMotion]);

  const stopSpeech = useCallback(() => {
    if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
    setSpeaking(false);
    setStatus("Read aloud stopped");
  }, []);

  const speakAt = useCallback((index: number) => {
    if (!speechSupported || !paragraphs[index]) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(paragraphs[index]);
    setSpeaking(true);
    focusParagraph(index);
    setStatus(`Reading paragraph ${index + 1} of ${paragraphs.length}`);
    utterance.onend = () => {
      const next = index + 1;
      if (next < paragraphs.length) speakAt(next);
      else {
        setSpeaking(false);
        setStatus("Read aloud complete");
      }
    };
    utterance.onerror = () => {
      setSpeaking(false);
      setStatus("Read aloud stopped by the browser");
    };
    window.speechSynthesis.speak(utterance);
  }, [focusParagraph, paragraphs, speechSupported]);

  useEffect(() => () => {
    if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.matches("input, select, textarea, button, a")) return;
      if (event.key.toLowerCase() === "j") {
        event.preventDefault();
        focusParagraph(moveParagraphIndex(paragraphIndex, 1, paragraphs.length));
      } else if (event.key.toLowerCase() === "k") {
        event.preventDefault();
        focusParagraph(moveParagraphIndex(paragraphIndex, -1, paragraphs.length));
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [focusParagraph, paragraphIndex, paragraphs.length]);

  const updateSettings = (patch: Partial<ReadingSettings>) => {
    setSettings((current) => normalizeReadingSettings({ ...current, ...patch }));
  };

  const openReference = async (reference: Reference) => {
    if (!reference.openable || !reference.arxiv_id || openingRefId) return;
    setOpeningRefId(reference.ref_id);
    setError(null);
    try { router.push(`/read/${digestOf(await fetchArxiv(reference.arxiv_id))}`); }
    catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      setOpeningRefId(null);
    }
  };

  if (error && !analysis) return <main className="mx-auto max-w-3xl p-8"><p role="alert" className="text-red-700 dark:text-red-300">Could not build reader view: {error}</p></main>;
  if (!analysis || !document) return <main className="mx-auto max-w-3xl p-8"><p className="opacity-60">Building reader view…</p></main>;
  if (document.status === "uncertain") {
    return (
      <main className="min-h-screen bg-neutral-50 px-5 py-12 dark:bg-neutral-950 dark:text-neutral-100">
        <section className="mx-auto max-w-2xl rounded-lg border border-amber-300 bg-amber-50 p-6 dark:border-amber-900 dark:bg-amber-950/40">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-amber-800 dark:text-amber-300">Original layout recommended</p>
          <h1 className="mt-3 text-2xl font-semibold">Reading order is uncertain</h1>
          <p className="mt-3 leading-relaxed opacity-75">This paper’s column geometry cannot be reordered with enough confidence. Marginalia will not present a plausible-looking but broken text order.</p>
          <a href={`/read/${digest}`} className="mt-6 inline-block rounded bg-neutral-900 px-4 py-2 text-sm text-white hover:bg-neutral-700 dark:bg-white dark:text-neutral-950">Read the original PDF</a>
        </section>
      </main>
    );
  }

  const assetById = new Map(analysis.manifest.assets.map((asset) => [asset.asset_id, asset]));
  const referenceById = new Map(analysis.manifest.references.map((reference) => [reference.ref_id, reference]));
  const fontFamily = settings.font === "dyslexia-friendly"
    ? "OpenDyslexic, Atkinson Hyperlegible, Verdana, sans-serif"
    : "inherit";
  let renderedParagraphIndex = -1;

  return (
    <main className={`min-h-screen px-5 py-8 sm:px-8 ${settings.highContrast ? "bg-black text-white" : "bg-neutral-50 text-neutral-950 dark:bg-neutral-950 dark:text-neutral-100"}`}>
      <div className="mx-auto max-w-5xl">
        <header className="border-b border-neutral-300 pb-6 dark:border-neutral-800">
          <nav className="mb-5 flex flex-wrap gap-4 text-sm" aria-label="Paper views">
            <a href={`/read/${digest}`} className="text-sky-700 hover:underline dark:text-sky-300">← Original PDF</a>
            <a href={`/explore/${digest}`} className="text-sky-700 hover:underline dark:text-sky-300">Explore paper</a>
          </nav>
          <p className="font-mono text-[0.68rem] uppercase tracking-[0.2em] opacity-60">Semantic reader view · source text only</p>
          <h1 className="mt-3 text-3xl font-semibold leading-tight tracking-tight">{analysis.manifest.title || "Untitled paper"}</h1>
        </header>

        <details className="mt-5 rounded-lg border border-neutral-300 bg-white p-4 text-neutral-950 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100" open>
          <summary className="cursor-pointer font-medium">Reading settings</summary>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <label className="text-sm">Font size <output>{settings.fontSize}px</output><input className="mt-1 block w-full" type="range" min="14" max="32" value={settings.fontSize} onChange={(event) => updateSettings({ fontSize: Number(event.target.value) })} /></label>
            <label className="text-sm">Line spacing <output>{settings.lineHeight.toFixed(1)}</output><input className="mt-1 block w-full" type="range" min="1.2" max="2.4" step="0.1" value={settings.lineHeight} onChange={(event) => updateSettings({ lineHeight: Number(event.target.value) })} /></label>
            <label className="text-sm">Paragraph spacing <output>{settings.paragraphSpacing.toFixed(2)}em</output><input className="mt-1 block w-full" type="range" min="0.5" max="3" step="0.25" value={settings.paragraphSpacing} onChange={(event) => updateSettings({ paragraphSpacing: Number(event.target.value) })} /></label>
            <label className="text-sm">Reading width <output>{settings.measure}rem</output><input className="mt-1 block w-full" type="range" min="28" max="72" value={settings.measure} onChange={(event) => updateSettings({ measure: Number(event.target.value) })} /></label>
            <label className="text-sm">Font family<select value={settings.font} onChange={(event) => updateSettings({ font: event.target.value as ReadingFont })} className="mt-1 block w-full rounded border px-2 py-2 dark:border-neutral-700 dark:bg-neutral-950"><option value="default">Document default</option><option value="dyslexia-friendly">Dyslexia-friendly stack</option></select></label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={settings.highContrast} onChange={(event) => updateSettings({ highContrast: event.target.checked })} />High contrast</label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={settings.reducedMotion} onChange={(event) => updateSettings({ reducedMotion: event.target.checked })} />Reduce motion</label>
            <button type="button" onClick={() => setSettings(DEFAULT_READING_SETTINGS)} className="rounded border px-3 py-2 text-sm hover:bg-neutral-100 dark:hover:bg-neutral-800">Reset settings</button>
          </div>
        </details>

        <nav className="mt-4 flex flex-wrap items-center gap-2" aria-label="Paragraph navigation">
          <button type="button" disabled={paragraphIndex === 0 || paragraphs.length === 0} onClick={() => focusParagraph(moveParagraphIndex(paragraphIndex, -1, paragraphs.length))} className="rounded border px-3 py-2 text-sm disabled:opacity-40">Previous paragraph (K)</button>
          <button type="button" disabled={paragraphIndex >= paragraphs.length - 1 || paragraphs.length === 0} onClick={() => focusParagraph(moveParagraphIndex(paragraphIndex, 1, paragraphs.length))} className="rounded border px-3 py-2 text-sm disabled:opacity-40">Next paragraph (J)</button>
          {speechSupported ? speaking ? <button type="button" onClick={stopSpeech} className="rounded bg-red-700 px-3 py-2 text-sm text-white">Stop read aloud</button> : <button type="button" onClick={() => speakAt(paragraphIndex)} className="rounded bg-sky-600 px-3 py-2 text-sm text-white">Read aloud from here</button> : null}
          <span role="status" aria-live="polite" className="ml-auto text-sm opacity-65">{status}</span>
        </nav>

        {error ? <p role="alert" className="mt-5 rounded border border-red-300 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">{error}</p> : null}

        <article style={{ maxWidth: `${settings.measure}rem`, fontSize: `${settings.fontSize}px`, lineHeight: settings.lineHeight, fontFamily }} className="mx-auto mt-10">
          {document.blocks.map((block, blockIndex) => {
            if (block.type === "heading") return <HeadingBlock key={`${block.sectionId}-${blockIndex}`} block={block} digest={digest} />;
            renderedParagraphIndex += 1;
            const currentIndex = renderedParagraphIndex;
            const assets = block.assetIds.map((id) => assetById.get(id)).filter(Boolean);
            const references = block.citations
              .flatMap((citation) => citation.refIds.map((id) => referenceById.get(id)))
              .filter((reference): reference is Reference => Boolean(reference?.openable && reference.arxiv_id));
            return (
              <section
                key={`paragraph-${block.page}-${blockIndex}`}
                ref={(element) => { paragraphRefs.current[currentIndex] = element; }}
                tabIndex={-1}
                style={{ marginTop: `${settings.paragraphSpacing}em` }}
                className="scroll-mt-24 rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
                aria-label={`Paragraph ${currentIndex + 1}, source PDF page ${block.page + 1}`}
              >
                <p>{block.text}</p>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                  <a href={`/read/${digest}#page=${block.page}`} className="font-mono text-sky-700 hover:underline dark:text-sky-300">Source PDF page {block.page + 1} →</a>
                  {assets.map((asset) => asset ? (
                    <details key={asset.asset_id} className="rounded border border-sky-300 px-2 py-1 dark:border-sky-800">
                      <summary className="cursor-pointer text-sky-800 dark:text-sky-300">{asset.label}: caption and source</summary>
                      <p className="mt-2 max-w-lg text-sm">{asset.caption}</p>
                      <a href={`/read/${digest}#page=${asset.page}`} className="mt-2 inline-block text-sky-700 hover:underline dark:text-sky-300">Open {asset.label} on PDF page {asset.page + 1} →</a>
                    </details>
                  ) : null)}
                  {references.map((reference) => (
                    <button key={reference.ref_id} type="button" disabled={openingRefId !== null} onClick={() => void openReference(reference)} className="rounded border border-neutral-300 px-2 py-1 hover:bg-neutral-100 disabled:opacity-50 dark:border-neutral-700 dark:hover:bg-neutral-900">
                      {openingRefId === reference.ref_id ? "Opening cited paper…" : `Open cited paper: ${reference.title || reference.marker}`}
                    </button>
                  ))}
                </div>
              </section>
            );
          })}
        </article>
      </div>
    </main>
  );
}
