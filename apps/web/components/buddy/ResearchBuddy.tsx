"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type Expr = "default" | "look" | "point" | "curious" | "thinking" | "success";
type Diagram = "visualize" | "trace" | "learn" | "investigate";
type MenuView = "root" | "what" | "settings";

interface TourStep {
  id: string;
  target: string | null;
  expr: Expr;
  badge: string;
  title?: string;
  text: string;
  primary?: string;
  secondary?: string;
  diagram?: Diagram;
}

interface Point {
  x: number;
  y: number;
}

interface Spot {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Bubble {
  x: number;
  y: number;
  place: "top" | "bottom";
}

interface Pointer {
  deg: number;
}

interface Layout {
  buddy: Point;
  bubble: Bubble | null;
  spot: Spot | null;
  pointer: Pointer | null;
}

const BUDDY_W = 64;
const BUDDY_H = 72;
const BUBBLE_W = 300;
const BUBBLE_H = 210;

const STEPS: TourStep[] = [
  {
    id: "welcome",
    target: null,
    expr: "default",
    badge: "Marginalia",
    title: "Hi, I'm Margin",
    text: "Your Marginalia research buddy. Instead of replacing papers with summaries, I'll help you explore the ideas and evidence inside them.",
    primary: "Show me around",
    secondary: "I'll explore myself",
  },
  {
    id: "reader",
    target: "[data-tour='paper']",
    expr: "look",
    badge: "Reader",
    text: "Your paper always stays at the center. Marginalia builds interactive tools around the original research instead of replacing it.",
  },
  {
    id: "figure",
    target: "[data-tour='figure-mention']",
    expr: "point",
    badge: "Figures & citations",
    text: "Figures, tables, and citations stay connected to where you're reading. Open a reference and it docks in place.",
  },
  {
    id: "selection",
    target: "[data-tour='selection']",
    expr: "curious",
    badge: "Select to investigate",
    text: "Found something difficult or interesting? Select it to investigate that exact part of the research.",
  },
  {
    id: "visualize",
    target: "[data-tour='act-visualize']",
    expr: "point",
    badge: "Visualize",
    diagram: "visualize",
    text: "Visualize turns difficult research into diagrams, flows, and interactive structures so you can see how the idea works.",
  },
  {
    id: "trace",
    target: "[data-tour='act-trace']",
    expr: "point",
    badge: "Trace the evidence",
    diagram: "trace",
    text: "Want to know where something comes from? Trace it through supporting evidence, figures, experiments, and results.",
  },
  {
    id: "learn",
    target: "[data-tour='learn-tab']",
    expr: "curious",
    badge: "Learn & Quest",
    diagram: "learn",
    text: "Instead of only another quiz, Marginalia can make you rebuild, connect, predict, and find evidence yourself.",
  },
  {
    id: "explore",
    target: "[data-tour='nav-explore']",
    expr: "point",
    badge: "Explore",
    text: "Zoom out from the page to explore figures, paper structure, citations, and connections across research.",
  },
  {
    id: "workspace",
    target: "[data-tour='nav-workspace']",
    expr: "point",
    badge: "Workspace",
    text: "Workspace is your research desk: collect papers, pin evidence, and compare what you've found — without losing its source.",
  },
  {
    id: "investigate",
    target: "[data-tour='act-explain']",
    expr: "thinking",
    badge: "Investigate",
    diagram: "investigate",
    text: "Ask a research question and Marginalia investigates the source evidence before generating any interpretation.",
  },
  {
    id: "finish",
    target: null,
    expr: "success",
    badge: "You're set",
    text: "That's it. Read normally, and I'll be here whenever you want to trace, visualize, build, or explore.",
    primary: "Start exploring",
  },
];

const menuItemClass =
  "block w-full rounded-md px-2.5 py-2 text-left text-[13px] text-neutral-900 hover:bg-neutral-100 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-sky-600 dark:text-neutral-100 dark:hover:bg-neutral-800";
const whatItemClass =
  "rounded-md px-2.5 py-2 text-[13px] text-neutral-900 dark:text-neutral-100";

function rectOf(selector: string | null): DOMRect | null {
  if (!selector) return null;
  const el = document.querySelector(selector);
  return el ? el.getBoundingClientRect() : null;
}

function idleLayout(customPos: Point | null = null): Layout {
  const w = typeof window === "undefined" ? 0 : window.innerWidth;
  const h = typeof window === "undefined" ? 0 : window.innerHeight;
  if (customPos) {
    return {
      buddy: {
        x: Math.min(Math.max(8, customPos.x), Math.max(8, w - BUDDY_W - 8)),
        y: Math.min(Math.max(8, customPos.y), Math.max(8, h - BUDDY_H - 8)),
      },
      bubble: null,
      spot: null,
      pointer: null,
    };
  }
  return { buddy: { x: 24, y: h - 96 }, bubble: null, spot: null, pointer: null };
}

/**
 * The Marginalia onboarding mascot: a floating guide that walks a first-time reader
 * through the Reader chrome, then rests in the corner as a recallable help menu.
 * Every step gracefully centers itself if its `data-tour` anchor isn't on screen
 * (e.g. the selection toolbar only exists once a reader has actually selected text).
 */
export default function ResearchBuddy({ dark = false }: { dark?: boolean }) {
  const [tour, setTour] = useState(false);
  const [step, setStep] = useState(0);
  const [expr, setExpr] = useState<Expr>("default");
  const [dir, setDir] = useState<Point>({ x: 0, y: 0 });
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuView, setMenuView] = useState<MenuView>("root");
  const [hidden, setHidden] = useState(false);
  const [reduced, setReduced] = useState(false);
  const [spark, setSpark] = useState(false);
  const [layout, setLayout] = useState<Layout>(idleLayout);
  const [dragging, setDragging] = useState(false);

