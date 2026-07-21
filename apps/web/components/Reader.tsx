"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { blobUrl, digestOf, loadManifest, pdfUrl } from "../lib/api";
import { findCitations, type Citation } from "../lib/citations";
import { evidenceTarget } from "../lib/evidence/navigation";
import { createEvidenceResolver } from "../lib/evidence/resource";
import { getPaperLearningIndex } from "../lib/learning/paper-index";
import { buildConceptThread } from "../lib/learning/threads";
import type { ConceptThread } from "../lib/learning/types";
import { buildReverseIndex, findMentions, type Mention, type PageTextItem } from "../lib/mentions";
import type { Manifest } from "../lib/manifest";
import { loadPdf, pageTextItems, type PDFDocumentProxy } from "../lib/pdf";
import { buildResearchContext } from "../lib/research-context/context";
import type { ResearchContext } from "../lib/research-context/types";
import { paperIdOf, type SourceEvidence } from "../lib/evidence/source";
import type { CapturedSelection } from "../lib/selection/dom";
import OverlayCard, {
  isMentionActive,
  placePopup,
  shouldOpenPopup,
  transitionPopup,
  type PopupEvent,
  type PopupRect,
  type PopupState,
} from "./OverlayCard";
import PdfPageView from "./PdfPageView";
import SelectionActionPanel from "./selection/SelectionActionPanel";
import ReaderLearningLayer from "./learning/ReaderLearningLayer";

const MAX_PAGE_WIDTH = 760;
const MIN_PAGE_WIDTH = 560;
/** Render the visible page plus one either side: a 40-page paper must not allocate 40 canvases. */
const RENDER_WINDOW = 1;
const POPUP_SIZE = { width: 390, height: 336 };

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

function visiblePopupRects(
  state: Record<string, PopupState>,
  exceptAssetId: string,
): PopupRect[] {
  return Object.values(state).flatMap((popup) => {
    if (
      popup.assetId === exceptAssetId ||
      (popup.mode !== "open" && popup.mode !== "pinned")
    ) {
      return [];
    }
    const element = document.querySelector<HTMLElement>(
      `[data-popup-asset="${CSS.escape(popup.assetId)}"]`,
    );
    const rect = element?.getBoundingClientRect();
    if (rect) {
      return [{ x: rect.left, y: rect.top, width: rect.width, height: rect.height }];
    }
    if (!popup.position) return [];
    return [{ ...popup.position, ...POPUP_SIZE }];
  });
}

