"use client";

import { BrainCircuit, Compass, GitBranch, Sparkles, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { ChallengeSpec } from "../../lib/challenges/contracts";
import {
  createClaimEvidence,
  createConceptMatch,
  createFigureBuild,
  createFigureDetective,
  createOrdering,
  createPaperCheck,
  createPrediction,
  createPrerequisiteChallenge,
  createQuestPlan,
  createQuickQuiz,
  createThreadExpedition,
} from "../../lib/challenges/generator";
import type { EvidenceResolver } from "../../lib/evidence/resource";
import { buildDifficultyRegions } from "../../lib/learning/difficulty";
import { buildLearningObjects } from "../../lib/learning/objects";
import { buildPrerequisiteGraph } from "../../lib/learning/prerequisites";
import { createMiniDiagram } from "../../lib/learning/visualize";
import type { PaperLearningIndex } from "../../lib/learning/paper-index";
import type { ResearchContext } from "../../lib/research-context/types";
import type { LearningProgress } from "../../lib/progress/types";

type Mode = "read" | "learn" | "quest";
type UnderstandView = "parts" | "prerequisites" | "visualize" | null;
export type LearningModeRequest = "understand" | "visualize" | "quest" | "play";

interface Props {
  index: PaperLearningIndex | null;
  resolver: EvidenceResolver | null;
  context: ResearchContext | null;
  completedChallengeIds: ReadonlySet<string>;
  progress?: LearningProgress | null;
  onStartChallenge: (challenge: ChallengeSpec) => void;
  onTrace: () => void;
  requestedAction?: LearningModeRequest;
  onRequestedActionHandled?: () => void;
}

function dots(value: number): string {
  return "●".repeat(Math.max(1, Math.min(3, Math.round(value * 2) + 1)));
}

function selectedObject(
  context: ResearchContext | null,
  objects: ReturnType<typeof buildLearningObjects>,
) {
  const selection = context?.selection?.text.toLocaleLowerCase() ?? "";
  return objects.find((object) => object.kind === "concept" && selection.includes(object.label.toLocaleLowerCase()))
    ?? objects.find((object) => object.kind === "concept");
}

/**
 * A deliberately compact layer. Read mode stays clean; Learn and Quest are explicit
 * reader-controlled overlays whose suggestions always lead back to original evidence.
 */
export default function LearningModes({
  index,
  resolver: _resolver,
  context,
  completedChallengeIds,
  progress,
  onStartChallenge,
  onTrace,
  requestedAction,
  onRequestedActionHandled,
}: Props) {
  const [mode, setMode] = useState<Mode>("read");
  const [understand, setUnderstand] = useState<UnderstandView>(null);
  const objects = useMemo(() => (index ? buildLearningObjects(index) : []), [index]);
  const regions = useMemo(() => (index ? buildDifficultyRegions(index, objects) : []), [index, objects]);
  const quest = useMemo(() => (index ? createQuestPlan(index, objects) : null), [index, objects]);
  const concept = selectedObject(context, objects);
  const prerequisites = useMemo(
    () => concept ? buildPrerequisiteGraph(objects, concept.label) : null,
    [concept, objects],
  );
  const diagram = useMemo(() => concept ? createMiniDiagram(concept, objects) : null, [concept, objects]);
  const quickQuiz = useMemo(() => (index ? createQuickQuiz(index, objects) : null), [index, objects]);
  const paperCheck = useMemo(() => (index ? createPaperCheck(index, objects) : null), [index, objects]);
  const activities = useMemo<Array<{ label: string; challenge: ChallengeSpec | null; unavailable: string }>>(() => index ? [
    { label: "Quick Quiz", challenge: createQuickQuiz(index, objects), unavailable: "No distinct literal choices were found." },
    { label: "Concept Match", challenge: createConceptMatch(index, objects), unavailable: "Fewer than two explicit definitions were found." },
    { label: "Ordering", challenge: createOrdering(index), unavailable: "The section order could not be anchored to source passages." },
    { label: "Figure Build", challenge: createFigureBuild(index, objects), unavailable: "No controlled source diagram was available; image topology was not guessed." },
    { label: "Figure Detective", challenge: createFigureDetective(index), unavailable: "No original figure with enough source-caption choices was found." },
    { label: "Prediction", challenge: createPrediction(index, objects), unavailable: "A reliable method/result boundary was not detected." },
    { label: "Claim vs Evidence", challenge: createClaimEvidence(index, objects), unavailable: "No claim literally naming an extracted asset was found." },
    { label: "Prerequisite Challenge", challenge: createPrerequisiteChallenge(index, objects), unavailable: "No literal in-paper prerequisite relation was found." },
    { label: "Thread Expedition", challenge: createThreadExpedition(index, objects), unavailable: "No defined concept had multiple exact occurrences." },
  ] : [], [index, objects]);

  useEffect(() => {
    if (!requestedAction) return;
    if (requestedAction === "quest") setMode("quest");
    if (requestedAction === "understand") {
      setMode("learn");
      setUnderstand("parts");
    }
    if (requestedAction === "visualize") {
      setMode("learn");
      setUnderstand("visualize");
    }
    if (requestedAction === "play") {
      setMode("learn");
      if (quickQuiz) onStartChallenge(quickQuiz);
    }
    onRequestedActionHandled?.();
  }, [onRequestedActionHandled, onStartChallenge, quickQuiz, requestedAction]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || mode === "read") return;
      event.stopImmediatePropagation();
      setMode("read");
      setUnderstand(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [mode]);

  const start = (challenge: ChallengeSpec | null) => {
    if (!challenge) return;
    onStartChallenge(challenge);
  };

  return (
    <aside data-tour="learn-tab" className="fixed bottom-4 right-4 z-30 w-[min(360px,calc(100vw-32px))] max-md:inset-x-3 max-md:bottom-3 max-md:w-auto text-neutral-900 dark:text-neutral-100">
      <div className="flex overflow-hidden rounded-md border border-neutral-300 bg-white/95 shadow-lg backdrop-blur dark:border-neutral-700 dark:bg-neutral-950/95">
        {(["read", "learn", "quest"] as const).map((candidate) => (
          <button
            key={candidate}
            type="button"
            aria-pressed={mode === candidate}
            onClick={() => {
              if (candidate !== "read" && mode === candidate) {
                setMode("read");
                return;
              }
              setMode(candidate);
              if (candidate === "read") setUnderstand(null);
            }}
            className={`min-h-10 flex-1 px-3 text-sm font-medium capitalize focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-sky-600 ${mode === candidate ? "bg-sky-700 text-white" : "hover:bg-neutral-100 dark:hover:bg-neutral-900"}`}
          >
            {candidate}
          </button>
        ))}
      </div>

      <section hidden={mode !== "learn"} className="mt-2 max-h-[min(550px,calc(100vh-88px))] overflow-y-auto rounded-md border border-neutral-300 bg-white p-4 shadow-xl dark:border-neutral-700 dark:bg-neutral-950">
        <header className="flex items-start gap-2">
          <BrainCircuit aria-hidden="true" className="mt-0.5 text-sky-700 dark:text-sky-300" size={18} />
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-semibold">Learn mode</h2>
            <p className="mt-1 text-xs leading-5 text-neutral-600 dark:text-neutral-300">Optional source-led support; it never interrupts scrolling.</p>
            <p className="mt-1 text-xs text-emerald-700 dark:text-emerald-300">{Object.values(progress?.conceptMastery ?? {}).filter((state) => state === "mastered").length} concepts mastered</p>
          </div>
          <button type="button" className="h-8 w-8 focus-visible:outline-2 focus-visible:outline-sky-600" onClick={() => setMode("read")} aria-label="Close Learn mode"><X aria-hidden="true" size={16} /></button>
        </header>

        <section className="mt-4" aria-label="Relative reading density">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Relative reading density</h3>
          <div className="mt-2 grid gap-1">
            {regions.map((region) => (
              <div key={region.id} className="flex items-center gap-2 text-xs">
                <span className="min-w-0 flex-1 truncate">{index?.manifest.sections.find((_section, position) => `sec-${position}` === region.sectionId)?.title}</span>
                <span aria-label={`${dots(region.difficulty).length} of 3 relative density`} className="font-mono tracking-tight text-sky-700 dark:text-sky-300">{dots(region.difficulty)}</span>
              </div>
            ))}
          </div>
          <p className="mt-2 text-[11px] leading-4 text-neutral-500">Relative to this paper only; based on source-text density, symbols, citations, terms, and asset references.</p>
        </section>

        <section className="mt-4 border-t border-neutral-200 pt-3 dark:border-neutral-800" aria-label="I don't understand this">
          <h3 className="text-sm font-semibold">I don&apos;t understand this</h3>
          {context?.selection ? (
            <p className="mt-1 line-clamp-2 text-xs text-neutral-600 dark:text-neutral-300">{context.selection.text}</p>
          ) : <p className="mt-1 text-xs text-neutral-500">Select source text to focus these actions.</p>}
          <div className="mt-2 grid grid-cols-2 gap-2">
            <button type="button" onClick={() => setUnderstand("parts")} className="min-h-9 border px-2 text-xs hover:bg-neutral-50 focus-visible:outline-2 focus-visible:outline-sky-600 dark:border-neutral-700 dark:hover:bg-neutral-900">Explain simply (source-only)</button>
            <button type="button" onClick={() => setUnderstand("parts")} className="min-h-9 border px-2 text-xs hover:bg-neutral-50 focus-visible:outline-2 focus-visible:outline-sky-600 dark:border-neutral-700 dark:hover:bg-neutral-900">Break into source parts</button>
            <button type="button" onClick={() => setUnderstand("prerequisites")} className="min-h-9 border px-2 text-xs hover:bg-neutral-50 focus-visible:outline-2 focus-visible:outline-sky-600 dark:border-neutral-700 dark:hover:bg-neutral-900">Show prerequisites</button>
            <button type="button" onClick={() => setUnderstand("visualize")} className="min-h-9 border px-2 text-xs hover:bg-neutral-50 focus-visible:outline-2 focus-visible:outline-sky-600 dark:border-neutral-700 dark:hover:bg-neutral-900">Visualize</button>
            <button type="button" onClick={onTrace} className="min-h-9 border px-2 text-xs hover:bg-neutral-50 focus-visible:outline-2 focus-visible:outline-sky-600 dark:border-neutral-700 dark:hover:bg-neutral-900">Trace in paper</button>
          </div>
          <button type="button" onClick={() => start(quickQuiz)} disabled={!quickQuiz} className="mt-2 min-h-9 w-full border border-sky-700 px-2 text-xs text-sky-800 focus-visible:outline-2 focus-visible:outline-sky-600 disabled:opacity-40 dark:text-sky-300">Learn interactively</button>

          {understand === "parts" && (
            <div className="mt-3 border-l-2 border-sky-600 pl-3 text-xs leading-5">
              <p className="font-medium">Source breakdown</p>
              <p className="mt-1 text-neutral-600 dark:text-neutral-300">Marginalia does not invent a simplified explanation. These are the surrounding author passages:</p>
              {context?.surroundingPassages.slice(0, 3).map((passage) => <p key={passage.id} className="mt-1">{passage.text}</p>)}
            </div>
          )}
          {understand === "prerequisites" && (
            <div className="mt-3 border-l-2 border-sky-600 pl-3 text-xs leading-5">
              <p className="font-medium">Prerequisites</p>
              {prerequisites?.nodes.length ? prerequisites.nodes.map((node) => <p key={node.id}>{node.label} <span className="text-neutral-500">({node.kind === "suggested" ? "suggested / generated" : "source-derived"})</span></p>) : <p className="text-neutral-500">No explicit prerequisite relationship was found in this paper.</p>}
            </div>
          )}
          {understand === "visualize" && (
            <div className="mt-3 border-l-2 border-sky-600 pl-3 text-xs leading-5">
              <p className="font-medium">{diagram?.label ?? "No controlled source map available"}</p>
              {diagram?.nodes.map((node) => <p key={node.id}>{node.kind === "concept" ? "●" : "↳"} {node.label}</p>)}
              {diagram && <p className="mt-1 text-neutral-500">The connector means “defined in” and is backed by the cited source passage.</p>}
            </div>
          )}
        </section>

        <section className="mt-4 border-t border-neutral-200 pt-3 dark:border-neutral-800" aria-labelledby="learning-activities-heading">
          <h3 id="learning-activities-heading" className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Source-grounded activities</h3>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {activities.map((activity) => (
              <button
                key={activity.label}
                type="button"
                disabled={!activity.challenge}
                title={activity.challenge ? `Open ${activity.label}` : activity.unavailable}
                onClick={() => start(activity.challenge)}
                className="min-h-9 border border-neutral-300 px-2 text-xs hover:bg-neutral-50 focus-visible:outline-2 focus-visible:outline-sky-600 disabled:cursor-not-allowed disabled:opacity-40 dark:border-neutral-700 dark:hover:bg-neutral-900"
              >
                {activity.label}{!activity.challenge && <span className="sr-only"> unavailable: {activity.unavailable}</span>}
              </button>
            ))}
          </div>
          <p className="mt-2 text-[11px] leading-4 text-neutral-500">Unavailable activities fail closed when their scored relationship cannot be proven from this paper.</p>
        </section>
      </section>

      <section hidden={mode !== "quest"} className="mt-2 max-h-[min(550px,calc(100vh-88px))] overflow-y-auto rounded-md border border-neutral-300 bg-white p-4 shadow-xl dark:border-neutral-700 dark:bg-neutral-950">
        <header className="flex items-start gap-2">
          <Compass aria-hidden="true" className="mt-0.5 text-sky-700 dark:text-sky-300" size={18} />
          <div className="flex-1"><h2 className="text-sm font-semibold">Quest mode</h2><p className="mt-1 text-xs text-neutral-600 dark:text-neutral-300">Read the paper first; choose a checkpoint when it is useful.</p></div>
          <button type="button" className="h-8 w-8 focus-visible:outline-2 focus-visible:outline-sky-600" onClick={() => setMode("read")} aria-label="Close Quest mode"><X aria-hidden="true" size={16} /></button>
        </header>
        <section className="mt-4" aria-label="Section checkpoints">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Section checkpoints</h3>
          <p className="mt-1 text-xs text-neutral-500">{completedChallengeIds.size} completed and persisted. Progress reflects source-backed interactions, not time spent.</p>
          <p className="mt-1 text-xs text-neutral-500">Relative density: {regions.map((region) => dots(region.difficulty)).join(" · ")}</p>
          <div className="mt-2 grid gap-2">
            {quest?.checkpoints.map((checkpoint) => {
              const complete = checkpoint.challenges.length > 0 && checkpoint.challenges.every((challenge) => completedChallengeIds.has(challenge.id));
              return (
                <div key={checkpoint.id} className="border border-neutral-200 p-2 dark:border-neutral-800">
                  <div className="flex gap-2"><GitBranch aria-hidden="true" className="mt-0.5 shrink-0" size={14} /><p className="min-w-0 flex-1 text-xs font-medium">{checkpoint.label}</p>{progress?.currentSectionId === checkpoint.sectionId && !complete ? <span className="text-xs text-sky-700 dark:text-sky-300">current</span> : null}{complete && <span className="text-xs text-emerald-700 dark:text-emerald-300">completed</span>}</div>
                  {checkpoint.challenges.length > 0 ? <div className="mt-2 flex flex-wrap gap-2">{checkpoint.challenges.map((challenge) => <button key={challenge.id} type="button" onClick={() => start(challenge)} className="min-h-8 border border-sky-700 px-2 text-xs text-sky-800 hover:bg-sky-50 focus-visible:outline-2 focus-visible:outline-sky-600 dark:text-sky-300 dark:hover:bg-sky-950">Open {challenge.type.replaceAll("-", " ")}{completedChallengeIds.has(challenge.id) ? " ✓" : ""}</button>)}</div> : <p className="mt-2 text-xs text-neutral-500">No high-confidence checkpoint here.</p>}
                </div>
              );
            })}
          </div>
        </section>
        {paperCheck && <button type="button" onClick={() => start(paperCheck)} className="mt-4 flex min-h-9 w-full items-center justify-center gap-2 bg-sky-700 px-3 text-sm font-medium text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600"><Sparkles aria-hidden="true" size={15} />Open Paper Check</button>}
      </section>
    </aside>
  );
}
