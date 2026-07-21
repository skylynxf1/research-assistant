"use client";

import { ArrowLeft, LocateFixed, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { ChallengeEvidence, ChallengeReturnRecord, EvidenceHuntChallenge } from "../../lib/challenges/contracts";
import { createEvidenceHunt } from "../../lib/challenges/evidence-hunt";
import { createChallengeReturnRecord } from "../../lib/challenges/session";
import type { EvidenceResolver } from "../../lib/evidence/resource";
import type { PaperLearningIndex } from "../../lib/learning/paper-index";
import type { ResearchContext, SelectionContext } from "../../lib/research-context/types";
import type { CapturedSelection } from "../../lib/selection/dom";
import ChallengeRendererShell from "../games/ChallengeRendererShell";
import SelectionMenu from "../selection/SelectionMenu";

interface Props {
  selection: (CapturedSelection & { menuOpen: boolean }) | null;
  context: ResearchContext | null;
  index: PaperLearningIndex | null;
  resolver: EvidenceResolver | null;
  onSelectionMenuOpenChange: (open: boolean) => void;
  onOpenContext: () => void;
  onOpenTrace: () => void;
  onCopy: () => void;
  onNavigateEvidence: (evidence: ChallengeEvidence) => void;
  onFocusPaper: () => void;
  onRestorePaperPage: (page: number) => void;
}

function evidenceDescription(evidence: ChallengeEvidence, resolver: EvidenceResolver | null): string {
  const resolved = resolver?.resolve(evidence);
  if (resolved?.status === "resolved") {
    return [resolved.label, `page ${evidence.source.page + 1}`, resolved.section?.title, resolved.excerpt]
      .filter(Boolean)
      .join(" Â· ");
  }
  return `${evidence.source.kind} Â· page ${evidence.source.page + 1}`;
}

/**
 * Keeps learning state adjacent to Reader without turning Reader into a game controller.
 * The paper remains visible while a compact interaction is open.
 */
export default function ReaderLearningLayer({
  selection,
  context,
  index,
  resolver,
  onSelectionMenuOpenChange,
  onOpenContext,
  onOpenTrace,
  onCopy,
  onNavigateEvidence,
  onFocusPaper,
  onRestorePaperPage,
}: Props) {
  const [challenge, setChallenge] = useState<EvidenceHuntChallenge | null>(null);
  const [huntSelection, setHuntSelection] = useState<SelectionContext | undefined>();
  const [returnRecord, setReturnRecord] = useState<ChallengeReturnRecord | undefined>();
  const [view, setView] = useState<"challenge" | "evidence">("challenge");
  const [returnPage, setReturnPage] = useState<number | undefined>();
  const ignoredSelection = useRef<SelectionContext | undefined>(undefined);

  useEffect(() => {
    const next = selection?.context;
    if (!challenge || !next || next === ignoredSelection.current) return;
    setHuntSelection(next);
  }, [challenge, selection?.context]);

  const startEvidenceHunt = () => {
    if (!context || !index) return;
    const next = createEvidenceHunt(context, index);
    if (!next) return;
    ignoredSelection.current = selection?.context;
    setChallenge(next);
    setHuntSelection(undefined);
    setReturnRecord(undefined);
    setView("challenge");
    onSelectionMenuOpenChange(false);
  };

  const showEvidence = (evidence: ChallengeEvidence) => {
    if (challenge && returnRecord) setReturnRecord(createChallengeReturnRecord(returnRecord));
    setReturnPage(huntSelection?.page ?? selection?.context.page);
    setView("evidence");
    onNavigateEvidence(evidence);
  };

  const backToChallenge = () => {
    setView("challenge");
    if (returnPage !== undefined) onRestorePaperPage(returnPage);
    window.requestAnimationFrame(() => {
      const id = returnRecord?.focusTargetId ?? (challenge ? `challenge-${challenge.id}` : undefined);
      if (id) document.getElementById(id)?.focus();
    });
  };

  const activeEvidence = challenge?.mode === "scored"
    ? challenge.answer.acceptedEvidenceIds
      .map((id) => challenge.evidence.find((item) => item.id === id))
      .find((item): item is ChallengeEvidence => Boolean(item))
    : undefined;

  return (
    <>
      {selection?.menuOpen && (
        <SelectionMenu
          anchor={selection.anchor}
          onEvidenceHunt={context && index ? startEvidenceHunt : undefined}
          onContext={onOpenContext}
          onTrace={onOpenTrace}
          onCopy={onCopy}
          onClose={() => onSelectionMenuOpenChange(false)}
        />
      )}

      {challenge && view === "challenge" && index && resolver && (
        <aside className="fixed bottom-4 left-4 z-40 max-h-[min(560px,calc(100vh-32px))] w-[min(430px,calc(100vw-32px))] overflow-y-auto">
          <div className="flex justify-end bg-white px-2 pt-2 shadow-lg dark:bg-neutral-950">
            <button
              type="button"
              onClick={() => setChallenge(null)}
              aria-label="Close learning interaction"
              className="flex h-8 w-8 items-center justify-center hover:bg-neutral-100 dark:hover:bg-neutral-800"
            >
              <X aria-hidden="true" size={16} />
            </button>
          </div>
          <ChallengeRendererShell
            challenge={challenge}
            resolver={resolver}
            evidenceHuntContext={{ index, selection: huntSelection }}
            initialReturnRecord={returnRecord}
            onFocusPaper={onFocusPaper}
            onNavigateEvidence={showEvidence}
            onChallengeStateChange={setReturnRecord}
          />
        </aside>
      )}

      {challenge && view === "evidence" && activeEvidence && (
        <aside className="fixed bottom-4 left-4 z-40 w-[min(430px,calc(100vw-32px))] border border-neutral-300 bg-white p-4 shadow-xl dark:border-neutral-700 dark:bg-neutral-950">
          <p className="text-xs font-medium uppercase text-neutral-500">Source evidence</p>
          <p className="mt-2 text-sm leading-6">{evidenceDescription(activeEvidence, resolver)}</p>
          <p className="mt-2 text-xs leading-5 text-neutral-600 dark:text-neutral-300">{activeEvidence.reason}</p>
          <button
            type="button"
            onClick={backToChallenge}
            className="mt-4 flex min-h-9 items-center gap-1.5 border border-sky-700 px-3 text-sm text-sky-800 hover:bg-sky-50 dark:text-sky-300 dark:hover:bg-sky-950"
          >
            <ArrowLeft aria-hidden="true" size={15} />
            Back to challenge
          </button>
          <p className="mt-3 flex items-center gap-1.5 text-xs text-neutral-500">
            <LocateFixed aria-hidden="true" size={14} />
            The matching source is highlighted in the paper.
          </p>
        </aside>
      )}
    </>
  );
}
