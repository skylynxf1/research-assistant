"use client";

import { ChevronDown, ChevronUp, LocateFixed } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { scoreChallenge, validateChallenge } from "../../lib/challenges/challenge";
import type {
  ChallengeAnswer,
  ChallengeChoice,
  ChallengeSpec,
} from "../../lib/challenges/types";
import type { SourceEvidence } from "../../lib/evidence/source";

interface Props {
  challenge: ChallengeSpec;
  paperPageCounts: Record<string, number>;
  onNavigateEvidence: (evidence: SourceEvidence) => void;
}

function ready(response: ChallengeAnswer, challenge: ChallengeSpec): boolean {
  if (response.kind === "choice") return response.choiceIds.length > 0;
  if (response.kind === "pairs" && challenge.payload.kind === "concept-match") {
    return Object.keys(response.pairs).length === challenge.payload.concepts.length;
  }
  if (response.kind === "order" && challenge.payload.kind === "ordering") {
    return response.itemIds.length === challenge.payload.items.length;
  }
  return false;
}

function initialResponse(challenge: ChallengeSpec): ChallengeAnswer {
  if (challenge.payload.kind === "concept-match") return { kind: "pairs", pairs: {} };
  if (challenge.payload.kind === "ordering") {
    return { kind: "order", itemIds: challenge.payload.items.map((item) => item.id) };
  }
  return { kind: "choice", choiceIds: [] };
}

function choiceLabel(items: ChallengeChoice[], id: string): string {
  return items.find((item) => item.id === id)?.label ?? id;
}

export default function ChallengeRendererShell({
  challenge,
  paperPageCounts,
  onNavigateEvidence,
}: Props) {
  const validation = useMemo(
    () => validateChallenge(challenge, paperPageCounts),
    [challenge, paperPageCounts],
  );
  const [response, setResponse] = useState<ChallengeAnswer>(() => initialResponse(challenge));
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    setResponse(initialResponse(challenge));
    setSubmitted(false);
  }, [challenge]);

  if (!validation.valid) return null;
  const result = submitted ? scoreChallenge(challenge, response) : null;
  const multipleChoice = challenge.payload.kind === "multiple-choice" ? challenge.payload : null;
  const conceptMatch = challenge.payload.kind === "concept-match" ? challenge.payload : null;
  const ordering = challenge.payload.kind === "ordering" ? challenge.payload : null;

  return (
    <section className="w-full max-w-xl border border-neutral-300 bg-white dark:border-neutral-700 dark:bg-neutral-950">
      <header className="border-b border-neutral-200 px-4 py-3 dark:border-neutral-800">
        <div className="mb-1 flex items-center gap-2 text-xs text-neutral-500">
          <span className="font-medium uppercase">{challenge.type.replaceAll("-", " ")}</span>
          <span>{challenge.difficulty}</span>
          {challenge.generation && <span>Generated</span>}
        </div>
        <h2 className="text-sm font-semibold leading-5">{challenge.prompt}</h2>
      </header>

      <div className="p-4">
        {multipleChoice && response.kind === "choice" && (
          <div className="grid gap-2">
            {multipleChoice.choices.map((choice) => {
              const selected = response.choiceIds.includes(choice.id);
              return (
                <button
                  key={choice.id}
                  type="button"
                  aria-pressed={selected}
                  disabled={submitted}
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

        {conceptMatch && response.kind === "pairs" && (
          <div className="grid gap-3">
            {conceptMatch.concepts.map((concept) => (
              <label key={concept.id} className="grid gap-1 text-xs font-medium">
                {concept.label}
                <select
                  value={response.pairs[concept.id] ?? ""}
                  disabled={submitted}
                  className="h-10 border border-neutral-300 bg-white px-2 text-sm font-normal dark:border-neutral-700 dark:bg-neutral-900"
                  onChange={(event) =>
                    setResponse({
                      kind: "pairs",
                      pairs: { ...response.pairs, [concept.id]: event.target.value },
                    })
                  }
                >
                  <option value="">Select a match</option>
                  {conceptMatch.definitions.map((definition) => (
                    <option key={definition.id} value={definition.id}>
                      {definition.label}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
        )}

        {ordering && response.kind === "order" && (
          <ol className="grid gap-2">
            {response.itemIds.map((itemId, index) => (
              <li key={itemId} className="flex min-h-11 items-center border border-neutral-300 px-3 dark:border-neutral-700">
                <span className="mr-3 font-mono text-xs text-neutral-500">{index + 1}</span>
                <span className="min-w-0 flex-1 text-sm">
                  {choiceLabel(ordering.items, itemId)}
                </span>
                <button
                  type="button"
                  disabled={submitted || index === 0}
                  aria-label={`Move ${choiceLabel(ordering.items, itemId)} up`}
                  className="flex h-8 w-8 items-center justify-center disabled:opacity-25"
                  onClick={() => {
                    const next = [...response.itemIds];
                    [next[index - 1], next[index]] = [next[index], next[index - 1]];
                    setResponse({ kind: "order", itemIds: next });
                  }}
                >
                  <ChevronUp aria-hidden="true" size={16} />
                </button>
                <button
                  type="button"
                  disabled={submitted || index === response.itemIds.length - 1}
                  aria-label={`Move ${choiceLabel(ordering.items, itemId)} down`}
                  className="flex h-8 w-8 items-center justify-center disabled:opacity-25"
                  onClick={() => {
                    const next = [...response.itemIds];
                    [next[index], next[index + 1]] = [next[index + 1], next[index]];
                    setResponse({ kind: "order", itemIds: next });
                  }}
                >
                  <ChevronDown aria-hidden="true" size={16} />
                </button>
              </li>
            ))}
          </ol>
        )}
      </div>

      <footer className="flex flex-wrap items-center gap-2 border-t border-neutral-200 px-4 py-3 dark:border-neutral-800">
        {!submitted && (
          <button
            type="button"
            disabled={!ready(response, challenge)}
            onClick={() => setSubmitted(true)}
            className="min-h-9 bg-sky-700 px-3 text-sm font-medium text-white disabled:opacity-40"
          >
            Check answer
          </button>
        )}
        {result && (
          <p aria-live="polite" className={`text-sm font-medium ${result.correct ? "text-emerald-700 dark:text-emerald-400" : "text-red-700 dark:text-red-400"}`}>
            {result.correct ? "Correct" : "Not correct"}
          </p>
        )}
        <div className="ml-auto flex flex-wrap gap-1">
          {challenge.source.map((evidence, index) => (
            <button
              key={`${evidence.paperId}-${evidence.page}-${index}`}
              type="button"
              onClick={() => onNavigateEvidence(evidence)}
              className="flex min-h-9 items-center gap-1.5 px-2 text-xs text-sky-700 hover:bg-sky-50 dark:text-sky-400 dark:hover:bg-sky-950"
            >
              <LocateFixed aria-hidden="true" size={14} />
              Evidence p.{evidence.page + 1}
            </button>
          ))}
        </div>
      </footer>
    </section>
  );
}