export default function Reader({ digest }: { digest: string }) {
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [analysis, setAnalysis] = useState<PageAnalysis[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [currentPage, setCurrentPage] = useState(0);
  const [popups, setPopups] = useState<Record<string, PopupState>>({});
  const [autoSurface, setAutoSurface] = useState(true);
  const [flashAssetId, setFlashAssetId] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [currentSection, setCurrentSection] = useState("");
  const [pageWidth, setPageWidth] = useState(MAX_PAGE_WIDTH);
  const [dark, setDark] = useState(false);
  const [outlineOpen, setOutlineOpen] = useState(true);
  const [split, setSplit] = useState<{ digest: string; title: string } | null>(null);
  const [selection, setSelection] = useState<ReaderSelection | null>(null);
  const [selectionPanel, setSelectionPanel] = useState<SelectionPanelState | null>(null);
  const [activeEvidence, setActiveEvidence] = useState<SourceEvidence | null>(null);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const scrollFrameRef = useRef<number | null>(null);

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

  const openPopup = useCallback(
    (assetId: string, mentionId: string | null, pin: boolean) => {
      const scroll = scrollRef.current;
      const anchor = mentionId
        ? scroll?.querySelector<HTMLElement>(
            `[data-mention-id="${CSS.escape(mentionId)}"]`,
          )
        : scroll?.querySelector<HTMLElement>(
            `[data-mention-asset="${CSS.escape(assetId)}"], [data-asset-region="${CSS.escape(assetId)}"]`,
          );
      const anchorRect = anchor?.getBoundingClientRect();
      if (!anchorRect) return;

      setPopups((previous) => {
        const existing = previous[assetId];
        if (!shouldOpenPopup(existing, pin)) return previous;
        const position =
          existing?.position ??
          placePopup({
            popup: POPUP_SIZE,
            anchor: anchorRect,
            viewport: { width: window.innerWidth, height: window.innerHeight },
            occupied: visiblePopupRects(previous, assetId),
          });
        return {
          ...previous,
          [assetId]: {
            assetId,
            mode: pin ? "pinned" : existing?.mode === "pinned" ? "pinned" : "open",
            position,
            anchorMentionId: mentionId,
            z: Math.max(100, ...Object.values(previous).map((popup) => popup.z)) + 1,
          },
        };
      });
    },
    [],
  );

  const handleMentionActivity = useCallback(
    (assetId: string, mentionId: string, active: boolean) => {
      if (active) openPopup(assetId, mentionId, false);
    },
    [openPopup],
  );

  const updatePopup = useCallback((assetId: string, event: PopupEvent) => {
    setPopups((current) => {
      const popup = current[assetId];
      if (!popup) return current;
      return { ...current, [assetId]: transitionPopup(popup, event) };
    });
  }, []);

  const raisePopup = useCallback((assetId: string) => {
    setPopups((current) => {
      const popup = current[assetId];
      if (!popup) return current;
      const z = Math.max(100, ...Object.values(current).map((item) => item.z)) + 1;
      return { ...current, [assetId]: { ...popup, z } };
    });
  }, []);

  useEffect(() => {
    const scroll = scrollRef.current;
    if (!scroll) return;
    const updateWidth = () => {
      setPageWidth(Math.min(MAX_PAGE_WIDTH, Math.max(MIN_PAGE_WIDTH, scroll.clientWidth - 16)));
    };
    updateWidth();
    const observer = new ResizeObserver(updateWidth);
    observer.observe(scroll);
    return () => observer.disconnect();
  }, [doc]);

  const scrollToPage = useCallback((page: number) => {
    const node = scrollRef.current?.querySelector(`[data-page="${page}"]`);
    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    node?.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
  }, []);

  const restorePopup = useCallback(
    (assetId: string) => {
      const mention = scrollRef.current?.querySelector<HTMLElement>(
        `[data-mention-asset="${CSS.escape(assetId)}"], [data-asset-region="${CSS.escape(assetId)}"]`,
      );
      if (!mention) return;
      const position = placePopup({
        popup: POPUP_SIZE,
        anchor: mention.getBoundingClientRect(),
        viewport: { width: window.innerWidth, height: window.innerHeight },
        occupied: visiblePopupRects(popups, assetId),
      });
      setPopups((current) => {
        const popup = current[assetId];
        if (!popup) return current;
        const z = Math.max(100, ...Object.values(current).map((item) => item.z)) + 1;
        return {
          ...current,
          [assetId]: transitionPopup(popup, { type: "restore", position, z }),
        };
      });
    },
    [popups],
  );

  const jumpToAsset = useCallback(
    (assetId: string) => {
      const asset = assetsById.get(assetId);
      if (!asset) return;
      scrollToPage(asset.page);
      window.requestAnimationFrame(() => {
        const target = scrollRef.current?.querySelector<HTMLElement>(
          `[data-asset-region="${CSS.escape(assetId)}"]`,
        );
        const container = scrollRef.current;
        if (target && container) {
          const root = container.getBoundingClientRect();
          const rect = target.getBoundingClientRect();
          container.scrollTo({
            top: container.scrollTop + rect.top - root.top - 140,
            behavior: "smooth",
          });
        }
        setFlashAssetId(assetId);
        window.setTimeout(() => setFlashAssetId(null), 1600);
      });
    },
    [assetsById, scrollToPage],
  );

  const jumpToMention = useCallback(
    (mention: Mention) => {
      if (!mention.assetId) return;
      const mentionId = `${mention.assetId}:p${mention.page}:m${mention.index}`;
      setPopups((current) => {
        const popup = current[mention.assetId as string];
        if (!popup) return current;
        return {
          ...current,
          [mention.assetId as string]: { ...popup, anchorMentionId: mentionId },
        };
      });
      scrollToPage(mention.page);
      window.requestAnimationFrame(() => {
        const target = scrollRef.current?.querySelector<HTMLElement>(
          `[data-mention-id="${CSS.escape(mentionId)}"]`,
        );
        const container = scrollRef.current;
        if (!target || !container) return;
        const root = container.getBoundingClientRect();
        const rect = target.getBoundingClientRect();
        container.scrollTo({
          top: container.scrollTop + rect.top - root.top - 140,
          behavior: "smooth",
        });
      });
    },
    [scrollToPage],
  );

  const runScrollFrame = useCallback(() => {
    scrollFrameRef.current = null;
    const scroll = scrollRef.current;
    if (!scroll) return;

    const activeByAsset = new Map<string, HTMLElement>();
    const viewportTop = scroll.getBoundingClientRect().top;
    for (const mention of scroll.querySelectorAll<HTMLElement>("[data-mention-id]")) {
      const assetId = mention.dataset.mentionAsset;
      if (
        assetId &&
        isMentionActive(
          mention.getBoundingClientRect(),
          scroll.clientHeight,
          viewportTop,
        ) &&
        !activeByAsset.has(assetId)
      ) {
        activeByAsset.set(assetId, mention);
      }
    }

    if (autoSurface) {
      for (const [assetId, mention] of activeByAsset) {
        openPopup(assetId, mention.dataset.mentionId ?? null, false);
      }
    }
    setPopups((current) =>
      Object.fromEntries(
        Object.entries(current).map(([assetId, popup]) => [
          assetId,
          popup.mode === "open" && !activeByAsset.has(assetId)
            ? { ...popup, mode: "idle" }
            : popup,
        ]),
      ),
    );
    setProgress(scroll.scrollTop / Math.max(1, scroll.scrollHeight - scroll.clientHeight));
    if (manifest) {
      let section = "";
      for (const candidate of manifest.sections) {
        if (candidate.page <= currentPage) section = candidate.title;
      }
      setCurrentSection(section);
    }
    setSelection((current) =>
      current?.menuOpen ? { ...current, menuOpen: false } : current,
    );
  }, [autoSurface, currentPage, manifest, openPopup]);

  const scheduleScrollFrame = useCallback(() => {
    if (scrollFrameRef.current !== null) return;
    scrollFrameRef.current = window.requestAnimationFrame(runScrollFrame);
  }, [runScrollFrame]);

  useEffect(() => {
    const scroll = scrollRef.current;
    if (!scroll) return;
    scheduleScrollFrame();
    scroll.addEventListener("scroll", scheduleScrollFrame, { passive: true });
    window.addEventListener("resize", scheduleScrollFrame, { passive: true });
    return () => {
      scroll.removeEventListener("scroll", scheduleScrollFrame);
      window.removeEventListener("resize", scheduleScrollFrame);
      if (scrollFrameRef.current !== null) {
        window.cancelAnimationFrame(scrollFrameRef.current);
        scrollFrameRef.current = null;
      }
    };
  }, [analysis.length, scheduleScrollFrame]);

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
      const target = evidenceTarget(evidence, { [paperIdOf(manifest)]: manifest.page_count });
      if (!target || target.paperId !== paperIdOf(manifest)) return;
      setActiveEvidence(evidence);
      scrollToPage(target.page);
      if (target.assetId && assetsById.has(target.assetId)) {
        window.requestAnimationFrame(() => openPopup(target.assetId as string, null, true));
      }
    },
    [assetsById, manifest, openPopup, scrollToPage],
  );

  const openSelectionContext = useCallback(() => {
    if (!researchContext) return;
    setSelectionPanel({ mode: "context", context: researchContext });
    setSelection((current) => (current ? { ...current, menuOpen: false } : null));
  }, [researchContext]);

  const openConceptThread = useCallback(() => {
    if (!manifest || !researchContext || !selection) return;
    const thread = buildConceptThread({
      paperId: manifest.doc_id,
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

  // Track the page at the viewport centre for reverse-link highlighting and the outline.
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

  const visiblePopups = useMemo(
    () =>
      Object.values(popups)
        .filter((popup) => popup.mode === "open" || popup.mode === "pinned")
        .sort((left, right) => left.z - right.z),
    [popups],
  );
  const activePopupId = visiblePopups.at(-1)?.assetId ?? null;

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
        else if (split) setSplit(null);
        else if (activePopupId) updatePopup(activePopupId, { type: "dock" });
        return;
      }
      if (event.key === "\\") {
        setOutlineOpen((open) => !open);
        return;
      }
      if (event.key === "f") {
        const next = analysis[currentPage]?.mentions.find((m) => m.assetId !== null);
        if (next?.assetId) {
          openPopup(next.assetId, `${next.assetId}:p${next.page}:m${next.index}`, true);
        }
        return;
      }
      if (/^[1-9]$/.test(event.key)) {
        const popup = visiblePopups[Number(event.key) - 1];
        if (popup) raisePopup(popup.assetId);
        return;
      }
      if ((event.key === "[" || event.key === "]") && activePopupId) {
        const list = reverseIndex.get(activePopupId) ?? [];
        if (list.length === 0) return;
        const position = list.findIndex((m) => m.page >= currentPage);
        const target =
          event.key === "]"
            ? list[Math.min(list.length - 1, Math.max(0, position + 1))]
            : list[Math.max(0, position - 1)];
        if (target) jumpToMention(target);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [activeEvidence, activePopupId, analysis, currentPage, jumpToMention, openPopup, raisePopup, reverseIndex, selection, selectionPanel, split, updatePopup, visiblePopups]);

  if (error) {
    return <p className="p-8 text-red-600">Could not open this paper: {error}</p>;
  }
  if (!manifest || !doc) {
    return <p className="p-8 opacity-60">Loading paperâ€¦</p>;
  }

  return (
    <div className={`flex h-screen flex-col ${dark ? "dark bg-neutral-950 text-neutral-100" : "bg-neutral-100"}`}>
      <header className="relative flex shrink-0 items-center gap-3 border-b border-neutral-300 px-4 py-2 dark:border-neutral-800">
        <button
          type="button"
          onClick={() => setOutlineOpen((open) => !open)}
          className="rounded px-2 py-1 text-sm hover:bg-neutral-200 dark:hover:bg-neutral-800"
          title="Toggle outline (\\)"
        >
          â˜°
        </button>
        <h1 className="flex-1 truncate text-sm font-medium">{manifest.title || "Untitled paper"}</h1>
        {currentSection && (
          <span className="max-w-56 truncate text-xs opacity-60" title={currentSection}>
            {currentSection}
          </span>
        )}
        <span className="text-xs opacity-60">
          p.{currentPage + 1} / {manifest.page_count}
        </span>
        <label className="flex items-center gap-1 text-xs">
          <input
            type="checkbox"
            checked={autoSurface}
            onChange={(event) => setAutoSurface(event.target.checked)}
          />
          auto-surface
        </label>
        <button
          type="button"
          onClick={() => setDark((on) => !on)}
          className="rounded px-2 py-1 text-sm hover:bg-neutral-200 dark:hover:bg-neutral-800"
        >
          {dark ? "â˜€" : "â˜¾"}
        </button>
        <span
          aria-hidden="true"
          className="absolute inset-x-0 bottom-0 h-0.5 origin-left bg-indigo-500"
          style={{ transform: `scaleX(${progress})` }}
        />
      </header>

      <div
        className={`grid min-h-0 flex-1 overflow-x-auto ${
          outlineOpen
            ? "grid-cols-[minmax(560px,1fr)] min-[901px]:grid-cols-[240px_minmax(560px,1fr)]"
            : "grid-cols-[minmax(560px,1fr)]"
        }`}
      >
        {outlineOpen && (
          <nav className="hidden w-60 overflow-y-auto border-r border-neutral-300 p-3 text-sm min-[901px]:block dark:border-neutral-800">
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
                onClick={() => openPopup(asset.asset_id, null, true)}
                className="block w-full truncate rounded px-2 py-1 text-left hover:bg-neutral-200 dark:hover:bg-neutral-800"
                title={asset.caption}
              >
                {asset.label}
              </button>
            ))}
          </nav>
        )}

        <div ref={scrollRef} className="min-w-[560px] overflow-y-auto px-2 py-6">
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
              onOpenAsset={(assetId, mentionId) => openPopup(assetId, mentionId, true)}
              onMentionActivity={(assetId, mentionId, active) => handleMentionActivity(assetId, mentionId, active)}
              onOpenCitation={openCitation}
              onTextSelection={(captured) => {
                setSelection({ ...captured, menuOpen: true });
                setSelectionPanel(null);
                setActiveEvidence(null);
              }}
              highlightedAssetId={activePopupId}
              flashAssetId={flashAssetId}
              assetRegions={manifest.assets
                .filter((asset) => asset.page === index)
                .map((asset) => ({ assetId: asset.asset_id, bbox: asset.bbox }))}
              evidenceBBox={activeEvidence?.page === index ? activeEvidence.bbox : undefined}
            />
          ))}
        </div>

        {split && (
          <aside className="fixed inset-y-0 right-0 z-[1000] flex w-1/2 flex-col border-l border-neutral-300 bg-white dark:border-neutral-800 dark:bg-neutral-950">
            <div className="flex items-center gap-2 border-b border-neutral-300 px-3 py-2 dark:border-neutral-800">
              <span className="flex-1 truncate text-sm">{split.title}</span>
              <button type="button" onClick={() => setSplit(null)} aria-label="Close split view">
                Ã—
              </button>
            </div>
            {split.digest ? (
              <iframe title={split.title} src={pdfUrl(split.digest)} className="flex-1" />
            ) : (
              <p className="p-4 text-sm opacity-60">Fetching the cited paperâ€¦</p>
            )}
          </aside>
        )}
      </div>

      <div className="pointer-events-none fixed inset-0 z-[100]">
        {visiblePopups.map((popup) => {
          const asset = assetsById.get(popup.assetId);
          if (!asset) return null;
          return (
            <OverlayCard
              key={popup.assetId}
              asset={asset}
              popup={popup}
              mentions={reverseIndex.get(popup.assetId) ?? []}
              currentPage={currentPage}
              onMove={(position) => updatePopup(popup.assetId, { type: "drag", position })}
              onPin={(pinned) =>
                updatePopup(popup.assetId, { type: pinned ? "pin" : "unpin" })
              }
              onDock={() => updatePopup(popup.assetId, { type: "dock" })}
              onRaise={() => raisePopup(popup.assetId)}
              onJumpToAsset={() => jumpToAsset(popup.assetId)}
              onJumpToMention={jumpToMention}
            />
          );
        })}
      </div>

      {Object.values(popups).some((popup) => popup.mode === "docked") && (
        <aside
          aria-label="Minimized figures"
          className="fixed bottom-4 left-1/2 z-[90] flex -translate-x-1/2 gap-2 rounded-xl border border-neutral-900/10 bg-white/90 p-2 shadow-lg backdrop-blur dark:border-white/10 dark:bg-neutral-900/90"
        >
          {Object.values(popups)
            .filter((popup) => popup.mode === "docked")
            .map((popup) => {
              const asset = assetsById.get(popup.assetId);
              if (!asset) return null;
              return (
                <button
                  key={popup.assetId}
                  type="button"
                  onClick={() => restorePopup(popup.assetId)}
                  className="flex items-center gap-2 rounded-lg border border-neutral-900/10 bg-white px-2 py-1.5 text-xs shadow-sm hover:border-indigo-400 dark:border-white/10 dark:bg-neutral-800"
                  aria-label={`Restore ${asset.label}`}
                >
                  <img
                    src={blobUrl(asset.image_url)}
                    alt=""
                    className="h-8 w-10 bg-white object-contain"
                  />
                  {asset.label}
                </button>
              );
            })}
        </aside>
      )}

      {selectionPanel && (
        <SelectionActionPanel
          mode={selectionPanel.mode}
          context={selectionPanel.context}
          thread={selectionPanel.thread}
          onNavigateEvidence={navigateToEvidence}
          onOpenAsset={(assetId) => openPopup(assetId, null, true)}
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
        onCopy={() => {
          if (selection) void navigator.clipboard?.writeText(selection.context.text);
          setSelection((current) => (current ? { ...current, menuOpen: false } : null));
        }}
        onNavigateEvidence={(evidence) => navigateToEvidence(evidence.source)}
        onFocusPaper={focusPaperSelection}
        onRestorePaperPage={scrollToPage}
      />

    </div>
  );
}