  const tourRef = useRef(tour);
  const stepRef = useRef(step);
  const startTimer = useRef<number | null>(null);
  const sparkTimer = useRef<number | null>(null);
  const customPosRef = useRef<Point | null>(null);
  const dragRef = useRef<{ pointerId: number; startX: number; startY: number; originX: number; originY: number; moved: boolean } | null>(null);
  const draggedRef = useRef(false);
  tourRef.current = tour;
  stepRef.current = step;

  const reducedMotion = useCallback(
    () => reduced || (typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches),
    [reduced],
  );

  const relayout = useCallback(() => {
    if (!tourRef.current) {
      setLayout(idleLayout(customPosRef.current));
      return;
    }
    const current = STEPS[stepRef.current];
    const w = window.innerWidth;
    const h = window.innerHeight;
    const target = current.target ? rectOf(current.target) : null;

    if (!target) {
      const buddy = { x: w / 2 - BUDDY_W / 2, y: h * 0.58 };
      const bubble: Bubble = {
        x: Math.min(Math.max(12, buddy.x + BUDDY_W / 2 - BUBBLE_W / 2), w - BUBBLE_W - 12),
        y: buddy.y - BUBBLE_H - 8,
        place: "top",
      };
      setLayout({ buddy, bubble, spot: null, pointer: null });
      setDir({ x: 0, y: 0 });
      return;
    }

    const pad = 8;
    const spot: Spot = { x: target.left - pad, y: target.top - pad, w: target.width + pad * 2, h: target.height + pad * 2 };
    const tc = { x: target.left + target.width / 2, y: target.top + target.height / 2 };
    const rightSpace = w - target.right;
    const leftSpace = target.left;

    let buddy: Point;
    if (rightSpace >= BUDDY_W + 40 && rightSpace >= leftSpace) {
      buddy = { x: Math.min(target.right + 20, w - BUDDY_W - 12), y: Math.min(Math.max(72, tc.y - BUDDY_H / 2), h - BUDDY_H - 12) };
    } else if (leftSpace >= BUDDY_W + 40) {
      buddy = { x: Math.max(12, target.left - BUDDY_W - 20), y: Math.min(Math.max(72, tc.y - BUDDY_H / 2), h - BUDDY_H - 12) };
    } else if (target.top > BUDDY_H + 120) {
      buddy = { x: Math.min(Math.max(12, tc.x - BUDDY_W / 2), w - BUDDY_W - 12), y: Math.max(12, target.top - BUDDY_H - 16) };
    } else {
      buddy = { x: Math.min(Math.max(12, tc.x - BUDDY_W / 2), w - BUDDY_W - 12), y: Math.min(h - BUDDY_H - 12, target.bottom + 16) };
    }

    const bc = { x: buddy.x + BUDDY_W / 2, y: buddy.y + BUDDY_H / 2 };
    const nextDir = { x: Math.sign(tc.x - bc.x), y: Math.sign(tc.y - bc.y) };
    const pointer: Pointer = { deg: (Math.atan2(tc.y - bc.y, tc.x - bc.x) * 180) / Math.PI };

    let bx = buddy.x + BUDDY_W / 2 - BUBBLE_W / 2;
    let by = buddy.y - BUBBLE_H - 10;
    let place: Bubble["place"] = "top";
    if (by < 12) {
      by = buddy.y + BUDDY_H + 10;
      place = "bottom";
    }
    bx = Math.min(Math.max(12, bx), w - BUBBLE_W - 12);

    setLayout({ buddy, spot, pointer, bubble: { x: bx, y: by, place } });
    setDir(nextDir);
  }, []);

