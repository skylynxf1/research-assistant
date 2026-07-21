"use client";

import { Image, LocateFixed, X } from "lucide-react";
import type { ConceptThread } from "../../lib/learning/types";
import type { ResearchContext } from "../../lib/research-context/types";
import type { SourceEvidence } from "../../lib/evidence/source";

interface Props {
  mode: "context" | "thread";
  context: ResearchContext;
  thread?: ConceptThread;
  onNavigateEvidence: (evidence: SourceEvidence) => void;
  onOpenAsset: (assetId: string) => void;
  onClose: () => void;
}

const evidenceButtonClass =
  "flex min-h-9 w-full items-start gap-2 border-t border-neutral-200 px-4 py-2 text-left text-xs leading-5 hover:bg-neutral-100 dark:border-neutral-800 dark:hover:bg-neutral-900";

export default function SelectionActionPanel({
  mode,
  context,
  thread,
  onNavigateEvidence,
  onOpenAsset,
  onClose,
}: Props) {
  return (
    <aside className="fixed bottom-0 right-0 top-[45px] z-30 flex w-[min(380px,100vw)] flex-col border-l border-neutral-300 bg-white text-neutral-900 shadow-xl dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-100">
      <header className="flex h-12 shrink-0 items-center gap-3 border-b border-neutral-200 px-4 dark:border-neutral-800">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">
            {mode === "thread" ? context.selection?.text : context.section?.title || "Source context"}
          </p>
          <p className="text-xs text-neutral-500">
            {mode === "thread" ? `${thread?.occurrences.length ?? 0} occurrences` : `Page ${(context.selection?.page ?? 0) + 1}`}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close selection panel"
          className="flex h-8 w-8 items-center justify-center rounded hover:bg-neutral-100 dark:hover:bg-neutral-800"
        >
          <X aria-hidden="true" size={17} />
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {mode === "context" && (
          <>
            {context.selection && (
              <blockquote className="border-b border-neutral-200 px-4 py-4 text-sm leading-6 dark:border-neutral-800">
                {context.selection.text}
              </blockquote>
            )}

            {context.sourceWindow.before.map((passage) => (
              <p key={passage.id} className="border-b border-neutral-200 px-4 py-3 text-xs leading-5 text-neutral-600 dark:border-neutral-800 dark:text-neutral-400">
                {passage.text}
              </p>
            ))}
            {context.sourceWindow.selected && (
              <button
                type="button"
                className={evidenceButtonClass}
                onClick={() =>
                  onNavigateEvidence({
                    paperId: context.paper.paperId,
                    page: context.sourceWindow.selected!.page,
                    kind: "passage",
                    text: context.sourceWindow.selected!.text,
                    bbox: context.sourceWindow.selected!.bbox,
                    sectionId: context.sourceWindow.selected!.sectionId,
                  })
                }
              >
                <LocateFixed aria-hidden="true" className="mt-0.5 shrink-0" size={15} />
                <span>{context.sourceWindow.selected.text}</span>
              </button>
            )}
            {context.sourceWindow.after.map((passage) => (
              <p key={passage.id} className="border-b border-neutral-200 px-4 py-3 text-xs leading-5 text-neutral-600 dark:border-neutral-800 dark:text-neutral-400">
                {passage.text}
              </p>
            ))}

            {context.nearbyAssets.length > 0 && (
              <section aria-label="Nearby assets">
                {context.nearbyAssets.map((asset) => (
                  <button
                    key={asset.assetId}
                    type="button"
                    className={evidenceButtonClass}
                    onClick={() => onOpenAsset(asset.assetId)}
                  >
                    <Image aria-hidden="true" className="mt-0.5 shrink-0" size={15} />
                    <span>
                      <strong className="block font-medium">{asset.label}</strong>
                      <span className="line-clamp-2 text-neutral-500">{asset.caption}</span>
                    </span>
                  </button>
                ))}
              </section>
            )}
          </>
        )}

        {mode === "thread" && thread && (
          <div>
            {thread.groups.map((group, groupIndex) => (
              <section key={group.section?.sectionId ?? `group-${groupIndex}`}>
                <h2 className="sticky top-0 border-b border-neutral-200 bg-neutral-50 px-4 py-2 text-xs font-semibold text-neutral-600 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-300">
                  {group.section?.title ?? "Unsectioned"}
                </h2>
                {group.occurrences.map((occurrence) => (
                  <button
                    key={occurrence.id}
                    type="button"
                    className={evidenceButtonClass}
                    onClick={() => onNavigateEvidence(occurrence.evidence)}
                  >
                    <span className="mt-0.5 shrink-0 font-mono text-[11px] text-sky-700 dark:text-sky-400">
                      p.{occurrence.page + 1}
                    </span>
                    <span className="line-clamp-3">{occurrence.passage.text}</span>
                  </button>
                ))}
              </section>
            ))}
            {thread.occurrences.length === 0 && (
              <p className="px-4 py-6 text-sm text-neutral-500">No exact occurrences found.</p>
            )}
          </div>
        )}
      </div>
    </aside>
  );
}
