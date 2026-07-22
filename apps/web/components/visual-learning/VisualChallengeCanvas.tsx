"use client";

import {
  Background,
  Controls,
  Handle,
  Position,
  ReactFlow,
  type Connection,
  type Edge,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import { motion, useReducedMotion } from "motion/react";
import { Check, ChevronLeft, ChevronRight, Lightbulb, Link2, LocateFixed, RotateCcw, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { scoreVisualChallenge, type VisualLearnerState } from "../../lib/visual-learning/scoring";
import type { VisualChallengeSpec } from "../../lib/visual-learning/contracts";
import { emitUIAgentEvent } from "../../lib/ui-agent/events";
import { useUIAgent } from "../ui-agent/UIAgentProvider";

interface GameNodeData extends Record<string, unknown> {
  label: string;
  kind: string;
  selected: boolean;
}
function GameNode({ data }: NodeProps<Node<GameNodeData>>) {
  return (
    <motion.div
      initial={false}
      animate={{ scale: data.selected ? 1.04 : 1 }}
      className={`min-w-36 max-w-48 rounded-xl border-2 bg-white px-3 py-3 text-center shadow-md dark:bg-neutral-950 ${data.selected ? "border-violet-600 ring-4 ring-violet-200/50 dark:ring-violet-900" : "border-neutral-300 dark:border-neutral-700"}`}
    >
      <Handle type="target" position={Position.Left} className="!bg-violet-600" />
      <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-500">{data.kind}</p>
      <p className="mt-1 text-sm font-semibold">{data.label}</p>
      <Handle type="source" position={Position.Right} className="!bg-violet-600" />
    </motion.div>
  );
}
const nodeTypes = { game: GameNode };

function initialLearnerState(spec: VisualChallengeSpec): VisualLearnerState {
  const base = structuredClone(spec.initialState);
  const nodes = spec.interactiveElements.filter((item) => item.kind === "node").map((item) => item.id);
  if (["build-flow", "sequence", "thread-expedition"].includes(spec.gameType) && !base.nodeOrder?.length) {
    base.nodeOrder = [...nodes].reverse();
  }
  if (spec.gameType === "multiple-choice") base.choiceId = undefined;
  if (spec.gameType === "evidence-hunt") base.expectedEvidenceIds = [];
  return base;
}

function labelFor(spec: VisualChallengeSpec, id: string): string {
  return spec.interactiveElements.find((item) => item.id === id)?.label ?? id;
}

function diagramPosition(spec: VisualChallengeSpec, state: VisualLearnerState, id: string, index: number) {
  const orderPosition = state.nodeOrder?.indexOf(id) ?? -1;
  if (["build-flow", "sequence", "thread-expedition"].includes(spec.gameType) && orderPosition >= 0) {
    return { x: orderPosition * 220, y: 100 };
  }
  if (spec.gameType === "compare") return { x: (index % 2) * 330, y: Math.floor(index / 2) * 150 };
  return { x: (index % 3) * 230, y: Math.floor(index / 3) * 145 };
}

interface Props {
  spec: VisualChallengeSpec;
  onShowEvidence: (evidenceId: string) => void;
  onFocusPaper?: () => void;
  selectedEvidenceId?: string;
  assetImages?: Record<string, string>;
  forceReducedMotion?: boolean;
  onComplete?: () => void;
}

export default function VisualChallengeCanvas({
  spec,
  onShowEvidence,
  onFocusPaper,
  selectedEvidenceId,
  assetImages = {},
  forceReducedMotion,
  onComplete,
}: Props) {
  const prefersReducedMotion = useReducedMotion();
  const reducedMotion = forceReducedMotion ?? prefersReducedMotion ?? false;
  const [state, setState] = useState<VisualLearnerState>(() => initialLearnerState(spec));
  const [result, setResult] = useState<ReturnType<typeof scoreVisualChallenge>>(null);
  const [attempts, setAttempts] = useState(0);
  const [hint, setHint] = useState(-1);
  const [pendingSource, setPendingSource] = useState<string | null>(null);
  const [pendingItem, setPendingItem] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    setState(initialLearnerState(spec));
    setResult(null);
    setAttempts(0);
    setHint(-1);
    setPendingSource(null);
    setPendingItem(null);
    setRevealed(false);
  }, [spec]);

  const nodeElements = spec.interactiveElements.filter((item) => item.kind === "node");
  const visualNodes = useMemo<Node<GameNodeData>[]>(() => nodeElements.map((item, index) => ({
    id: item.id,
    type: "game",
    position: diagramPosition(spec, state, item.id, index),
    data: { label: item.label, kind: item.semanticType ?? "component", selected: pendingSource === item.id || pendingItem === item.id },
    ariaLabel: `${item.label}. ${item.description ?? "Interactive component"}`,
    focusable: true,
  })), [nodeElements, pendingItem, pendingSource, spec, state]);

  const visualEdges = useMemo<Edge[]>(() => (state.connections ?? []).map((connection) => ({
    id: connection.id,
    source: connection.sourceId,
    target: connection.targetId,
    label: connection.label,
    animated: !reducedMotion,
    style: { stroke: "#7c3aed", strokeWidth: 2 },
  })), [reducedMotion, state.connections]);

  const addConnection = (sourceId: string, targetId: string) => {
    if (sourceId === targetId) return;
    const key = `${sourceId}->${targetId}`;
    if ((state.connections ?? []).some((item) => `${item.sourceId}->${item.targetId}` === key)) return;
    setResult(null);
    setState((current) => ({
      ...current,
      connections: [...(current.connections ?? []), { id: `learner:${sourceId}:${targetId}`, sourceId, targetId, evidenceIds: [] }],
    }));
  };

  const onConnect = (connection: Connection) => {
    if (connection.source && connection.target) addConnection(connection.source, connection.target);
  };

  const submit = () => {
    let candidate = spec.gameType === "evidence-hunt"
      ? { ...state, expectedEvidenceIds: selectedEvidenceId ? [selectedEvidenceId] : [] }
      : state;
    if (["sequence", "thread-expedition"].includes(spec.gameType) && candidate.nodeOrder?.length) {
      candidate = {
        ...candidate,
        connections: candidate.nodeOrder.slice(1).map((targetId, index) => ({
          id: `learner:${candidate.nodeOrder?.[index]}:${targetId}`,
          sourceId: candidate.nodeOrder?.[index] as string,
          targetId,
          evidenceIds: [],
        })),
      };
    }
    if (candidate !== state) setState(candidate);
    const next = scoreVisualChallenge(spec, candidate);
    setAttempts((value) => value + 1);
    setResult(next);
    if (next?.correct) onComplete?.();
  };

  const order = state.nodeOrder ?? [];
  const slots = spec.interactiveElements.filter((item) => item.kind === "slot");
  const missingChoices = spec.interactiveElements.filter((item) => item.kind === "choice" || item.kind === "node");
  const categories = spec.interactiveElements.filter((item) => item.kind === "category");
  const classifiable = spec.interactiveElements.filter((item) => item.kind === "node" || item.kind === "choice");
  const figures = spec.interactiveElements.filter((item) => item.kind === "figure");
  const conventionalChoices = spec.interactiveElements.filter((item) => item.kind === "choice");
  const connectMode = ["build-flow", "connect-concepts", "rebuild-architecture"].includes(spec.gameType);
  const orderMode = ["build-flow", "sequence", "thread-expedition"].includes(spec.gameType);

  return (
    <section className="overflow-hidden rounded-2xl border border-neutral-300 bg-white shadow-xl dark:border-neutral-700 dark:bg-neutral-950" aria-label={`${spec.title} visual challenge`}>
      <header className="border-b border-neutral-200 px-4 py-3 dark:border-neutral-800">
        <div className="flex flex-wrap gap-2 text-[10px] font-semibold uppercase tracking-wider text-neutral-500">
          <span>Generated game</span><span>{spec.gameType}</span><span>{spec.scoringMode === "scored" ? "Source-grounded score" : "Explore \u00b7 unscored"}</span>
        </div>
        <h2 className="mt-1 text-base font-semibold">{spec.title}</h2>
        <p className="mt-1 text-sm leading-5">{spec.prompt}</p>
        <p className="mt-1 text-xs leading-5 text-neutral-500">{spec.instructions}</p>
      </header>

      {(connectMode || orderMode || spec.gameType === "compare") && nodeElements.length > 0 && (
        <div className="h-[min(430px,52vh)] min-h-[320px]" role="application" aria-label="Visual game board">
          <ReactFlow
            nodes={visualNodes}
            edges={visualEdges}
            nodeTypes={nodeTypes}
            fitView
            fitViewOptions={{ padding: 0.25, duration: reducedMotion ? 0 : 350 }}
            nodesConnectable={connectMode}
            onConnect={onConnect}
            onNodeClick={(_event, node) => connectMode && setPendingSource((current) => current === node.id ? null : node.id)}
            proOptions={{ hideAttribution: true }}
          >
            <Background gap={22} size={1} color="#a78bfa" />
            <Controls showInteractive={false} />
          </ReactFlow>
        </div>
      )}

      <div className="grid gap-3 p-4">
        {orderMode && (
          <ol className="grid gap-2" aria-label="Keyboard ordering controls">
            {order.map((id, index) => <li key={id} className="flex min-h-11 items-center rounded-lg border border-neutral-300 px-3 dark:border-neutral-700">
              <span className="mr-2 font-mono text-xs text-neutral-500">{index + 1}</span><span className="min-w-0 flex-1 text-sm font-medium">{labelFor(spec, id)}</span>
              <button type="button" disabled={index === 0} aria-label={`Move ${labelFor(spec, id)} earlier`} onClick={() => setState((current) => { const next = [...(current.nodeOrder ?? [])]; [next[index - 1], next[index]] = [next[index], next[index - 1]]; return { ...current, nodeOrder: next }; })} className="flex h-8 w-8 items-center justify-center disabled:opacity-30"><ChevronLeft aria-hidden="true" size={16} /></button>
              <button type="button" disabled={index === order.length - 1} aria-label={`Move ${labelFor(spec, id)} later`} onClick={() => setState((current) => { const next = [...(current.nodeOrder ?? [])]; [next[index], next[index + 1]] = [next[index + 1], next[index]]; return { ...current, nodeOrder: next }; })} className="flex h-8 w-8 items-center justify-center disabled:opacity-30"><ChevronRight aria-hidden="true" size={16} /></button>
            </li>)}
          </ol>
        )}

        {connectMode && (
          <div className="rounded-xl border border-violet-200 bg-violet-50/60 p-3 dark:border-violet-900 dark:bg-violet-950/30">
            <p className="text-xs font-medium">Keyboard connection path</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {nodeElements.map((node) => <button key={node.id} type="button" aria-pressed={pendingSource === node.id} onClick={() => setPendingSource(node.id)} className="min-h-9 rounded-md border border-neutral-300 bg-white px-2 text-xs focus-visible:outline-2 focus-visible:outline-violet-600 dark:bg-neutral-950">{node.label}</button>)}
            </div>
            {pendingSource && <div className="mt-2 flex flex-wrap items-center gap-2"><Link2 aria-hidden="true" size={14} /><span className="text-xs">Connect {labelFor(spec, pendingSource)} to:</span>{nodeElements.filter((node) => node.id !== pendingSource).map((node) => <button key={node.id} type="button" onClick={() => { addConnection(pendingSource, node.id); setPendingSource(null); }} className="min-h-8 rounded-md bg-violet-700 px-2 text-xs text-white">{node.label}</button>)}</div>}
            {(state.connections ?? []).length > 0 && <ul className="mt-3 grid gap-1 text-xs">{state.connections?.map((edge) => <li key={edge.id} className="flex items-center gap-2"><span className="flex-1">{labelFor(spec, edge.sourceId)} {"\u2192"} {labelFor(spec, edge.targetId)}</span><button type="button" aria-label={`Remove connection from ${labelFor(spec, edge.sourceId)} to ${labelFor(spec, edge.targetId)}`} onClick={() => setState((current) => ({ ...current, connections: current.connections?.filter((item) => item.id !== edge.id) }))}><X aria-hidden="true" size={14} /></button></li>)}</ul>}
          </div>
        )}

        {spec.gameType === "missing-node" && (
          <div className="grid gap-3 md:grid-cols-2">
            <div><p className="text-xs font-medium">Available components</p><div className="mt-2 grid gap-2">{missingChoices.map((item) => <button key={item.id} type="button" aria-pressed={pendingItem === item.id} onClick={() => setPendingItem(item.id)} className="min-h-10 rounded-lg border px-3 text-left text-sm focus-visible:outline-2 focus-visible:outline-violet-600">{item.label}</button>)}</div></div>
            <div><p className="text-xs font-medium">Missing positions</p><div className="mt-2 grid gap-2">{slots.map((slot) => <button key={slot.id} type="button" disabled={!pendingItem} onClick={() => { if (pendingItem) setState((current) => ({ ...current, placements: { ...(current.placements ?? {}), [pendingItem]: slot.id } })); setPendingItem(null); }} className="min-h-12 rounded-lg border-2 border-dashed px-3 text-sm disabled:opacity-50">{Object.entries(state.placements ?? {}).find(([, value]) => value === slot.id)?.[0] ? labelFor(spec, Object.entries(state.placements ?? {}).find(([, value]) => value === slot.id)?.[0] ?? "") : slot.label}</button>)}</div></div>
          </div>
        )}

        {spec.gameType === "classification" && (
          <div className="grid gap-3"><p className="text-xs">Choose an item, then its source-defined category.</p>{classifiable.filter((item) => item.kind !== "category").map((item) => <div key={item.id} className="flex flex-wrap items-center gap-2 rounded-lg border p-2"><span className="min-w-32 flex-1 text-sm font-medium">{item.label}</span>{categories.map((category) => <button key={category.id} type="button" aria-pressed={state.classification?.[item.id] === category.id} onClick={() => setState((current) => ({ ...current, classification: { ...(current.classification ?? {}), [item.id]: category.id } }))} className="min-h-8 rounded-md border px-2 text-xs">{category.label}</button>)}</div>)}</div>
        )}

        {spec.gameType === "figure-detective" && (
          <div className="grid gap-3">
            {figures.map((figure) => (
              <figure key={figure.id} className="relative overflow-hidden rounded-xl border bg-white p-2">
                {figure.assetId && assetImages[figure.assetId]
                  ? <img src={assetImages[figure.assetId]} alt={`Original source asset: ${figure.label}`} className="max-h-80 w-full object-contain" />
                  : <div className="grid min-h-40 place-items-center text-sm text-neutral-500">Verified figure crop unavailable.</div>}
                {figure.bbox && <button type="button" aria-label={`Select verified region: ${figure.label}`} aria-pressed={state.selectedElementIds?.includes(figure.id)} onClick={() => setState((current) => ({ ...current, selectedElementIds: [figure.id] }))} className="absolute border-2 border-violet-600 bg-violet-400/20 focus-visible:outline-4 focus-visible:outline-white" style={{ left: `${figure.bbox[0] * 100}%`, top: `${figure.bbox[1] * 100}%`, width: `${(figure.bbox[2] - figure.bbox[0]) * 100}%`, height: `${(figure.bbox[3] - figure.bbox[1]) * 100}%` }} />}
              </figure>
            ))}
            {conventionalChoices.map((choice) => <button key={choice.id} type="button" aria-pressed={state.selectedElementIds?.includes(choice.id)} onClick={() => setState((current) => ({ ...current, selectedElementIds: [choice.id] }))} className="min-h-10 rounded-lg border px-3 text-left text-sm">{choice.label}</button>)}
          </div>
        )}

        {spec.gameType === "evidence-hunt" && (
          <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950/30"><p className="text-sm">Use the actual paper to select the source that supports this prompt.</p><button type="button" onClick={onFocusPaper} className="mt-3 min-h-9 rounded-md bg-amber-700 px-3 text-sm text-white">Focus paper and select evidence</button><p className="mt-2 text-xs" aria-live="polite">{selectedEvidenceId ? "A verified source selection is ready to check." : "No source selection is ready yet."}</p></div>
        )}

        {spec.gameType === "prediction" && (
          <div className="grid gap-2">{conventionalChoices.map((choice) => <button key={choice.id} type="button" aria-pressed={state.choiceId === choice.id} onClick={() => setState((current) => ({ ...current, choiceId: choice.id }))} className="min-h-11 rounded-xl border px-3 text-left text-sm">{choice.label}</button>)}<button type="button" disabled={!state.choiceId} onClick={() => setRevealed(true)} className="mt-2 min-h-10 rounded-md bg-violet-700 px-3 text-sm text-white disabled:opacity-40">Reveal the paper&apos;s result</button>{revealed && <p className="text-sm" aria-live="polite">Your prediction is preserved as exploratory. Use Show Evidence to inspect the paper&apos;s actual result.</p>}</div>
        )}

        {spec.gameType === "multiple-choice" && (
          <div className="grid gap-2">{conventionalChoices.map((choice) => <button key={choice.id} type="button" aria-pressed={state.choiceId === choice.id} onClick={() => setState((current) => ({ ...current, choiceId: choice.id }))} className="min-h-11 rounded-xl border px-3 text-left text-sm focus-visible:outline-2 focus-visible:outline-violet-600">{choice.label}</button>)}</div>
        )}

        {spec.gameType === "compare" && conventionalChoices.length > 0 && <div className="grid gap-2 md:grid-cols-2">{conventionalChoices.map((choice) => <button key={choice.id} type="button" aria-pressed={state.selectedElementIds?.includes(choice.id)} onClick={() => setState((current) => ({ ...current, selectedElementIds: current.selectedElementIds?.includes(choice.id) ? current.selectedElementIds.filter((id) => id !== choice.id) : [...(current.selectedElementIds ?? []), choice.id] }))} className="min-h-12 rounded-xl border p-3 text-left text-sm">{choice.label}</button>)}</div>}

        {hint >= 0 && spec.hints[hint] && <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm dark:border-amber-900 dark:bg-amber-950/30" aria-live="polite"><Lightbulb aria-hidden="true" className="mr-1 inline" size={15} />{spec.hints[hint].text}</p>}
        {result && <motion.p initial={reducedMotion ? false : { opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className={`rounded-lg border p-3 text-sm font-medium ${result.correct ? "border-emerald-400 bg-emerald-50 dark:bg-emerald-950/30" : "border-amber-400 bg-amber-50 dark:bg-amber-950/30"}`} aria-live="polite">{result.correct ? <Check aria-hidden="true" className="mr-1 inline" size={16} /> : <RotateCcw aria-hidden="true" className="mr-1 inline" size={15} />}{result.message}</motion.p>}

        <div className="flex flex-wrap gap-2 border-t border-neutral-200 pt-3 dark:border-neutral-800">
          {spec.scoringMode === "scored" && !result?.correct && <button type="button" onClick={submit} className="min-h-10 rounded-md bg-violet-700 px-4 text-sm font-semibold text-white">{attempts > 0 ? "Check revised answer" : "Check answer"}</button>}
          {spec.scoringMode === "exploratory" && <span className="self-center text-xs text-neutral-500">This exploration does not make a correctness claim.</span>}
          {result && !result.correct && <button type="button" onClick={() => setResult(null)} className="min-h-10 rounded-md border border-violet-700 px-3 text-sm text-violet-800 dark:text-violet-300">Try Again</button>}
          {spec.hints.length > 0 && <button type="button" onClick={() => setHint((value) => Math.min(spec.hints.length - 1, value + 1))} className="min-h-10 rounded-md border px-3 text-sm"><Lightbulb aria-hidden="true" className="mr-1 inline" size={15} />Hint</button>}
        </div>
        <div className="flex flex-wrap gap-2" aria-label="Challenge source evidence">{(spec.sourceReveal?.evidenceIds ?? spec.evidenceIds).map((id, index) => <button key={id} type="button" onClick={() => onShowEvidence(id)} className="flex min-h-9 items-center gap-1.5 rounded-md border border-sky-700 px-3 text-xs text-sky-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600 dark:text-sky-300"><LocateFixed aria-hidden="true" size={14} />Show Evidence{spec.evidenceIds.length > 1 ? ` ${index + 1}` : ""}</button>)}</div>
      </div>
    </section>
  );
}
