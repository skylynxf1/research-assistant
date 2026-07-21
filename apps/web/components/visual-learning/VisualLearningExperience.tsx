"use client";

import { LoaderCircle, ShieldCheck } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { blobUrl } from "../../lib/api";
import { challengeEvidence, type ChallengeEvidence } from "../../lib/challenges/contracts";
import type { EvidenceResolver } from "../../lib/evidence/resource";
import { evidenceKey, passageEvidence } from "../../lib/evidence/source";
import type { PaperLearningIndex } from "../../lib/learning/paper-index";
import type { ResearchContext } from "../../lib/research-context/types";
import {
  generateVisualChallenge,
  generateVisualLearning,
  VisualGenerationClientError,
} from "../../lib/visual-learning/client";
import type { VisualChallengeSpec, VisualGenerationRequest, VisualLearningSpec } from "../../lib/visual-learning/contracts";
import { createDeterministicVisualFallback } from "../../lib/visual-learning/fallback";
import { createVisualGenerationRequest } from "../../lib/visual-learning/request";
import LocalAiStatus from "./LocalAiStatus";
import VisualChallengeCanvas from "./VisualChallengeCanvas";
import VisualLearningCanvas from "./VisualLearningCanvas";

type ExperienceKind = "visualize" | "game" | "quest";

interface Props {
  kind: ExperienceKind;
  context: ResearchContext;
  currentContext: ResearchContext | null;
  index: PaperLearningIndex;
  resolver: EvidenceResolver;
  onNavigateEvidence: (evidence: ChallengeEvidence) => void;
  onFocusPaper: () => void;
  onUseDeterministicFallback: () => void;
  onGeneratedChallengeComplete: (id: string) => void;
}

const stages = ["Understanding evidence", "Finding relationships", "Building visual", "Validating sources"];
const GENERATION_TIMEOUT_MS = 120_000;

function evidenceForId(request: VisualGenerationRequest, index: PaperLearningIndex, id: string): ChallengeEvidence | null {
  const item = request.sourceEvidence.find((candidate) => candidate.id === id);
  if (!item) return null;
  if (item.source.kind === "passage") {
    // The generation request contains a bounded excerpt, but the evidence id was created
    // from the full indexed passage. Restore that canonical source before navigation so
    // the details panel and exact PDF highlight never point at a truncated copy.
    const passage = index.passages.find((candidate) => evidenceKey(passageEvidence(index.paperId, candidate.page, candidate.text, {
      ...(candidate.bbox ? { bbox: candidate.bbox } : {}),
      ...(candidate.sectionId ? { sectionId: candidate.sectionId } : {}),
    })) === id);
    if (passage) {
      return challengeEvidence(passageEvidence(index.paperId, passage.page, passage.text, {
        ...(passage.bbox ? { bbox: passage.bbox } : {}),
        ...(passage.sectionId ? { sectionId: passage.sectionId } : {}),
      }), item.reason, { kind: "passage", resourceId: passage.id });
    }
    return challengeEvidence(item.source, item.reason);
  }
  if (item.source.kind === "citation" && item.source.refId) {
    return challengeEvidence(item.source, item.reason, { kind: "citation", resourceId: item.source.refId });
  }
  return challengeEvidence(item.source, item.reason);
}

function currentSelectionEvidenceId(context: ResearchContext | null, paperId: string): string | undefined {
  const passage = context?.sourceWindow.selected;
  if (!passage) return undefined;
  return evidenceKey(passageEvidence(paperId, passage.page, passage.text, {
    ...(passage.bbox ? { bbox: passage.bbox } : {}),
    ...(passage.sectionId ? { sectionId: passage.sectionId } : {}),
  }));
}

