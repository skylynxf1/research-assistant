"use client";

import { ArrowLeft, LocateFixed, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ChallengeEvidence, ChallengeReturnRecord, ChallengeSpec } from "../../lib/challenges/contracts";
import { createEvidenceHunt } from "../../lib/challenges/evidence-hunt";
import { createChallengeReturnRecord, evidenceForDetails } from "../../lib/challenges/session";
import type { EvidenceResolver } from "../../lib/evidence/resource";
import { isSourceEvidence } from "../../lib/evidence/source";
import type { PaperLearningIndex } from "../../lib/learning/paper-index";
import { buildLearningObjects } from "../../lib/learning/objects";
import { createQuestPlan } from "../../lib/challenges/generator";
import { IndexedDbProgressRepository } from "../../lib/progress/indexed-db";
import { completeChallenge, emptyProgress, type LearningProgress } from "../../lib/progress/types";
import type { ResearchContext, SelectionContext } from "../../lib/research-context/types";
import type { CapturedSelection } from "../../lib/selection/dom";
import ChallengeRendererShell from "../games/ChallengeRendererShell";
import SelectionMenu from "../selection/SelectionMenu";
import LearningModes, { type LearningModeRequest } from "./LearningModes";

interface Props {
  selection: (CapturedSelection & { menuOpen: boolean }) | null;
  context: ResearchContext | null;
  index: PaperLearningIndex | null;
  resolver: EvidenceResolver | null;
  onSelectionMenuOpenChange: (open: boolean) => void;
  onOpenContext: () => void;
  onOpenTrace: () => void;
  onPin: () => void;
  onCopy: () => void;
  onNavigateEvidence: (evidence: ChallengeEvidence) => void;
  onPinEvidence: (evidence: ChallengeEvidence) => void;
  onFocusPaper: () => void;
  onRestorePaperPage: (page: number) => void;
}

