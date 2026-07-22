"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { blobUrl, digestOf, loadManifest, pdfUrl } from "../lib/api";
import { findCitations, type Citation } from "../lib/citations";
import { navigateToEvidence as navigateEvidence, paperHref, parseEvidenceHash } from "../lib/evidence/navigation";
import { createEvidenceResolver } from "../lib/evidence/resource";
import { getPaperLearningIndex } from "../lib/learning/paper-index";
import { buildConceptThread } from "../lib/learning/threads";
import type { ConceptThread } from "../lib/learning/types";
import { buildReverseIndex, findMentions, type Mention, type PageTextItem } from "../lib/mentions";
import type { Manifest } from "../lib/manifest";
import { loadPdf, pageTextItems, type PDFDocumentProxy } from "../lib/pdf";
import { buildResearchContext } from "../lib/research-context/context";
import type { ResearchContext } from "../lib/research-context/types";
import {
  assetEvidence,
  createSourceEvidence,
  isSourceEvidence,
  paperIdOf,
  passageEvidence,
  type SourceEvidence,
} from "../lib/evidence/source";
import type { CapturedSelection } from "../lib/selection/dom";
import { responsivePageWidth } from "../lib/reader/layout";
import { readerScrollBehavior } from "../lib/reader/motion";
import { IndexedDbWorkspaceRepository } from "../lib/workspace/indexed-db";
import { pinVerifiedEvidence } from "../lib/workspace/pinning";
import OverlayCard, { type CardState } from "./OverlayCard";
import PdfPageView from "./PdfPageView";
import SelectionActionPanel from "./selection/SelectionActionPanel";
import ReaderLearningLayer from "./learning/ReaderLearningLayer";
import ResearchBuddy from "./buddy/ResearchBuddy";

/** Render the visible page plus one either side: a 40-page paper must not allocate 40 canvases. */
const RENDER_WINDOW = 1;

interface PageAnalysis {
  items: PageTextItem[];
  mentions: Mention[];
  citations: Citation[];
}

interface ReaderSelection extends CapturedSelection {
  menuOpen: boolean;
}

interface SelectionPanelState {
  mode: "context" | "thread";
  context: ResearchContext;
  thread?: ConceptThread;
}

