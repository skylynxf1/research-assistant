"use client";

import { LocateFixed } from "lucide-react";
import type {
  ChallengeEvaluation,
  ChallengeLifecycle,
  EvidenceHuntChallenge,
} from "../../lib/challenges/contracts";

interface Props {
  challenge: EvidenceHuntChallenge;
  lifecycle: ChallengeLifecycle;
  selectedPassage?: { id: string; page: number; text: string };
  evaluation: ChallengeEvaluation | null;
  onCheck: () => void;
  onCompareSource: () => void;
  onRevise: () => void;
}

function headingFor(evaluation: ChallengeEvaluation): string {
  if (evaluation.state === "supported") return "Source supported";
  if (evaluation.state === "close") return "Close to the source";
  if (evaluation.state === "unresolved") return "Source unavailable";
  return "Revise the selection";
}

/** Research-native controls for selecting and checking a passage in the open paper. */
export default function EvidenceHuntRenderer({
  challenge,
  lifecycle,
  selectedPassage,
  evaluation,
  onCheck,
  onCompareSource,
  onRevise,
}: Props) {
  const locked = lifecycle === "complete" || lifecycle === "revealed";
  const needsRecovery = evaluation && evaluation.state !== "supported" && evaluation.state !== "unresolved";

  return (
    <div className="grid gap-3">
      <p className="text-sm leading-5">{challenge.payload.selectionInstruction}</p>
      <div className="border border-neutral-300 bg-neutral-50 px-3 py-2 text-xs leading-5 dark:border-neutral-700 dark:bg-neutral-900">
        {selectedPassage ? (
          <>
            <strong className="block">Selected passage, page {selectedPassage.page + 1}</strong>
            <span className="line-clamp-3">{selectedPassage.text}</span>
          </>
        ) : (
          <span>Select text in the open paper, then return here to check it.</span>
        )}
      </div>

      {!evaluation && (
        <button
          type="button"
          disabled={!selectedPassage || locked}
          onClick={onCheck}
          className="min-h-10 justify-self-start bg-sky-700 px-3 text-sm font-medium text-white disabled:opacity-40"
        >
          Check selection
        </button>
      )}

      {evaluation && (
        <section
          aria-live="polite"
          className="border-l-4 border-neutral-500 bg-neutral-50 px-3 py-3 text-sm dark:bg-neutral-900"
        >
          <p className="font-semibold">{headingFor(evaluation)}</p>
          <p className="mt-1 leading-5">{evaluation.message}</p>
          {evaluation.state === "supported" && (
            <p className="mt-2 text-xs">Evidence-grounded result: {evaluation.points} / {evaluation.maxPoints}</p>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            {evaluation.state === "supported" && (
              <button
                type="button"
                onClick={onCompareSource}
                className="flex min-h-9 items-center gap-1.5 border border-sky-700 px-3 text-sm text-sky-800 hover:bg-sky-50 dark:text-sky-300 dark:hover:bg-sky-950"
              >
                <LocateFixed aria-hidden="true" size={15} />
                Show evidence
              </button>
            )}
            {needsRecovery && (
              <>
                <button
                  type="button"
                  onClick={onCompareSource}
                  className="min-h-9 border border-neutral-400 px-3 text-sm hover:bg-neutral-100 dark:border-neutral-600 dark:hover:bg-neutral-800"
                >
                  Compare with source
                </button>
                <button
                  type="button"
                  onClick={onRevise}
                  className="min-h-9 border border-neutral-400 px-3 text-sm hover:bg-neutral-100 dark:border-neutral-600 dark:hover:bg-neutral-800"
                >
                  Revise selection
                </button>
                <button
                  type="button"
                  onClick={onCheck}
                  disabled={!selectedPassage}
                  className="min-h-9 border border-sky-700 px-3 text-sm text-sky-800 hover:bg-sky-50 disabled:opacity-40 dark:text-sky-300 dark:hover:bg-sky-950"
                >
                  Check again
                </button>
              </>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