function evidenceDescription(evidence: ChallengeEvidence, resolver: EvidenceResolver | null): string {
  const resolved = resolver?.resolve(evidence);
  const location = isSourceEvidence(evidence.source) ? `page ${evidence.source.page + 1}` : "paper metadata";
  if (resolved?.status === "resolved") {
    return [resolved.label, location, resolved.section?.title, resolved.excerpt]
      .filter(Boolean)
      .join(" \u00b7 ");
  }
  return `${evidence.source.kind} \u00b7 ${location}`;
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
  onPin,
  onCopy,
  onNavigateEvidence,
  onPinEvidence,
  onFocusPaper,
  onRestorePaperPage,
}: Props) {
  const [challenge, setChallenge] = useState<ChallengeSpec | null>(null);
  const [huntSelection, setHuntSelection] = useState<SelectionContext | undefined>();
  const [returnRecord, setReturnRecord] = useState<ChallengeReturnRecord | undefined>();
  const [view, setView] = useState<"challenge" | "evidence">("challenge");
  const [returnPage, setReturnPage] = useState<number | undefined>();
  const [clickedEvidence, setClickedEvidence] = useState<ChallengeEvidence | null>(null);
  const [progress, setProgress] = useState<LearningProgress | null>(null);
  const [learningRequest, setLearningRequest] = useState<LearningModeRequest | undefined>();
  const ignoredSelection = useRef<SelectionContext | undefined>(undefined);
  const progressRepository = useMemo(() => new IndexedDbProgressRepository(), []);
  const questPlan = useMemo(() => index ? createQuestPlan(index, buildLearningObjects(index)) : null, [index]);
  const completedChallengeIds = useMemo(() => new Set(progress?.completedChallengeIds ?? []), [progress]);

  useEffect(() => {
    let cancelled = false;
    if (!index) { setProgress(null); return; }
    progressRepository.getProgress(index.paperId).then((stored) => {
      if (!cancelled) setProgress(stored ?? emptyProgress(index.paperId));
    });
    return () => { cancelled = true; };
  }, [index, progressRepository]);

  const recordCompletion = useCallback((record: ChallengeReturnRecord) => {
    if (record.lifecycle !== "complete" || !challenge || !index) return;
    const sectionId = questPlan?.checkpoints.find((checkpoint) => checkpoint.challenges.some(({ id }) => id === challenge.id))?.sectionId;
    setProgress((current) => {
      const base = current ?? emptyProgress(index.paperId);
      if (base.completedChallengeIds.includes(record.challengeId)) return base;
      const next = completeChallenge(base, challenge, sectionId);
      void progressRepository.saveProgress(next);
      return next;
    });
  }, [challenge, index, progressRepository, questPlan]);

  const handleChallengeStateChange = useCallback((record: ChallengeReturnRecord) => {
    setReturnRecord(record);
    recordCompletion(record);
  }, [recordCompletion]);

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
    setClickedEvidence(null);
    onSelectionMenuOpenChange(false);
  };

  const startChallenge = (next: ChallengeSpec) => {
    setChallenge(next);
    setHuntSelection(undefined);
    setReturnRecord(undefined);
    setView("challenge");
    setClickedEvidence(null);
  };

  const closeChallenge = () => {
    setChallenge(null);
    setView("challenge");
    setReturnRecord(undefined);
    setClickedEvidence(null);
    onFocusPaper();
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (view === "evidence") {
        event.stopImmediatePropagation();
        backToChallenge();
        return;
      }
      if (challenge) {
        event.stopImmediatePropagation();
        closeChallenge();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [challenge, view]);

  const showEvidence = (evidence: ChallengeEvidence) => {
    if (challenge && returnRecord) setReturnRecord(createChallengeReturnRecord(returnRecord));
    setReturnPage(huntSelection?.page ?? selection?.context.page);
    setView("evidence");
    setClickedEvidence(evidence);
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

  const defaultEvidence = challenge?.mode === "scored" && challenge.answer.kind === "evidence-hunt"
    ? challenge.answer.acceptedEvidenceIds
      .map((id) => challenge.evidence.find((item) => item.id === id))
      .find((item): item is ChallengeEvidence => Boolean(item))
    : challenge?.evidence[0];
  const activeEvidence = evidenceForDetails(clickedEvidence, defaultEvidence);

  return (
    <>
      {selection?.menuOpen && (
        <SelectionMenu
          anchor={selection.anchor}
          onPin={context?.sourceWindow.selected ? onPin : undefined}
          onEvidenceHunt={context && index ? startEvidenceHunt : undefined}
          onContext={onOpenContext}
          onTrace={onOpenTrace}
          onUnderstand={() => {
            onSelectionMenuOpenChange(false);
            setLearningRequest("understand");
          }}
          onVisualize={() => {
            onSelectionMenuOpenChange(false);
            setLearningRequest("visualize");
          }}
          onPlay={() => {
            onSelectionMenuOpenChange(false);
            setLearningRequest("play");
          }}
          onCopy={onCopy}
          onClose={() => onSelectionMenuOpenChange(false)}
        />
      )}

      {challenge && view === "challenge" && index && resolver && (
        <aside className="fixed bottom-4 left-4 z-40 max-h-[min(560px,calc(100vh-32px))] w-[min(430px,calc(100vw-32px))] max-md:inset-x-3 max-md:bottom-3 max-md:w-auto overflow-y-auto">
          <div className="flex justify-end bg-white px-2 pt-2 shadow-lg dark:bg-neutral-950">
            <button
              type="button"
              onClick={closeChallenge}
              aria-label="Close learning interaction"
              className="flex h-8 w-8 items-center justify-center hover:bg-neutral-100 focus-visible:outline-2 focus-visible:outline-sky-600 dark:hover:bg-neutral-800"
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
            onPinEvidence={onPinEvidence}
            onChallengeStateChange={handleChallengeStateChange}
          />
        </aside>
      )}

      {challenge && view === "evidence" && activeEvidence && (
        <aside className="fixed bottom-4 left-4 z-40 w-[min(430px,calc(100vw-32px))] max-md:inset-x-3 max-md:bottom-3 max-md:w-auto border border-neutral-300 bg-white p-4 shadow-xl dark:border-neutral-700 dark:bg-neutral-950">
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

      <LearningModes
        index={index}
        resolver={resolver}
        context={context}
        completedChallengeIds={completedChallengeIds}
        progress={progress}
        onStartChallenge={startChallenge}
        onTrace={onOpenTrace}
        requestedAction={learningRequest}
        onRequestedActionHandled={() => setLearningRequest(undefined)}
      />
    </>
  );
}