export default function Reader({ digest }: { digest: string }) {
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [analysis, setAnalysis] = useState<PageAnalysis[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [currentPage, setCurrentPage] = useState(0);
  const [cards, setCards] = useState<CardState[]>([]);
  const [focused, setFocused] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [dark, setDark] = useState(false);
  const [autoDock, setAutoDock] = useState(true);
  const [outlineOpen, setOutlineOpen] = useState(true);
  const [split, setSplit] = useState<{ digest: string; title: string } | null>(null);
  const [selection, setSelection] = useState<ReaderSelection | null>(null);
  const [selectionPanel, setSelectionPanel] = useState<SelectionPanelState | null>(null);
  const [activeEvidence, setActiveEvidence] = useState<SourceEvidence | null>(null);
  const [pageWidth, setPageWidth] = useState(760);
  const [pinStatus, setPinStatus] = useState("");

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const workspaceRepository = useMemo(() => new IndexedDbWorkspaceRepository(), []);

  // Load the manifest and the PDF, then analyse every page's text once. The reverse
  // index has to exist before the first click, and scanning text (without rendering) is
  // fast enough to do up front (spec D3: no server round trips while reading).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const loaded = await loadManifest(digest);
        const pdf = await loadPdf(pdfUrl(digest));
        if (cancelled) return;
        setManifest(loaded);
        setDoc(pdf);

        const perPage: PageAnalysis[] = [];
        for (let index = 0; index < pdf.numPages; index += 1) {
          const page = await pdf.getPage(index + 1);
          const items = await pageTextItems(page);
          perPage.push({
            items,
            mentions: findMentions(items, { page: index, assets: loaded.assets }),
            citations: findCitations(items, { references: loaded.references }),
          });
        }
        if (!cancelled) setAnalysis(perPage);
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : String(cause));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [digest]);

  const assetsById = useMemo(
    () => new Map((manifest?.assets ?? []).map((asset) => [asset.asset_id, asset])),
    [manifest],
  );

  const reverseIndex = useMemo(
    () => buildReverseIndex(analysis.flatMap((page) => page.mentions)),
    [analysis],
  );

  // The onboarding tour points at the paper's very first figure/table reference, not
  // merely the first one per page (every page renders its own mention list).
  const firstMentionId = useMemo(() => {
    for (let page = 0; page < analysis.length; page += 1) {
      const mention = analysis[page]?.mentions.find((item) => item.assetId !== null && item.rect !== null);
      if (mention) return mentionAnchorId(mention.assetId as string, page, mention.index);
    }
    return null;
  }, [analysis]);

  const learningIndex = useMemo(
    () => (manifest && analysis.length === manifest.page_count ? getPaperLearningIndex(manifest, analysis) : null),
    [analysis, manifest],
  );

  const evidenceResolver = useMemo(
    () => (learningIndex ? createEvidenceResolver([learningIndex]) : null),
    [learningIndex],
  );

  const researchContext = useMemo(() => {
    if (!manifest || !selection) return null;
    return buildResearchContext({ manifest, selection: selection.context, pages: analysis, ...(learningIndex ? { index: learningIndex } : {}) });
  }, [analysis, learningIndex, manifest, selection]);

  const openCard = useCallback((assetId: string, hard: boolean) => {
    setCards((previous) => {
      const existing = previous.find((card) => card.assetId === assetId);
      if (existing) {
        // Re-opening an auto-docked card promotes it to a hard pin.
        return previous.map((card) =>
          card.assetId === assetId ? { ...card, hard: card.hard || hard } : card,
        );
      }
      const kept = (hard ? previous : previous.filter((card) => card.hard)).slice(-2);
      const offset = kept.length * 28;
      const viewportWidth = typeof window === "undefined" ? 1024 : window.innerWidth;
      const cardWidth = Math.min(320, Math.max(240, viewportWidth - 16));
      const x = Math.min(40 + offset, Math.max(8, viewportWidth - cardWidth - 8));
      return [...kept, { assetId, x, y: 110 + offset, hard }];
    });
    setFocused(assetId);
  }, []);

  const closeCard = useCallback((assetId: string) => {
    setCards((previous) => previous.filter((card) => card.assetId !== assetId));
    setFocused((current) => (current === assetId ? null : current));
  }, []);

  const scrollToPage = useCallback((page: number) => {
    const node = scrollRef.current?.querySelector(`[data-page="${page}"]`);
    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    node?.scrollIntoView({ behavior: readerScrollBehavior(Boolean(reduceMotion)), block: "start" });
  }, []);

  useEffect(() => {
    if (window.matchMedia("(max-width: 767px)").matches) setOutlineOpen(false);
  }, []);

  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;
    const update = () => {
      setPageWidth(responsivePageWidth(container.clientWidth, window.innerWidth));
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(container);
    return () => observer.disconnect();
  }, [outlineOpen, split]);

  const focusPaperSelection = useCallback(() => {
    const page = selection?.context.page ?? currentPage;
    scrollToPage(page);
    window.requestAnimationFrame(() => {
      const root = scrollRef.current?.querySelector<HTMLElement>(`[data-page="${page}"] .pdf-text-layer`);
      root?.focus();
    });
  }, [currentPage, scrollToPage, selection]);

  const navigateToEvidence = useCallback(
    (evidence: SourceEvidence) => {
      if (!manifest) return;
      navigateEvidence(evidence, {
        currentPaperId: paperIdOf(manifest),
        currentPageCount: manifest.page_count,
        onCurrent(target, source) {
          setActiveEvidence(source);
          scrollToPage(target.page);
          if (target.assetId && assetsById.has(target.assetId)) openCard(target.assetId, true);
        },
      });
    },
    [assetsById, manifest, openCard, scrollToPage],
  );

  useEffect(() => {
    if (!manifest) return;
    const applyDeepLink = () => {
      const target = parseEvidenceHash(window.location.hash, manifest.page_count);
      if (!target) return;
      const asset = target.assetId ? assetsById.get(target.assetId) : undefined;
      const evidence = createSourceEvidence(manifest, {
        page: target.page,
        kind: asset?.kind ?? "passage",
        ...(target.assetId ? { assetId: target.assetId } : {}),
        ...(target.bbox ? { bbox: target.bbox } : {}),
      });
      setActiveEvidence(target.bbox || target.assetId ? evidence : null);
      window.requestAnimationFrame(() => {
        scrollToPage(target.page);
        if (target.assetId && asset) openCard(target.assetId, true);
      });
    };
    applyDeepLink();
    window.addEventListener("hashchange", applyDeepLink);
    return () => window.removeEventListener("hashchange", applyDeepLink);
  }, [assetsById, manifest, openCard, scrollToPage]);

  const pinEvidence = useCallback(async (evidence: SourceEvidence) => {
    if (!manifest) return;
    const result = await pinVerifiedEvidence(workspaceRepository, manifest, evidence);
    setPinStatus(result.status === "pinned" ? "Pinned to Workspace" : result.reason);
  }, [manifest, workspaceRepository]);

  const pinSelection = useCallback(() => {
    const passage = researchContext?.sourceWindow.selected;
    if (!manifest || !passage) return;
    void pinEvidence(passageEvidence(manifest.doc_id, passage.page, passage.text, {
      ...(passage.bbox ? { bbox: passage.bbox } : {}),
      ...(passage.sectionId ? { sectionId: passage.sectionId } : {}),
    }));
    setSelection((current) => current ? { ...current, menuOpen: false } : null);
  }, [manifest, pinEvidence, researchContext]);

  const openSelectionContext = useCallback(() => {
    if (!researchContext) return;
    setSelectionPanel({ mode: "context", context: researchContext });
    setSelection((current) => (current ? { ...current, menuOpen: false } : null));
  }, [researchContext]);

  const openConceptThread = useCallback(() => {
    if (!manifest || !researchContext || !selection) return;
    const thread = buildConceptThread({
      paperId: paperIdOf(manifest),
      concept: selection.context.text,
      pages: analysis,
      sections: manifest.sections,
      assets: manifest.assets,
    });
    setSelectionPanel({ mode: "thread", context: researchContext, thread });
    setSelection((current) => (current ? { ...current, menuOpen: false } : null));
  }, [analysis, manifest, researchContext, selection]);

  const openCitation = useCallback(
    async (citation: Citation) => {
      if (!manifest) return;
      const reference = manifest.references.find((r) => citation.refIds.includes(r.ref_id));
      if (!reference?.arxiv_id) return;

      setSplit({ digest: "", title: reference.title ?? reference.raw });
      try {
        const response = await fetch(`${blobUrl("/api/papers")}`, {
          method: "POST",
          body: (() => {
            const form = new FormData();
            form.append("arxiv_id", reference.arxiv_id as string);
            return form;
          })(),
        });
        if (!response.ok) throw new Error(await response.text());
        const cited: Manifest = await response.json();
        setSplit({ digest: digestOf(cited), title: cited.title || (reference.title ?? "") });
      } catch {
        setSplit({ digest: "", title: `Could not load ${reference.arxiv_id}` });
      }
    },
    [manifest],
  );

  // Track the page at the viewport centre, for reverse-link highlighting and auto-dock.
  useEffect(() => {
    const container = scrollRef.current;
    if (!container || !doc) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (visible) setCurrentPage(Number(visible.target.getAttribute("data-page")));
      },
      { root: container, threshold: [0.25, 0.5, 0.75] },
    );

    container.querySelectorAll("[data-page]").forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, [doc, analysis.length]);

  // Auto-dock: soft-pin whatever the current page references. This is the retention bet
  // in spec section 13 - it makes the value passive instead of requiring a click.
  useEffect(() => {
    if (!autoDock) return;
    const first = analysis[currentPage]?.mentions.find((m) => m.assetId !== null);
    if (first?.assetId) openCard(first.assetId, false);
  }, [autoDock, analysis, currentPage, openCard]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement ||
        event.target instanceof HTMLSelectElement ||
        (event.target instanceof HTMLElement && event.target.isContentEditable)
      ) {
        return;
      }

      if (event.key === "Escape") {
        if (selection?.menuOpen) {
          setSelection((current) => (current ? { ...current, menuOpen: false } : null));
        } else if (selectionPanel) setSelectionPanel(null);
        else if (activeEvidence) setActiveEvidence(null);
        else if (expanded) setExpanded(null);
        else if (split) setSplit(null);
        else if (focused) closeCard(focused);
        return;
      }
      if (event.key === "\\") {
        setOutlineOpen((open) => !open);
        return;
      }
      if (event.key === "f") {
        const next = analysis[currentPage]?.mentions.find((m) => m.assetId !== null);
        if (next?.assetId) openCard(next.assetId, true);
        return;
      }
      if (/^[1-9]$/.test(event.key)) {
        const card = cards[Number(event.key) - 1];
        if (card) {
          setFocused(card.assetId);
          setExpanded(card.assetId);
        }
        return;
      }
      if ((event.key === "[" || event.key === "]") && focused) {
        const list = reverseIndex.get(focused) ?? [];
        if (list.length === 0) return;
        const position = list.findIndex((m) => m.page >= currentPage);
        const target =
          event.key === "]"
            ? list[Math.min(list.length - 1, Math.max(0, position + 1))]
            : list[Math.max(0, position - 1)];
        if (target) scrollToPage(target.page);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [activeEvidence, analysis, cards, closeCard, currentPage, expanded, focused, openCard, reverseIndex, scrollToPage, selection, selectionPanel, split]);

  if (error) {
    return <p className="p-8 text-red-600">Could not open this paper: {error}</p>;
  }
  if (!manifest || !doc) {
    return <p className="p-8 opacity-60">Loading paper...</p>;
  }

  const expandedAsset = expanded ? assetsById.get(expanded) : null;

  return (
    <div className={`flex h-screen flex-col ${dark ? "dark bg-neutral-950 text-neutral-100" : "bg-neutral-100"}`}>
      <header className="flex shrink-0 flex-wrap items-center gap-2 border-b border-neutral-300 px-3 py-2 dark:border-neutral-800 sm:gap-3 sm:px-4">
        <button
          type="button"
          onClick={() => setOutlineOpen((open) => !open)}
          className="rounded px-2 py-1 text-sm hover:bg-neutral-200 dark:hover:bg-neutral-800"
          title="Toggle outline (\\)"
          aria-label="Toggle paper outline"
        >
          {"\u2630"}
        </button>
        <h1 className="min-w-0 flex-1 truncate text-sm font-medium">{manifest.title || "Untitled paper"}</h1>
        <nav className="order-last flex w-full items-center gap-1 sm:order-none sm:w-auto" aria-label="Primary product views">
          <a aria-current="page" data-tour="nav-read" href={paperHref(digest)} className="rounded bg-neutral-900 px-2 py-1 text-xs text-white dark:bg-white dark:text-neutral-950">Read</a>
          <a data-tour="nav-explore" href={`/explore/${digest}`} className="rounded px-2 py-1 text-xs hover:bg-neutral-200 dark:hover:bg-neutral-800">Explore</a>
          <a data-tour="nav-workspace" href={`/workspace/${digest}`} className="rounded px-2 py-1 text-xs hover:bg-neutral-200 dark:hover:bg-neutral-800">Workspace</a>
          <a href={`/reflow/${digest}`} className="rounded px-2 py-1 text-xs hover:bg-neutral-200 dark:hover:bg-neutral-800">Reflow</a>
        </nav>
        <span className="text-xs opacity-60">
          p.{currentPage + 1} / {manifest.page_count}
        </span>
        <label className="flex items-center gap-1 text-xs">
          <input type="checkbox" checked={autoDock} onChange={(e) => setAutoDock(e.target.checked)} />
          auto-dock
        </label>
        <button
          type="button"
          onClick={() => setDark((on) => !on)}
          className="rounded px-2 py-1 text-sm hover:bg-neutral-200 dark:hover:bg-neutral-800"
          aria-label={dark ? "Use light appearance" : "Use dark appearance"}
        >
          {dark ? "\u2600" : "\u263e"}
        </button>
        <span className="sr-only" aria-live="polite">{pinStatus}</span>
      </header>

      <div className="flex min-h-0 flex-1">
        {outlineOpen && (
          <nav className="w-56 shrink-0 overflow-y-auto border-r border-neutral-300 p-3 text-sm dark:border-neutral-800">
            {manifest.sections.length === 0 && <p className="opacity-50">No outline found.</p>}
            {manifest.sections.map((section, i) => (
              <button
                key={i}
                type="button"
                onClick={() => scrollToPage(section.page)}
                className="block w-full truncate rounded px-2 py-1 text-left hover:bg-neutral-200 dark:hover:bg-neutral-800"
                style={{ paddingLeft: 8 + (section.level - 1) * 12 }}
                title={section.title}
              >
                {section.title}
              </button>
            ))}
            <hr className="my-3 border-neutral-300 dark:border-neutral-800" />
            <p className="mb-1 px-2 text-xs uppercase tracking-wide opacity-50">Figures</p>
            {manifest.assets.map((asset) => (
              <button
                key={asset.asset_id}
                type="button"
                onClick={() => openCard(asset.asset_id, true)}
                className="block w-full truncate rounded px-2 py-1 text-left hover:bg-neutral-200 dark:hover:bg-neutral-800"
                title={asset.caption}
              >
                {asset.label}
              </button>
            ))}
          </nav>
        )}

        <div
          ref={scrollRef}
          data-tour="paper"
          className="min-w-0 flex-1 overflow-y-auto p-2 sm:p-4 lg:p-6"
          onScroll={() =>
            setSelection((current) =>
              current?.menuOpen ? { ...current, menuOpen: false } : current,
            )
          }
        >
          {Array.from({ length: manifest.page_count }, (_, index) => (
            <PdfPageView
              key={index}
              doc={doc}
              pageIndex={index}
              width={pageWidth}
              active={Math.abs(index - currentPage) <= RENDER_WINDOW}
              dark={dark}
              mentions={analysis[index]?.mentions ?? []}
              citations={analysis[index]?.citations ?? []}
              textItems={analysis[index]?.items ?? []}
              onOpenAsset={(assetId) => openCard(assetId, true)}
              onOpenCitation={openCitation}
              onTextSelection={(captured) => {
                setSelection({ ...captured, menuOpen: true });
                setSelectionPanel(null);
                setActiveEvidence(null);
              }}
              highlightedAssetId={focused}
              evidenceBBox={activeEvidence?.page === index ? activeEvidence.bbox : undefined}
              tourAnchorMentionId={firstMentionId}
            />
          ))}
        </div>

        {split && (
          <aside className="flex w-1/2 shrink-0 flex-col border-l border-neutral-300 bg-white dark:border-neutral-800 dark:bg-neutral-950 max-md:fixed max-md:inset-0 max-md:z-40 max-md:w-full" aria-label="Cited paper split view">
            <div className="flex items-center gap-2 border-b border-neutral-300 px-3 py-2 dark:border-neutral-800">
              <span className="flex-1 truncate text-sm">{split.title}</span>
              <button type="button" onClick={() => setSplit(null)} aria-label="Close split view">
                {"\u00d7"}
              </button>
            </div>
            {split.digest ? (
              <iframe title={split.title} src={pdfUrl(split.digest)} className="flex-1" />
            ) : (
              <p className="p-4 text-sm opacity-60">Fetching the cited paper...</p>
            )}
          </aside>
        )}
      </div>

      {selectionPanel && (
        <SelectionActionPanel
          mode={selectionPanel.mode}
          context={selectionPanel.context}
          thread={selectionPanel.thread}
          onNavigateEvidence={navigateToEvidence}
          onOpenAsset={(assetId) => openCard(assetId, true)}
          onClose={() => setSelectionPanel(null)}
        />
      )}

      <ReaderLearningLayer
        selection={selection}
        context={researchContext}
        index={learningIndex}
        resolver={evidenceResolver}
        onSelectionMenuOpenChange={(open) => setSelection((current) => (current ? { ...current, menuOpen: open } : null))}
        onOpenContext={openSelectionContext}
        onOpenTrace={openConceptThread}
        onPin={pinSelection}
        onCopy={() => {
          if (selection) void navigator.clipboard?.writeText(selection.context.text);
          setSelection((current) => (current ? { ...current, menuOpen: false } : null));
        }}
        onNavigateEvidence={(evidence) => {
          if (isSourceEvidence(evidence.source)) navigateToEvidence(evidence.source);
        }}
        onPinEvidence={(evidence) => {
          if (isSourceEvidence(evidence.source)) void pinEvidence(evidence.source);
        }}
        onFocusPaper={focusPaperSelection}
        onRestorePaperPage={scrollToPage}
      />

      {cards.map((card, index) => {
        const asset = assetsById.get(card.assetId);
        if (!asset) return null;
        return (
          <OverlayCard
            key={card.assetId}
            asset={asset}
            card={card}
            ordinal={index + 1}
            focused={focused === card.assetId}
            currentPage={currentPage}
            mentions={reverseIndex.get(card.assetId) ?? []}
            onMove={(x, y) =>
              setCards((previous) =>
                previous.map((c) => {
                  if (c.assetId !== card.assetId) return c;
                  const cardWidth = Math.min(320, Math.max(240, window.innerWidth - 16));
                  return { ...c, x: Math.max(8, Math.min(x, window.innerWidth - cardWidth - 8)), y: Math.max(72, Math.min(y, window.innerHeight - 120)), hard: true };
                }),
              )
            }
            onClose={() => closeCard(card.assetId)}
            onFocus={() => setFocused(card.assetId)}
            onExpand={() => setExpanded(card.assetId)}
            onPin={() => void pinEvidence(assetEvidence(manifest.doc_id, asset))}
            onJumpToMention={(mention) => scrollToPage(mention.page)}
          />
        );
      })}

      {expandedAsset && (
        <div
          className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/80 p-8"
          onClick={() => setExpanded(null)}
          role="dialog"
          aria-modal="true"
          aria-label={`Expanded ${expandedAsset.label}`}
        >
          <button type="button" onClick={() => setExpanded(null)} className="absolute right-4 top-4 min-h-10 rounded bg-white px-3 text-sm text-neutral-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400">Close expanded figure</button>
          <img
            src={blobUrl(expandedAsset.image_url)}
            alt={expandedAsset.caption}
            className="max-h-[80vh] max-w-full bg-white object-contain"
            onClick={(event) => event.stopPropagation()}
          />
          <p className="mt-3 max-w-3xl text-center text-sm text-neutral-200">
            {expandedAsset.caption}
          </p>
        </div>
      )}

      <ResearchBuddy dark={dark} />
    </div>
  );
}
