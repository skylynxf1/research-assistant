"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Menu, Moon, Sun } from "lucide-react";
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
  shouldCloseCompactOutline,
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
  const [outlineOpen, setOutlineOpen] = useState(false);
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

  const closeCompactOutline = useCallback(() => {
    if (shouldCloseCompactOutline(window.innerWidth)) setOutlineOpen(false);
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
  const dockedPopups = useMemo(
    () => Object.values(popups).filter((popup) => popup.mode === "docked"),
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
    <div
      className={`relative h-screen overflow-hidden font-sans ${
        dark
          ? "dark bg-slate-950 text-slate-100"
          : "bg-[linear-gradient(160deg,#f4f6fb_0%,#eef1f8_45%,#e8ecf5_100%)] text-slate-900"
      }`}
    >
      <header className="fixed left-1/2 top-[22px] z-[220] flex max-w-[calc(100vw-32px)] -translate-x-1/2 items-center gap-2 rounded-full border border-white/90 bg-white/65 px-[18px] py-2 shadow-[0_8px_30px_rgba(15,23,42,0.10)] backdrop-blur-xl backdrop-saturate-150 sm:gap-3 dark:border-white/15 dark:bg-slate-900/70">
        <span className="h-2 w-2 shrink-0 rounded-full bg-[#3b5bdb]" aria-hidden="true" />
        <h1 className="max-w-[clamp(120px,24vw,360px)] truncate text-[13px] font-semibold">
          {manifest.title || "Untitled paper"}
        </h1>
        {currentSection && (
          <span className="hidden max-w-48 truncate text-xs text-slate-400 lg:inline" title={currentSection}>
            {currentSection}
          </span>
        )}
        <span className="h-4 w-px shrink-0 bg-slate-900/10 dark:bg-white/10" aria-hidden="true" />
        <span className="shrink-0 text-xs text-slate-500 dark:text-slate-400">
          p. {currentPage + 1} / {manifest.page_count}
        </span>
        <span className="relative hidden h-1 w-[72px] shrink-0 overflow-hidden rounded-full bg-slate-900/10 sm:block dark:bg-white/10">
          <span
            className="absolute inset-y-0 left-0 rounded-full bg-[#3b5bdb]"
            style={{ width: `${Math.max(4, progress * 100)}%` }}
          />
        </span>
        <button
          type="button"
          onClick={() => setOutlineOpen((open) => !open)}
          aria-label="Toggle outline"
          aria-expanded={outlineOpen}
          className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-slate-500 transition-colors hover:bg-slate-900/5 hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-[#3b5bdb] dark:text-slate-300 dark:hover:bg-white/10 dark:hover:text-white"
          title="Toggle outline (\\)"
        >
          <Menu size={15} aria-hidden="true" />
        </button>
        <label className="flex shrink-0 items-center gap-1 text-[11px] text-slate-500 dark:text-slate-400">
          <input
            type="checkbox"
            checked={autoSurface}
            onChange={(event) => setAutoSurface(event.target.checked)}
            className="accent-[#3b5bdb]"
          />
          auto
        </label>
        <button
          type="button"
          onClick={() => setDark((on) => !on)}
          aria-label="Toggle dark mode"
          className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-slate-500 transition-colors hover:bg-slate-900/5 hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-[#3b5bdb] dark:text-slate-300 dark:hover:bg-white/10 dark:hover:text-white"
        >
          {dark ? <Sun size={15} aria-hidden="true" /> : <Moon size={15} aria-hidden="true" />}
        </button>
      </header>

      {outlineOpen && (
        <nav
          aria-label="Paper outline"
          className="fixed bottom-6 left-6 top-[84px] z-[215] w-60 overflow-y-auto rounded-[24px] border border-white/90 bg-white/65 p-3 text-sm shadow-[0_16px_50px_rgba(15,23,42,0.14)] backdrop-blur-xl backdrop-saturate-150 dark:border-white/15 dark:bg-slate-900/75"
        >
          <p className="mb-2 px-2 pt-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">
            Outline
          </p>
          {manifest.sections.length === 0 && (
            <p className="px-2 py-1 text-slate-400">No outline found.</p>
          )}
          {manifest.sections.map((section, i) => (
            <button
              key={i}
              type="button"
              onClick={() => {
                scrollToPage(section.page);
                closeCompactOutline();
              }}
              className="block w-full truncate rounded-lg px-2 py-1.5 text-left text-slate-600 transition-colors hover:bg-slate-900/5 hover:text-slate-950 focus-visible:outline-2 focus-visible:outline-[#3b5bdb] dark:text-slate-300 dark:hover:bg-white/10 dark:hover:text-white"
              style={{ paddingLeft: 8 + (section.level - 1) * 12 }}
              title={section.title}
            >
              {section.title}
            </button>
          ))}
          <hr className="my-3 border-slate-900/10 dark:border-white/10" />
          <p className="mb-1 px-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">
            Figures
          </p>
          {manifest.assets.map((asset) => (
            <button
              key={asset.asset_id}
              type="button"
              onClick={() => {
                openPopup(asset.asset_id, null, true);
                closeCompactOutline();
              }}
              className="block w-full truncate rounded-lg px-2 py-1.5 text-left font-medium text-[#2f4ac2] transition-colors hover:bg-[#3b5bdb]/10 focus-visible:outline-2 focus-visible:outline-[#3b5bdb] dark:text-indigo-300 dark:hover:bg-white/10"
              title={asset.caption}
            >
              {asset.label}
            </button>
          ))}
        </nav>
      )}

      <div ref={scrollRef} className="h-full overflow-y-auto px-6 pb-28 pt-[88px]">
        <main className="mx-auto w-fit">
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
        </main>
      </div>

      {split && (
        <aside className="fixed inset-y-0 right-0 z-[1000] flex w-1/2 flex-col border-l border-neutral-300 bg-white dark:border-neutral-800 dark:bg-neutral-950">
          <div className="flex items-center gap-2 border-b border-neutral-300 px-3 py-2 dark:border-neutral-800">
            <span className="flex-1 truncate text-sm">{split.title}</span>
            <button type="button" onClick={() => setSplit(null)} aria-label="Close split view">
              Close
            </button>
          </div>
          {split.digest ? (
            <iframe title={split.title} src={pdfUrl(split.digest)} className="flex-1" />
          ) : (
            <p className="p-4 text-sm opacity-60">Fetching the cited paper...</p>
          )}
        </aside>
      )}

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

      {dockedPopups.length > 0 && (
        <div
          aria-label="Minimized figures"
          className="fixed bottom-6 left-1/2 z-[210] flex max-w-[calc(100vw-32px)] -translate-x-1/2 items-center gap-2 overflow-x-auto rounded-full border border-white/90 bg-white/60 px-3 py-2 shadow-[0_10px_34px_rgba(15,23,42,0.14)] backdrop-blur-xl backdrop-saturate-150 dark:border-white/15 dark:bg-slate-900/70"
        >
          <span className="px-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-400">
            Closed
          </span>
          {dockedPopups.map((popup) => {
            const asset = assetsById.get(popup.assetId);
            if (!asset) return null;
            return (
              <button
                key={popup.assetId}
                type="button"
                onClick={() => restorePopup(popup.assetId)}
                className="shrink-0 rounded-full border border-[#3b5bdb]/20 bg-[#3b5bdb]/10 px-3 py-1 text-[12.5px] font-semibold text-[#2f4ac2] transition-colors hover:bg-[#3b5bdb]/20 focus-visible:outline-2 focus-visible:outline-[#3b5bdb] dark:text-indigo-200"
                aria-label={`Restore ${asset.label}`}
              >
                {asset.label}
              </button>
            );
          })}
        </div>
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
