"use client";

import {
  Background,
  Controls,
  Handle,
  Position,
  ReactFlow,
  type Edge,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ChevronLeft, ChevronRight, LocateFixed, Pause, Play, RotateCcw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { VisualLearningSpec } from "../../lib/visual-learning/contracts";
import MermaidFallback from "./MermaidFallback";
import { emitUIAgentEvent } from "../../lib/ui-agent/events";
import { useUIAgent } from "../ui-agent/UIAgentProvider";

interface LearningNodeData extends Record<string, unknown> {
  label: string;
  description: string;
  semanticType: string;
  active: boolean;
  dimmed: boolean;
}

function LearningNode({ data }: NodeProps<Node<LearningNodeData>>) {
  return (
    <motion.div
      initial={false}
      animate={{ scale: data.active ? 1.04 : 1, opacity: data.dimmed ? 0.4 : 1 }}
      className={`min-w-44 max-w-56 rounded-xl border-2 bg-white px-4 py-3 text-neutral-900 shadow-md dark:bg-neutral-950 dark:text-neutral-100 ${data.active ? "border-sky-600 ring-4 ring-sky-200/60 dark:ring-sky-900" : "border-neutral-300 dark:border-neutral-700"}`}
    >
      <Handle type="target" position={Position.Left} className="!h-2.5 !w-2.5 !bg-sky-600" />
      <p className="text-[10px] font-semibold uppercase tracking-wider text-sky-700 dark:text-sky-300">{data.semanticType}</p>
      <p className="mt-1 text-sm font-semibold leading-5">{data.label}</p>
      {data.description && <p className="mt-1 max-w-52 text-xs leading-4 text-neutral-600 dark:text-neutral-300">{data.description}</p>}
      <Handle type="source" position={Position.Right} className="!h-2.5 !w-2.5 !bg-sky-600" />
    </motion.div>
  );
}

const nodeTypes = { learning: LearningNode };

function positionFor(type: VisualLearningSpec["visualizationType"], index: number, count: number) {
  if (type === "timeline") return { x: index * 250, y: 90 + (index % 2) * 60 };
  if (type === "comparison") return { x: (index % 2) * 340, y: Math.floor(index / 2) * 150 };
  if (type === "hierarchy") {
    const level = Math.floor(Math.log2(index + 1));
    const first = 2 ** level - 1;
    const within = index - first;
    const slots = 2 ** level;
    return { x: ((within + 0.5) * Math.max(700, slots * 230)) / slots, y: level * 160 };
  }
  const columns = count <= 4 ? 2 : 3;
  return { x: (index % columns) * 280, y: Math.floor(index / columns) * 150 };
}

interface Props {
  spec: VisualLearningSpec;
  onShowEvidence: (evidenceId: string) => void;
  forceReducedMotion?: boolean;
  className?: string;
}

export default function VisualLearningCanvas({ spec, onShowEvidence, forceReducedMotion, className = "" }: Props) {
  const agent = useUIAgent();
  const systemReducedMotion = useReducedMotion();
  const reducedMotion = forceReducedMotion ?? systemReducedMotion ?? false;
  const [step, setStep] = useState(reducedMotion || spec.animationSteps.length === 0 ? spec.animationSteps.length : 0);
  const [playing, setPlaying] = useState(false);
  const [showSimple, setShowSimple] = useState(false);

  useEffect(() => {
    setStep(reducedMotion || spec.animationSteps.length === 0 ? spec.animationSteps.length : 0);
    setPlaying(false);
  }, [reducedMotion, spec]);

  useEffect(() => {
    if (!playing || reducedMotion || step >= spec.animationSteps.length) {
      if (step >= spec.animationSteps.length) setPlaying(false);
      return;
    }
    const delay = spec.animationSteps[step]?.durationMs ?? 850;
    const timer = window.setTimeout(() => setStep((current) => Math.min(current + 1, spec.animationSteps.length)), delay);
    return () => window.clearTimeout(timer);
  }, [playing, reducedMotion, spec.animationSteps, step]);

  const animationState = useMemo(() => {
    const applied = spec.animationSteps.slice(0, step);
    const explicitlyShownNodes = new Set(applied.filter((item) => item.action === "show-node").flatMap((item) => item.targetIds));
    const explicitlyShownEdges = new Set(applied.filter((item) => item.action === "draw-edge").flatMap((item) => item.targetIds));
    const active = new Set(applied.filter((item) => item.action === "highlight-node" || item.action === "pulse-edge" || item.action === "focus-region").flatMap((item) => item.targetIds));
    const dimTargets = new Set(applied.filter((item) => item.action === "dim-others").flatMap((item) => item.targetIds));
    const hasNodeReveal = spec.animationSteps.some((item) => item.action === "show-node");
    const hasEdgeReveal = spec.animationSteps.some((item) => item.action === "draw-edge");
    return { explicitlyShownNodes, explicitlyShownEdges, active, dimTargets, hasNodeReveal, hasEdgeReveal };
  }, [spec.animationSteps, step]);

  const nodes = useMemo<Node<LearningNodeData>[]>(() => spec.nodes.map((item, index) => ({
    id: item.id,
    type: "learning",
    position: positionFor(spec.visualizationType, index, spec.nodes.length),
    hidden: !reducedMotion && animationState.hasNodeReveal && !animationState.explicitlyShownNodes.has(item.id),
    data: {
      label: item.label,
      description: item.description,
      semanticType: item.semanticType,
      active: animationState.active.has(item.id),
      dimmed: animationState.dimTargets.size > 0 && !animationState.dimTargets.has(item.id),
    },
    ariaLabel: `${item.semanticType}: ${item.label}. ${item.description}`,
    focusable: true,
  })), [animationState, reducedMotion, spec.nodes, spec.visualizationType]);

  const edges = useMemo<Edge[]>(() => spec.edges.map((item) => ({
    id: item.id,
    source: item.source,
    target: item.target,
    label: item.label,
    hidden: !reducedMotion && animationState.hasEdgeReveal && !animationState.explicitlyShownEdges.has(item.id),
    animated: !reducedMotion && animationState.active.has(item.id),
    style: { strokeWidth: 2, stroke: animationState.active.has(item.id) ? "#0284c7" : "#64748b" },
    labelStyle: { fontSize: 11, fill: "currentColor" },
  })), [animationState, reducedMotion, spec.edges]);

  useEffect(() => { const version = `${spec.schemaVersion}:${spec.id}:${spec.nodes.map((n) => n.id).join(",")}:${spec.edges.map((e) => e.id).join(",")}`; const event = emitUIAgentEvent("visual-generated", { visualId: spec.id, version, payload: spec }); agent?.inspect({ id: spec.id, version, nodes: nodes.map((n) => ({ id: n.id, label: String(n.data.label), description: String(n.data.description), position: n.position })), edges: edges.map((e) => ({ id: e.id, source: e.source, target: e.target })), animationCount: spec.animationSteps.length, animationDurations: spec.animationSteps.map((s) => s.durationMs ?? 850) }, event); }, [agent, edges, nodes, spec]);

  const currentAnimation = step > 0 ? spec.animationSteps[step - 1] : undefined;
  const currentExplanation = currentAnimation?.explanationStepId
    ? spec.explanationSteps.find((item) => item.id === currentAnimation.explanationStepId)
    : spec.explanationSteps[Math.max(0, Math.min(spec.explanationSteps.length - 1, step - 1))];

  return (
    <section className={`overflow-hidden rounded-2xl border border-neutral-300 bg-white shadow-xl dark:border-neutral-700 dark:bg-neutral-950 ${className}`} aria-label={`${spec.title} visual learning canvas`}>
      <header className="flex flex-wrap items-start gap-3 border-b border-neutral-200 px-4 py-3 dark:border-neutral-800">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2 text-[10px] font-semibold uppercase tracking-wider text-neutral-500">
            <span>Generated visual</span><span>Source-grounded</span><span>{spec.visualizationType}</span>
          </div>
          <h2 className="mt-1 text-base font-semibold">{spec.title}</h2>
          <p className="mt-1 text-xs leading-5 text-neutral-600 dark:text-neutral-300">{spec.learningGoal}</p>
        </div>
        <button type="button" onClick={() => setShowSimple((value) => !value)} className="min-h-9 rounded-md border border-neutral-300 px-3 text-xs focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600 dark:border-neutral-700">
          {showSimple ? "Interactive view" : "Simple diagram"}
        </button>
      </header>

      {showSimple ? <MermaidFallback spec={spec} /> : (
        <div className="h-[min(480px,58vh)] min-h-[340px] w-full" role="application" aria-label="Pan and zoom source-grounded diagram">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            fitView
            fitViewOptions={{ padding: 0.24, duration: reducedMotion ? 0 : 400 }}
            nodesDraggable
            nodesConnectable={false}
            elementsSelectable
            onNodeClick={(_event, node) => {
              const evidenceId = spec.nodes.find((item) => item.id === node.id)?.evidenceIds[0];
              if (evidenceId) onShowEvidence(evidenceId);
            }}
            proOptions={{ hideAttribution: true }}
          >
            <Background color="#94a3b8" gap={22} size={1} />
            <Controls showInteractive={false} />
          </ReactFlow>
        </div>
      )}

      <div className="border-t border-neutral-200 px-4 py-3 dark:border-neutral-800">
        <div className="flex flex-wrap items-center gap-2" aria-label="Animation controls">
          <button type="button" disabled={reducedMotion || step === 0} aria-label="Previous learning step" onClick={() => { setPlaying(false); setStep((value) => Math.max(0, value - 1)); }} className="flex h-9 w-9 items-center justify-center rounded-full border disabled:opacity-35"><ChevronLeft aria-hidden="true" size={16} /></button>
          <button type="button" disabled={reducedMotion || spec.animationSteps.length === 0} aria-label={playing ? "Pause animation" : "Play animation"} onClick={() => setPlaying((value) => !value)} className="flex h-9 w-9 items-center justify-center rounded-full bg-sky-700 text-white disabled:opacity-35">{playing ? <Pause aria-hidden="true" size={16} /> : <Play aria-hidden="true" size={16} />}</button>
          <button type="button" disabled={reducedMotion || step >= spec.animationSteps.length} aria-label="Next learning step" onClick={() => { setPlaying(false); setStep((value) => Math.min(spec.animationSteps.length, value + 1)); }} className="flex h-9 w-9 items-center justify-center rounded-full border disabled:opacity-35"><ChevronRight aria-hidden="true" size={16} /></button>
          <button type="button" disabled={reducedMotion || step === 0} aria-label="Restart animation" onClick={() => { setPlaying(false); setStep(0); }} className="flex h-9 w-9 items-center justify-center rounded-full border disabled:opacity-35"><RotateCcw aria-hidden="true" size={15} /></button>
          <span className="ml-1 text-xs text-neutral-500">{reducedMotion ? "Reduced motion: all information shown" : `Step ${step} of ${spec.animationSteps.length}`}</span>
        </div>
        <AnimatePresence mode="wait" initial={false}>
          {currentExplanation && (
            <motion.p key={currentExplanation.id} initial={reducedMotion ? false : { opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={reducedMotion ? undefined : { opacity: 0 }} className="mt-3 max-w-3xl text-sm leading-6" aria-live="polite">
              {currentExplanation.text}
            </motion.p>
          )}
        </AnimatePresence>
        <div className="mt-3 flex flex-wrap gap-2" aria-label="Visual source evidence">
          {spec.evidenceIds.map((evidenceId, index) => (
            <button key={evidenceId} type="button" onClick={() => onShowEvidence(evidenceId)} className="flex min-h-9 items-center gap-1.5 rounded-md border border-sky-700 px-3 text-xs text-sky-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600 dark:text-sky-300">
              <LocateFixed aria-hidden="true" size={14} /> Show evidence {spec.evidenceIds.length > 1 ? index + 1 : ""}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
