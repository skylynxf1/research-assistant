"use client";

import { ChevronDown, ChevronUp, LocateFixed } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { scoreChallenge } from "../../lib/challenges/challenge";
import type {
  ChallengeEvidence,
  ChallengeLifecycle,
  ChallengeReturnRecord,
  ChallengeSpec,
  LearnerResponse,
} from "../../lib/challenges/contracts";
import { evaluateEvidenceHunt } from "../../lib/challenges/evidence-hunt";
import { validateChallenge } from "../../lib/challenges/validator";
import type { EvidenceResolver } from "../../lib/evidence/resource";
import { passageForSelection, type PaperLearningIndex } from "../../lib/learning/paper-index";
import type { SelectionContext } from "../../lib/research-context/types";
import EvidenceHuntRenderer from "./EvidenceHuntRenderer";

interface EvidenceHuntContext {
  index: PaperLearningIndex;
  selection?: SelectionContext;
}

interface Props {
  challenge: ChallengeSpec;
  resolver?: EvidenceResolver;
  evidenceHuntContext?: EvidenceHuntContext;
  position?: number;
  initialReturnRecord?: ChallengeReturnRecord;
  onNavigateEvidence: (evidence: ChallengeEvidence) => void;
  onFocusPaper?: () => void;
  onChallengeStateChange?: (record: ChallengeReturnRecord) => void;
}

function initialResponse(challenge: ChallengeSpec, record?: ChallengeReturnRecord): LearnerResponse {
  if (record?.challengeId === challenge.id) return record.response;
  if (challenge.payload.kind === "concept-match") return { kind: "pairs", pairs: {} };
  if (challenge.payload.kind === "ordering") {
    return { kind: "order", itemIds: challenge.payload.items.map((item) => item.id) };
  }
  if (challenge.payload.kind === "evidence-hunt") return { kind: "evidence-hunt" };
  return { kind: "choice", choiceIds: [] };
}

function choiceLabel(items: readonly { id: string; label: string }[], id: string): string {
  return items.find((item) => item.id === id)?.label ?? id;
}

function ready(response: LearnerResponse, challenge: ChallengeSpec): boolean {
  if (response.kind === "choice") return response.choiceIds.length > 0;
  if (response.kind === "pairs" && challenge.payload.kind === "concept-match") {
    return Object.keys(response.pairs).length === challenge.payload.concepts.length;
  }
  if (response.kind === "order" && challenge.payload.kind === "ordering") {
    return response.itemIds.length === challenge.payload.items.length;
  }
  return false;
}

function sourceLabel(evidence: ChallengeEvidence, resolver?: EvidenceResolver): string {
  const resolved = resolver?.resolve(evidence);
  const page = `p. ${evidence.source.page + 1}`;
  if (resolved?.status === "resolved") {
    return [resolved.label, page, resolved.section?.title].filter(Boolean).join(" / ");
  }
  return `${evidence.source.kind} / ${page}`;
}

/**
 * Orchestrates validated challenge lifecycle and evidence navigation. Individual research
 * interactions own their controls; this shell only supplies shared instructions/results.
 */