  const applyStep = useCallback(
    (index: number) => {
      setStep(index);
      setExpr(STEPS[index].expr);
      requestAnimationFrame(() => requestAnimationFrame(relayout));
      if (STEPS[index].expr === "success") {
        setSpark(true);
        if (sparkTimer.current !== null) window.clearTimeout(sparkTimer.current);
        sparkTimer.current = window.setTimeout(() => setSpark(false), 1600);
      }
    },
    [relayout],
  );

  const startTour = useCallback(() => {
    setTour(true);
    setMenuOpen(false);
    applyStep(0);
  }, [applyStep]);

  useEffect(() => {
    try {
      setHidden(localStorage.getItem("mg_hidden") === "1");
      setReduced(localStorage.getItem("mg_reduced") === "1");
    } catch {
      // localStorage unavailable (private browsing, etc.); default to visible motion-on.
    }
    try {
      const saved = localStorage.getItem("mg_buddy_pos");
      const parsed = saved ? JSON.parse(saved) : null;
      if (parsed && typeof parsed.x === "number" && typeof parsed.y === "number") {
        customPosRef.current = parsed;
      }
    } catch {
      // Non-fatal: the buddy simply starts at its default corner position.
    }
    setLayout(idleLayout(customPosRef.current));

    const onResize = () => relayout();
    window.addEventListener("resize", onResize);

    let done = false;
    let alreadyHidden = false;
    try {
      done = localStorage.getItem("mg_tour") === "done";
      alreadyHidden = localStorage.getItem("mg_hidden") === "1";
    } catch {
      // Same fallback as above.
    }
    if (!done && !alreadyHidden) {
      startTimer.current = window.setTimeout(startTour, 800);
    }

    return () => {
      window.removeEventListener("resize", onResize);
      if (startTimer.current !== null) window.clearTimeout(startTimer.current);
      if (sparkTimer.current !== null) window.clearTimeout(sparkTimer.current);
    };
    // Intentionally runs once on mount; startTour/relayout are stable across renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const finish = useCallback(() => {
    try {
      localStorage.setItem("mg_tour", "done");
    } catch {
      // Non-fatal: the tour will simply replay next visit.
    }
    setTour(false);
    setExpr("default");
    setLayout(idleLayout(customPosRef.current));
    setSpark(false);
  }, []);

  const next = useCallback(() => {
    if (step >= STEPS.length - 1) {
      finish();
      return;
    }
    applyStep(step + 1);
  }, [applyStep, finish, step]);

  const back = useCallback(() => {
    if (step > 0) applyStep(step - 1);
  }, [applyStep, step]);

  const skipTour = useCallback(() => {
    try {
      localStorage.setItem("mg_tour", "done");
    } catch {
      // Non-fatal.
    }
    setTour(false);
    setExpr("default");
    setLayout(idleLayout(customPosRef.current));
  }, []);

  const replay = useCallback(() => {
    setMenuOpen(false);
    startTour();
  }, [startTour]);

  const explainScreen = useCallback(() => {
    setMenuOpen(false);
    setTour(true);
    applyStep(1);
  }, [applyStep]);

  const toggleMenu = useCallback(() => {
    if (tour) return;
    setMenuOpen((open) => !open);
    setMenuView("root");
    relayout();
  }, [relayout, tour]);