export default function VisualLearningExperience({
  kind,
  context,
  currentContext,
  index,
  resolver,
  onNavigateEvidence,
  onFocusPaper,
  onUseDeterministicFallback,
  onGeneratedChallengeComplete,
}: Props) {
  const request = useMemo(() => createVisualGenerationRequest(context, index, resolver, {
    intent: kind === "visualize" ? "visualize" : kind === "quest" ? "build-game" : "process-game",
    learningMode: kind === "visualize" ? "learn" : kind === "quest" ? "quest" : "play",
  }), [context, index, kind, resolver]);
  const [learning, setLearning] = useState<VisualLearningSpec | null>(null);
  const [challenge, setChallenge] = useState<VisualChallengeSpec | null>(null);
  const [loading, setLoading] = useState(true);
  const [stage, setStage] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const generationKey = request ? `${kind}:${request.paper.paperId}:${request.sourceEvidence.map((item) => item.id).join(",")}` : "none";

  useEffect(() => {
    if (!request) {
      setLoading(false);
      setMessage("This selection did not resolve to enough verified source evidence.");
      return;
    }
    // React Strict Mode deliberately runs effect setup/cleanup twice in development.
    // Do not suppress the second setup: the first request was aborted by that cleanup.
    let disposed = false;
    const controller = new AbortController();
    setLearning(null);
    setChallenge(null);
    setMessage(null);
    setLoading(true);
    setStage(0);
    const interval = window.setInterval(() => setStage((value) => Math.min(stages.length - 1, value + 1)), 1300);
    const timeout = window.setTimeout(() => controller.abort("generation-timeout"), GENERATION_TIMEOUT_MS);

    const operation = kind === "visualize"
      ? generateVisualLearning(request, { signal: controller.signal })
      : generateVisualChallenge(request, { signal: controller.signal });
    void operation.then((response) => {
      if (response.status === "insufficient-evidence") {
        if (kind === "visualize") setLearning(createDeterministicVisualFallback(request));
        setMessage(response.reason);
        return;
      }
      if (kind === "visualize" && "visualizationType" in response.spec) setLearning(response.spec);
      else if ("gameType" in response.spec) setChallenge(response.spec);
    }).catch((error) => {
      if (disposed) return;
      if (kind === "visualize") setLearning(createDeterministicVisualFallback(request));
      setMessage(controller.signal.aborted
        ? "Local visual generation timed out. A safe source-grounded fallback is available; try a shorter passage if you want to regenerate."
        : error instanceof VisualGenerationClientError ? error.message : "Visual generation failed safely.");
    }).finally(() => {
      window.clearInterval(interval);
      window.clearTimeout(timeout);
      if (!disposed) setLoading(false);
    });

    return () => {
      disposed = true;
      controller.abort("effect-cleanup");
      window.clearInterval(interval);
      window.clearTimeout(timeout);
    };
    // generationKey captures the immutable request identity. Depending on the request
    // object itself would restart generation when parent contexts are rebuilt unchanged.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [generationKey, kind]);

  const showEvidence = (id: string) => {
    if (!request) return;
    const evidence = evidenceForId(request, index, id);
    if (evidence) onNavigateEvidence(evidence);
  };
  const assetImages = Object.fromEntries((request?.assets ?? []).flatMap((asset) => asset.imageUrl ? [[asset.id, blobUrl(asset.imageUrl)]] : []));
  const selectedEvidenceId = currentSelectionEvidenceId(currentContext, index.paperId);

  if (loading) return (
    <section className="grid min-h-80 place-items-center rounded-2xl border border-neutral-300 bg-white p-8 text-center shadow-xl dark:border-neutral-700 dark:bg-neutral-950" aria-live="polite">
      <div><LoaderCircle aria-hidden="true" className="mx-auto animate-spin motion-reduce:animate-none text-violet-600" size={30} /><h2 className="mt-4 text-base font-semibold">Building a source-grounded {kind === "visualize" ? "visual" : "game"}</h2><p className="mt-2 text-sm text-neutral-600 dark:text-neutral-300">{stages[stage]}</p><p className="mt-2 text-xs text-neutral-500">No fake percentage—the result appears only after schema and source validation.</p></div>
    </section>
  );

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-2"><LocalAiStatus compact /><span className="flex items-center gap-1 text-xs text-neutral-500"><ShieldCheck aria-hidden="true" size={14} />Paper remains authoritative</span></div>
      {message && <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs leading-5 dark:border-amber-900 dark:bg-amber-950/30" role="status">{message}</p>}
      {learning && <VisualLearningCanvas spec={learning} onShowEvidence={showEvidence} />}
      {challenge && <VisualChallengeCanvas spec={challenge} onShowEvidence={showEvidence} onFocusPaper={onFocusPaper} selectedEvidenceId={selectedEvidenceId} assetImages={assetImages} onComplete={() => onGeneratedChallengeComplete(challenge.id)} />}
      {!learning && !challenge && kind !== "visualize" && (
        <section className="rounded-2xl border border-neutral-300 bg-white p-5 shadow-xl dark:border-neutral-700 dark:bg-neutral-950"><h2 className="font-semibold">No safe generated game</h2><p className="mt-2 text-sm text-neutral-600 dark:text-neutral-300">Use Marginalia&apos;s deterministic source activity instead; nothing unsupported was turned into a score.</p><button type="button" onClick={onUseDeterministicFallback} className="mt-4 min-h-10 rounded-md bg-sky-700 px-4 text-sm font-semibold text-white">Open deterministic source activity</button></section>
      )}
    </div>
  );
}