export default function ChallengeRendererShell({
  challenge,
  resolver,
  evidenceHuntContext,
  position,
  initialReturnRecord,
  onNavigateEvidence,
  onFocusPaper,
  onChallengeStateChange,
}: Props) {
  const validation = useMemo(() => validateChallenge(challenge, resolver), [challenge, resolver]);
  const [response, setResponse] = useState<LearnerResponse>(() => initialResponse(challenge, initialReturnRecord));
  const [lifecycle, setLifecycle] = useState<ChallengeLifecycle>(
    initialReturnRecord?.challengeId === challenge.id ? initialReturnRecord.lifecycle : "active",
  );
  const [genericResult, setGenericResult] = useState<ReturnType<typeof scoreChallenge>>(null);
  const [huntEvaluation, setHuntEvaluation] = useState<ReturnType<typeof evaluateEvidenceHunt> | null>(null);

  useEffect(() => {
    setResponse(initialResponse(challenge));
    setLifecycle("active");
    setGenericResult(null);
    setHuntEvaluation(null);
  }, [challenge]);

  useEffect(() => {
    onChallengeStateChange?.({
      challengeId: challenge.id,
      lifecycle,
      response,
      ...(position === undefined ? {} : { position }),
      focusTargetId: `challenge-${challenge.id}`,
    });
  }, [challenge.id, lifecycle, onChallengeStateChange, position, response]);

  // A scored spec without resolved, relationship-level source evidence never renders.
  if (!validation.valid) return null;

  const multipleChoice = challenge.payload.kind === "multiple-choice" ? challenge.payload : null;
  const conceptMatch = challenge.payload.kind === "concept-match" ? challenge.payload : null;
  const ordering = challenge.payload.kind === "ordering" ? challenge.payload : null;
  const evidenceHunt = challenge.type === "evidence-hunt" && challenge.payload.kind === "evidence-hunt"
    ? challenge
    : null;
  const selectedPassage = evidenceHuntContext?.selection
    ? passageForSelection(evidenceHuntContext.index, evidenceHuntContext.selection)
    : undefined;

  const submitGeneric = () => {
    const result = scoreChallenge(challenge, response);
    if (!result) return;
    setGenericResult(result);
    setLifecycle("complete");
  };

  const checkEvidenceHunt = () => {
    if (!evidenceHunt || !evidenceHuntContext || !resolver) {
      setHuntEvaluation({ state: "unresolved", message: "This activity cannot verify a source-grounded answer.", points: 0, maxPoints: 0 });
      return;
    }
    setResponse({ kind: "evidence-hunt", ...(selectedPassage ? { selectedPassageId: selectedPassage.id } : {}) });
    const evaluation = evaluateEvidenceHunt(
      evidenceHunt,
      evidenceHuntContext.selection,
      evidenceHuntContext.index,
      resolver,
    );
    setHuntEvaluation(evaluation);
    setLifecycle(evaluation.state === "supported" ? "complete" : "submitted");
  };

  const compareEvidence = () => {
    const target = evidenceHunt?.mode === "scored"
      ? evidenceHunt.answer.acceptedEvidenceIds
        .map((id) => evidenceHunt.evidence.find((item) => item.id === id))
        .find((item): item is ChallengeEvidence => Boolean(item))
      : challenge.evidence[0];
    if (target) onNavigateEvidence(target);
  };

  return (
    <section
      id={`challenge-${challenge.id}`}
      aria-label={`${challenge.type.replaceAll("-", " ")} challenge`}
      tabIndex={-1}
      className="w-full max-w-xl border border-neutral-300 bg-white shadow-lg dark:border-neutral-700 dark:bg-neutral-950"
    >
      <header className="border-b border-neutral-200 px-4 py-3 dark:border-neutral-800">
        <div className="mb-1 flex items-center gap-2 text-xs text-neutral-500">
          <span className="font-medium uppercase">{challenge.type.replaceAll("-", " ")}</span>
          <span>{challenge.difficulty}</span>
          <span>{challenge.mode === "scored" ? "Source-grounded" : "Explore (unscored)"}</span>
        </div>
        <h2 className="text-sm font-semibold leading-5">{challenge.prompt}</h2>
      </header>

      <div className="p-4">
        {evidenceHunt && (
          <EvidenceHuntRenderer
            challenge={evidenceHunt}
            lifecycle={lifecycle}
            selectedPassage={selectedPassage}
            evaluation={huntEvaluation}
            onCheck={checkEvidenceHunt}
            onCompareSource={compareEvidence}
            onRevise={() => {
              setHuntEvaluation(null);
              setLifecycle("active");
              onFocusPaper?.();
            }}
          />
        )}

        {!evidenceHunt && multipleChoice && response.kind === "choice" && (
          <div className="grid gap-2">
            {multipleChoice.choices.map((choice) => {
              const selected = response.choiceIds.includes(choice.id);
              return (
                <button
                  key={choice.id}
                  type="button"
                  aria-pressed={selected}
                  disabled={lifecycle === "complete"}
                  className={`min-h-10 border px-3 py-2 text-left text-sm ${
                    selected
                      ? "border-sky-600 bg-sky-50 dark:bg-sky-950"
                      : "border-neutral-300 hover:bg-neutral-50 dark:border-neutral-700 dark:hover:bg-neutral-900"
                  }`}
                  onClick={() =>
                    setResponse({
                      kind: "choice",
                      choiceIds: multipleChoice.multiple
                        ? selected
                          ? response.choiceIds.filter((id) => id !== choice.id)
                          : [...response.choiceIds, choice.id]
                        : [choice.id],
                    })
                  }
                >
                  {choice.label}
                </button>
              );
            })}
          </div>
        )}

        {!evidenceHunt && conceptMatch && response.kind === "pairs" && (
          <div className="grid gap-3">
            {conceptMatch.concepts.map((concept) => (
              <label key={concept.id} className="grid gap-1 text-xs font-medium">
                {concept.label}
                <select
                  value={response.pairs[concept.id] ?? ""}
                  disabled={lifecycle === "complete"}
                  className="h-10 border border-neutral-300 bg-white px-2 text-sm font-normal dark:border-neutral-700 dark:bg-neutral-900"
                  onChange={(event) => setResponse({ kind: "pairs", pairs: { ...response.pairs, [concept.id]: event.target.value } })}
                >
                  <option value="">Select a match</option>
                  {conceptMatch.definitions.map((definition) => (
                    <option key={definition.id} value={definition.id}>{definition.label}</option>
                  ))}
                </select>
              </label>
            ))}
          </div>
        )}

        {!evidenceHunt && ordering && response.kind === "order" && (
          <ol className="grid gap-2">
            {response.itemIds.map((itemId, index) => (
              <li key={itemId} className="flex min-h-11 items-center border border-neutral-300 px-3 dark:border-neutral-700">
                <span className="mr-3 font-mono text-xs text-neutral-500">{index + 1}</span>
                <span className="min-w-0 flex-1 text-sm">{choiceLabel(ordering.items, itemId)}</span>
                <button
                  type="button"
                  disabled={lifecycle === "complete" || index === 0}
                  aria-label={`Move ${choiceLabel(ordering.items, itemId)} up`}
                  className="flex h-8 w-8 items-center justify-center disabled:opacity-25"
                  onClick={() => {
                    const next = [...response.itemIds];
                    [next[index - 1], next[index]] = [next[index], next[index - 1]];
                    setResponse({ kind: "order", itemIds: next });
                  }}
                ><ChevronUp aria-hidden="true" size={16} /></button>
                <button
                  type="button"
                  disabled={lifecycle === "complete" || index === response.itemIds.length - 1}
                  aria-label={`Move ${choiceLabel(ordering.items, itemId)} down`}
                  className="flex h-8 w-8 items-center justify-center disabled:opacity-25"
                  onClick={() => {
                    const next = [...response.itemIds];
                    [next[index], next[index + 1]] = [next[index + 1], next[index]];
                    setResponse({ kind: "order", itemIds: next });
                  }}
                ><ChevronDown aria-hidden="true" size={16} /></button>
              </li>
            ))}
          </ol>
        )}
      </div>

      <footer className="border-t border-neutral-200 px-4 py-3 dark:border-neutral-800">
        {!evidenceHunt && challenge.mode === "scored" && !genericResult && (
          <button
            type="button"
            disabled={!ready(response, challenge)}
            onClick={submitGeneric}
            className="min-h-9 bg-sky-700 px-3 text-sm font-medium text-white disabled:opacity-40"
          >
            Check answer
          </button>
        )}
        {!evidenceHunt && challenge.mode === "explore" && (
          <p className="text-sm text-neutral-600 dark:text-neutral-300">Explore this source relationship; it does not make a scored correctness claim.</p>
        )}
        {genericResult && (
          <p aria-live="polite" className="mt-2 text-sm font-medium">
            {genericResult.correct
              ? "This response matches the source-grounded relationship."
              : "This response does not match the source-grounded relationship. Review the evidence and revise."}
          </p>
        )}
        <div className="mt-3 grid gap-1">
          {challenge.evidence.map((evidence) => {
            const resolved = resolver?.resolve(evidence);
            return (
              <button
                key={evidence.id}
                type="button"
                onClick={() => onNavigateEvidence(evidence)}
                className="flex min-h-9 items-start gap-2 border border-neutral-200 px-2 py-2 text-left text-xs hover:bg-neutral-50 dark:border-neutral-800 dark:hover:bg-neutral-900"
              >
                <LocateFixed aria-hidden="true" className="mt-0.5 shrink-0" size={14} />
                <span>
                  <strong className="block">{sourceLabel(evidence, resolver)}</strong>
                  <span className="line-clamp-2">{resolved?.status === "resolved" ? resolved.excerpt : evidence.source.text ?? evidence.reason}</span>
                  <span className="block text-neutral-500">{evidence.reason}</span>
                </span>
              </button>
            );
          })}
        </div>
      </footer>
    </section>
  );
}