  const clampToViewport = useCallback((x: number, y: number): Point => {
    const w = typeof window === "undefined" ? 0 : window.innerWidth;
    const h = typeof window === "undefined" ? 0 : window.innerHeight;
    return {
      x: Math.min(Math.max(8, x), Math.max(8, w - BUDDY_W - 8)),
      y: Math.min(Math.max(8, y), Math.max(8, h - BUDDY_H - 8)),
    };
  }, []);

  const onBuddyPointerDown = useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) => {
      if (tour) return;
      event.currentTarget.setPointerCapture(event.pointerId);
      dragRef.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        originX: layout.buddy.x,
        originY: layout.buddy.y,
        moved: false,
      };
    },
    [tour, layout.buddy],
  );

  const onBuddyPointerMove = useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;
      const dx = event.clientX - drag.startX;
      const dy = event.clientY - drag.startY;
      if (!drag.moved && Math.hypot(dx, dy) < 4) return;
      if (!drag.moved) {
        drag.moved = true;
        setDragging(true);
        setMenuOpen(false);
      }
      const next = clampToViewport(drag.originX + dx, drag.originY + dy);
      setLayout((prev) => ({ ...prev, buddy: next }));
    },
    [clampToViewport],
  );

  const endBuddyDrag = useCallback((event: React.PointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    setDragging(false);
    if (drag.moved) {
      draggedRef.current = true;
      setLayout((prev) => {
        customPosRef.current = prev.buddy;
        try {
          localStorage.setItem("mg_buddy_pos", JSON.stringify(prev.buddy));
        } catch {
          // Non-fatal: the dragged position simply won't persist across reloads.
        }
        return prev;
      });
    }
  }, []);

  const handleBuddyClick = useCallback(() => {
    if (draggedRef.current) {
      draggedRef.current = false;
      return;
    }
    toggleMenu();
  }, [toggleMenu]);

  const hideBuddy = useCallback(() => {
    try {
      localStorage.setItem("mg_hidden", "1");
    } catch {
      // Non-fatal.
    }
    setHidden(true);
    setMenuOpen(false);
    setTour(false);
  }, []);

  const showBuddy = useCallback(() => {
    try {
      localStorage.setItem("mg_hidden", "0");
    } catch {
      // Non-fatal.
    }
    setHidden(false);
    relayout();
  }, [relayout]);

  const toggleReduced = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const on = event.target.checked;
    try {
      localStorage.setItem("mg_reduced", on ? "1" : "0");
    } catch {
      // Non-fatal.
    }
    setReduced(on);
  }, []);

  const currentStep = STEPS[step];
  const motionOff = reducedMotion();

  const buddyAnchorStyle = useMemo<React.CSSProperties>(() => {
    const transition = motionOff || dragging ? "none" : "left .6s cubic-bezier(.22,1,.36,1), top .6s cubic-bezier(.22,1,.36,1)";
    return { position: "fixed", zIndex: 65, left: layout.buddy.x, top: layout.buddy.y, transition };
  }, [layout.buddy, motionOff, dragging]);

  const exprStyles = useMemo<{ head: React.CSSProperties; eye: React.CSSProperties }>(() => {
    let headDeg = 0;
    if (expr === "curious") headDeg = -8;
    if (expr === "point") headDeg = dir.x < 0 ? 6 : -6;

    let eyeX = 0;
    let eyeY = 0;
    if (expr === "look" || expr === "point") {
      eyeX = dir.x * 2;
      eyeY = dir.y * 1.5;
    } else if (expr === "thinking") {
      eyeX = -2;
      eyeY = -1.5;
    } else if (expr === "curious") {
      eyeY = -1.5;
    }

    return {
      head: { transform: `rotate(${headDeg}deg)`, transition: "transform .4s ease" },
      eye: { transform: `translate(${eyeX}px,${eyeY}px)`, transition: "transform .35s ease" },
    };
  }, [dir, expr]);

  const menuPlacement = useMemo<React.CSSProperties>(() => {
    const w = typeof window === "undefined" ? 1024 : window.innerWidth;
    const x = Math.min(layout.buddy.x, w - 232);
    const y = Math.max(12, layout.buddy.y - 250);
    return { position: "fixed", zIndex: 70, left: x, top: y, width: 216 };
  }, [layout.buddy]);

  if (hidden) {
    return (
      <button
        type="button"
        onClick={showBuddy}
        className="fixed bottom-5 left-5 z-[60] flex items-center gap-2 rounded-full border border-neutral-300 bg-white py-2 pl-2.5 pr-3.5 text-[13px] text-neutral-900 shadow-lg hover:bg-neutral-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100 dark:hover:bg-neutral-800"
      >
        <svg viewBox="0 0 64 72" width={20} height={22} aria-hidden="true">
          <path d="M42 4 h9 v20 l-4.5 -4 l-4.5 4 z" fill="#0284c7" />
          <path d="M12 12 h30 l10 10 v34 a6 6 0 0 1 -6 6 h-28 a6 6 0 0 1 -6 -6 v-42 a6 6 0 0 1 6 -6 z" fill={dark ? "#171717" : "#fff"} stroke="#cbd5e1" strokeWidth={2} />
        </svg>
        Research buddy
      </button>
    );
  }

  return (
    <>
      {layout.spot && (
        <div
          aria-hidden="true"
          style={{
            position: "fixed",
            zIndex: 44,
            left: layout.spot.x,
            top: layout.spot.y,
            width: layout.spot.w,
            height: layout.spot.h,
            borderRadius: 8,
            boxShadow: "0 0 0 9999px rgba(15,23,42,.55)",
            outline: "2px solid #38bdf8",
            outlineOffset: 2,
            pointerEvents: "none",
            transition: motionOff ? "none" : "all .45s cubic-bezier(.22,1,.36,1)",
            animation: motionOff ? "none" : "mg-ring 2s ease-out infinite",
          }}
        />
      )}

      <div style={buddyAnchorStyle}>
        <button
          type="button"
          onClick={handleBuddyClick}
          onPointerDown={onBuddyPointerDown}
          onPointerMove={onBuddyPointerMove}
          onPointerUp={endBuddyDrag}
          onPointerCancel={endBuddyDrag}
          aria-label="Marginalia research buddy — drag to move, click to open help menu"
          className={`relative block h-[72px] w-16 touch-none border-0 bg-transparent p-0 ${tour ? "" : dragging ? "cursor-grabbing" : "cursor-grab"}`}
        >
          <div className={motionOff || dragging ? "h-full w-full" : "mg-bob h-full w-full"}>
            <svg viewBox="0 0 64 72" width={64} height={72} style={{ overflow: "visible" }}>
              <g style={exprStyles.head}>
                <path d="M42 4 h9 v20 l-4.5 -4 l-4.5 4 z" fill="#0284c7" />
                <path
                  d="M12 12 h30 l10 10 v34 a6 6 0 0 1 -6 6 h-28 a6 6 0 0 1 -6 -6 v-42 a6 6 0 0 1 6 -6 z"
                  fill={dark ? "#171717" : "#ffffff"}
                  stroke="#cbd5e1"
                  strokeWidth={1.6}
                />
                <path d="M42 12 l10 10 h-10 z" fill={dark ? "#262626" : "#e2e8f0"} stroke="#cbd5e1" strokeWidth={1.2} strokeLinejoin="round" />
                <rect x={20} y={52} width={18} height={3} rx={1.5} fill="#e0f2fe" />
                <rect x={20} y={52} width={6} height={3} rx={1.5} fill="#0284c7" />
                <g style={exprStyles.eye}>
                  <g className={motionOff ? "" : "mg-lid"}>
                    <circle cx={26} cy={36} r={4.4} fill={dark ? "#f5f5f5" : "#171717"} />
                    <circle cx={27.4} cy={34.6} r={1.2} fill={dark ? "#171717" : "#fff"} />
                  </g>
                  <g className={motionOff ? "" : "mg-lid"}>
                    <circle cx={40} cy={36} r={4.4} fill={dark ? "#f5f5f5" : "#171717"} />
                    <circle cx={41.4} cy={34.6} r={1.2} fill={dark ? "#171717" : "#fff"} />
                  </g>
                </g>
                <path d="M28 44 q5 4 10 0" fill="none" stroke={dark ? "#f5f5f5" : "#171717"} strokeWidth={1.8} strokeLinecap="round" />
              </g>
            </svg>
          </div>

          {expr === "thinking" && (
            <div className="absolute -top-3.5 left-1/2 flex -translate-x-1/2 gap-1">
              <span className="h-[5px] w-[5px] rounded-full bg-sky-600" style={{ animation: motionOff ? "none" : "mg-think 1.1s ease-in-out infinite" }} />
              <span className="h-[5px] w-[5px] rounded-full bg-sky-600" style={{ animation: motionOff ? "none" : "mg-think 1.1s ease-in-out .18s infinite" }} />
              <span className="h-[5px] w-[5px] rounded-full bg-sky-600" style={{ animation: motionOff ? "none" : "mg-think 1.1s ease-in-out .36s infinite" }} />
            </div>
          )}

          {spark && (
            <svg width={20} height={20} viewBox="0 0 24 24" className="absolute -right-1 -top-2" fill="#0284c7" aria-hidden="true">
              <path d="M12 2l1.8 6.2L20 10l-6.2 1.8L12 18l-1.8-6.2L4 10l6.2-1.8z" style={{ animation: motionOff ? "none" : "mg-spark 1s ease-out infinite", transformOrigin: "center" }} />
            </svg>
          )}

          {expr === "point" && layout.pointer && (
            <div
              style={{
                position: "absolute",
                top: 30,
                left: 30,
                width: 0,
                height: 0,
                borderLeft: "10px solid #0284c7",
                borderTop: "5px solid transparent",
                borderBottom: "5px solid transparent",
                transformOrigin: "0 50%",
                transform: `rotate(${layout.pointer.deg}deg) translateX(20px)`,
                filter: "drop-shadow(0 1px 2px rgba(0,0,0,.15))",
              }}
            />
          )}
        </button>
      </div>

      {tour && layout.bubble && (
        <div
          className="mg-fade rounded-2xl border border-neutral-200 bg-white p-4 shadow-2xl dark:border-neutral-800 dark:bg-neutral-900"
          role="dialog"
          aria-label="Research buddy guidance"
          style={{ position: "fixed", zIndex: 66, left: layout.bubble.x, top: layout.bubble.y, width: BUBBLE_W, maxWidth: "calc(100vw - 24px)" }}
        >
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-sky-600 dark:text-sky-400">{currentStep.badge}</span>
            <button type="button" onClick={skipTour} aria-label="Close" className="flex p-0.5 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200">
              <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 6 6 18" />
                <path d="m6 6 12 12" />
              </svg>
            </button>
          </div>

          {currentStep.title && <div className="mb-1 text-[15px] font-semibold text-neutral-900 dark:text-neutral-100">{currentStep.title}</div>}
          <p className="text-[13px] leading-relaxed text-neutral-600 dark:text-neutral-300">{currentStep.text}</p>

          {currentStep.diagram === "visualize" && (
            <div className="mt-3 flex items-center gap-1.5">
              <span className="flex-1 rounded-md bg-sky-50 px-1 py-1.5 text-center text-[11px] font-semibold text-sky-800 dark:bg-sky-950 dark:text-sky-200">Concept</span>
              <span className="text-sky-600">→</span>
              <span className="flex-1 rounded-md bg-sky-50 px-1 py-1.5 text-center text-[11px] font-semibold text-sky-800 dark:bg-sky-950 dark:text-sky-200">Process</span>
              <span className="text-sky-600">→</span>
              <span className="flex-1 rounded-md bg-sky-50 px-1 py-1.5 text-center text-[11px] font-semibold text-sky-800 dark:bg-sky-950 dark:text-sky-200">Result</span>
            </div>
          )}
          {currentStep.diagram === "trace" && (
            <div className="mt-3 flex flex-col items-center gap-0.5">
              <span className="text-[11px] font-bold tracking-wide text-neutral-900 dark:text-neutral-100">CLAIM</span>
              <span className="text-xs text-sky-600">↓</span>
              <span className="text-[11px] font-semibold text-sky-700 dark:text-sky-300">EVIDENCE</span>
              <span className="text-xs text-sky-600">↓</span>
              <span className="text-[11px] font-semibold text-sky-700 dark:text-sky-300">EXPERIMENT</span>
              <span className="text-xs text-sky-600">↓</span>
              <span className="text-[11px] font-semibold text-sky-700 dark:text-sky-300">RESULT</span>
            </div>
          )}
          {currentStep.diagram === "learn" && (
            <div className="mt-3 grid grid-cols-2 gap-1.5">
              {["Build", "Connect", "Find", "Predict"].map((label) => (
                <span key={label} className="rounded-md border border-sky-200 px-1 py-1 text-center text-[11px] font-semibold text-sky-800 dark:border-sky-800 dark:text-sky-200">
                  {label}
                </span>
              ))}
            </div>
          )}
          {currentStep.diagram === "investigate" && (
            <div className="mt-3 flex flex-col gap-1">
              {["Finding claims", "Checking evidence", "Following sources", "Building answer"].map((label) => (
                <span key={label} className="rounded-md bg-sky-50 px-2 py-1 text-[11px] text-sky-800 dark:bg-sky-950 dark:text-sky-200">
                  {label}
                </span>
              ))}
            </div>
          )}

          <div className="mt-3.5 flex items-center gap-2">
            {step > 0 && !currentStep.secondary && (
              <button type="button" onClick={back} className="px-1 py-1.5 text-[13px] text-neutral-600 hover:text-neutral-900 dark:text-neutral-300 dark:hover:text-neutral-100">
                Back
              </button>
            )}
            {currentStep.secondary && (
              <button type="button" onClick={skipTour} className="px-1 py-1.5 text-[13px] text-neutral-600 hover:text-neutral-900 dark:text-neutral-300 dark:hover:text-neutral-100">
                {currentStep.secondary}
              </button>
            )}
            <span className="flex-1" />
            {step < STEPS.length - 1 && (
              <button type="button" onClick={skipTour} className="px-1 py-1.5 text-xs text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200">
                Skip tour
              </button>
            )}
            <button type="button" onClick={next} className="rounded-md bg-sky-600 px-4 py-1.5 text-[13px] font-medium text-white hover:bg-sky-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600">
              {currentStep.primary || (step === STEPS.length - 1 ? "Got it" : "Next")}
            </button>
          </div>
        </div>
      )}

      {menuOpen && (
        <div
          className="mg-fade overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-2xl dark:border-neutral-800 dark:bg-neutral-900"
          role="menu"
          aria-label="Buddy help menu"
          style={menuPlacement}
        >
          {menuView === "root" && (
            <div className="p-1.5">
              <div className="px-2.5 pb-1.5 pt-2 text-[11px] font-semibold uppercase tracking-wider text-sky-600 dark:text-sky-400">Research buddy</div>
              <button type="button" onClick={() => setMenuView("what")} className={menuItemClass}>What can I do here?</button>
              <button type="button" onClick={replay} className={menuItemClass}>Replay walkthrough</button>
              <button type="button" onClick={explainScreen} className={menuItemClass}>Explain this screen</button>
              <button type="button" onClick={hideBuddy} className={menuItemClass}>Hide buddy</button>
              <button type="button" onClick={() => setMenuView("settings")} className={menuItemClass}>Settings</button>
            </div>
          )}
          {menuView === "what" && (
            <div className="p-1.5">
              <button type="button" onClick={() => setMenuView("root")} className="flex w-full items-center gap-1.5 rounded-md px-2.5 py-2 text-xs text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800">
                ← Back
              </button>
              <div className="px-2.5 pb-2 pt-0.5 text-[11px] text-neutral-500">In the Reader you can</div>
              <div className={whatItemClass}>Select research to investigate</div>
              <div className={whatItemClass}>Visualize a concept</div>
              <div className={whatItemClass}>Trace evidence back to source</div>
              <div className={whatItemClass}>Start learning interactively</div>
              <div className={whatItemClass}>Explore the paper</div>
            </div>
          )}
          {menuView === "settings" && (
            <div className="p-1.5">
              <button type="button" onClick={() => setMenuView("root")} className="flex w-full items-center gap-1.5 rounded-md px-2.5 py-2 text-xs text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800">
                ← Back
              </button>
              <label className="flex cursor-pointer items-center justify-between gap-2 rounded-md px-2.5 py-2 text-[13px] text-neutral-900 dark:text-neutral-100">
                <span>Reduced motion</span>
                <input type="checkbox" checked={reduced} onChange={toggleReduced} />
              </label>
              <button type="button" onClick={replay} className={menuItemClass}>Restart walkthrough</button>
            </div>
          )}
        </div>
      )}
    </>
  );
}
