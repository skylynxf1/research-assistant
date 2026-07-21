"use client";

import { ArrowUpRight, Minus, Pin } from "lucide-react";
import { useRef } from "react";
import { blobUrl } from "../lib/api";
import type { Asset } from "../lib/manifest";
import type { Mention } from "../lib/mentions";

export type PopupMode = "idle" | "open" | "pinned" | "docked";

export interface PopupState {
  assetId: string;
  mode: PopupMode;
  position: { x: number; y: number } | null;
  anchorMentionId: string | null;
  z: number;
}

export interface PopupRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PlacementInput {
  popup: { width: number; height: number };
  anchor: { left: number; top: number; right: number; bottom: number };
  viewport: { width: number; height: number };
  occupied: PopupRect[];
}

export type PopupEvent =
  | { type: "pin" }
  | { type: "unpin" }
  | { type: "dock" }
  | { type: "restore"; position: { x: number; y: number }; z: number }
  | { type: "drag"; position: { x: number; y: number } };

export function transitionPopup(popup: PopupState, event: PopupEvent): PopupState {
  if (event.type === "pin") return { ...popup, mode: "pinned" };
  if (event.type === "unpin") return { ...popup, mode: "open" };
  if (event.type === "dock") return { ...popup, mode: "docked" };
  if (event.type === "restore") return { ...popup, mode: "pinned", position: event.position, z: event.z };
  return { ...popup, mode: "pinned", position: event.position };
}

export function placePopup(input: PlacementInput): { x: number; y: number } {
  const { popup, anchor, viewport, occupied } = input;
  const minY = 84;
  const maxY = Math.max(minY, viewport.height - popup.height - 24);
  const desiredY = Math.max(minY, Math.min(maxY, anchor.top - 70));
  const right = viewport.width - popup.width - 36;
  const columns: number[] = [];
  for (let column = 0; column < 4; column += 1) {
    columns.push(Math.max(8, right - column * (popup.width + 16)));
    columns.push(Math.min(right, 36 + column * (popup.width + 16)));
  }
  const conflicts = (x: number, y: number) => occupied.some((rect) =>
    x < rect.x + rect.width + 12 &&
    x + popup.width + 12 > rect.x &&
    y < rect.y + rect.height + 12 &&
    y + popup.height + 12 > rect.y,
  );
  for (const x of columns) {
    const candidates = [desiredY, ...occupied.flatMap((rect) => [rect.y + rect.height + 12, rect.y - popup.height - 12])]
      .filter((y) => y >= minY && y <= maxY)
      .sort((a, b) => Math.abs(a - desiredY) - Math.abs(b - desiredY));
    const y = candidates.find((candidate) => !conflicts(x, candidate));
    if (y !== undefined) return { x, y };
  }
  return { x: Math.max(8, right), y: desiredY };
}

export function clampPopupPosition(
  position: { x: number; y: number },
  popup: { width: number; height: number },
  viewport: { width: number; height: number },
): { x: number; y: number } {
  return {
    x: Math.max(8, Math.min(viewport.width - popup.width - 8, position.x)),
    y: Math.max(8, Math.min(viewport.height - popup.height - 8, position.y)),
  };
}

const RAIL_GAP = 12;
const RAIL_EDGE = 16;

export interface RailAnchor {
  cardId: string;
  anchorY: number;
  height: number;
}

export function cancelRailFrame(
  frame: { current: number | null },
  cancel: (handle: number) => void,
): void {
  if (frame.current === null) return;
  cancel(frame.current);
  frame.current = null;
}

export function layoutRail(cards: RailAnchor[], railHeight: number): Map<string, number> {
  const sorted = [...cards].sort((a, b) => a.anchorY - b.anchorY);
  const positions = new Map<string, number>();

  let previousBottom = RAIL_EDGE;
  for (const card of sorted) {
    const desired = card.anchorY - card.height / 2;
    const y = Math.max(desired, previousBottom);
    positions.set(card.cardId, y);
    previousBottom = y + card.height + RAIL_GAP;
  }

  const overflow = previousBottom - RAIL_GAP - (railHeight - RAIL_EDGE);
  if (overflow > 0) {
    let nextTop = railHeight - RAIL_EDGE;
    for (let index = sorted.length - 1; index >= 0; index -= 1) {
      const card = sorted[index];
      const y = Math.min(positions.get(card.cardId)!, nextTop - card.height);
      positions.set(card.cardId, y);
      nextTop = y - RAIL_GAP;
    }
  }

  return positions;
}

export interface CardState {
  assetId: string;
  anchorMentionId: string | null;
  /** Soft pins are replaced first; hard pins persist until dismissed or the four-card cap. */
  hard: boolean;
  order: number;
}

export function capRailCards(cards: CardState[], maximum: number): CardState[] {
  if (cards.length <= maximum) return cards;
  const oldestSoft = cards.filter((card) => !card.hard).sort((a, b) => a.order - b.order)[0];
  const evicted = oldestSoft ?? [...cards].sort((a, b) => a.order - b.order)[0];
  return capRailCards(cards.filter((card) => card !== evicted), maximum);
}

interface Props {
  asset: Asset;
  popup: PopupState;
  mentions: Mention[];
  currentPage: number;
  onMove: (position: { x: number; y: number }) => void;
  onPin: (pinned: boolean) => void;
  onDock: () => void;
  onRaise: () => void;
  onJumpToAsset: () => void;
  onJumpToMention: (mention: Mention) => void;
}

/**
 * Temporary compatibility for the rail-era Reader call sites. Task 4 removes this
 * branch when it migrates Reader to the popup controller.
 */
interface LegacyRailProps {
  asset: Asset;
  card: CardState;
  mentions: Mention[];
  currentPage: number;
  focused: boolean;
  reciprocal: boolean;
  anchorVisible: boolean;
  positioned: boolean;
  y: number;
  scrollDriven: boolean;
  variant?: "rail" | "sheet";
  compact?: boolean;
  onClose: () => void;
  onFocus: () => void;
  onHoverChange: (hovered: boolean) => void;
  onJumpToMention: (mention: Mention) => void;
  onExpand: () => void;
}

type OverlayCardProps = Props | LegacyRailProps;

function isPopupProps(props: OverlayCardProps): props is Props {
  return "popup" in props;
}

export default function OverlayCard(props: OverlayCardProps) {
  const rootRef = useRef<HTMLElement | null>(null);
  const drag = useRef<{ pointerId: number; dx: number; dy: number } | null>(null);
  const legacy = !isPopupProps(props);
  const popup = legacy
    ? ({
        assetId: props.card.assetId,
        mode: props.card.hard ? "pinned" : "open",
        position: { x: 16, y: props.y },
        anchorMentionId: props.card.anchorMentionId,
        z: 1,
      } satisfies PopupState)
    : props.popup;
  const onMove = legacy ? () => props.onFocus() : props.onMove;
  const onPin = legacy ? () => props.onFocus() : props.onPin;
  const onDock = legacy ? props.onClose : props.onDock;
  const onRaise = legacy ? props.onFocus : props.onRaise;
  const onJumpToAsset = legacy ? props.onExpand : props.onJumpToAsset;
  const onJumpToMention = props.onJumpToMention;

  const onPointerDown = (event: React.PointerEvent) => {
    if (!popup.position) return;
    onRaise();
    drag.current = {
      pointerId: event.pointerId,
      dx: event.clientX - popup.position.x,
      dy: event.clientY - popup.position.y,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: React.PointerEvent) => {
    if (!drag.current || drag.current.pointerId !== event.pointerId) return;
    const bounds = rootRef.current?.getBoundingClientRect();
    const width = bounds?.width ?? 390;
    const height = bounds?.height ?? 336;
    onMove(clampPopupPosition(
      { x: event.clientX - drag.current.dx, y: event.clientY - drag.current.dy },
      { width, height },
      { width: window.innerWidth, height: window.innerHeight },
    ));
  };

  return (
    <article
      ref={rootRef}
      data-popup-asset={props.asset.asset_id}
      className="fixed overflow-hidden rounded-[20px] border border-white/95 bg-white/70 shadow-[0_0_0_1px_rgba(15,23,42,0.06),0_24px_70px_rgba(15,23,42,0.22)] backdrop-blur-[28px] backdrop-saturate-[1.6] dark:border-white/15 dark:bg-slate-900/75"
      style={{
        left: popup.position?.x ?? 0,
        top: popup.position?.y ?? 84,
        width: props.asset.kind === "table" ? 340 : 390,
        zIndex: popup.z,
      }}
      onPointerDown={onRaise}
    >
      <header
        className="flex cursor-grab touch-none select-none items-center gap-2 px-[18px] pb-2 pt-3 active:cursor-grabbing"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={() => { drag.current = null; }}
        onPointerCancel={() => { drag.current = null; }}
      >
        <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#3b5bdb]">{props.asset.label}</span>
        <span className="text-[11px] text-slate-400">· page {props.asset.page + 1}</span>
        <span className="flex flex-1 justify-center gap-[3px] opacity-35" aria-hidden="true">
          {Array.from({ length: 5 }, (_, index) => <i key={index} className="h-[3px] w-[3px] rounded-full bg-slate-900 dark:bg-white" />)}
        </span>
        <button
          type="button"
          aria-pressed={popup.mode === "pinned"}
          onClick={() => onPin(popup.mode !== "pinned")}
          className="grid h-[26px] w-[26px] place-items-center rounded-lg text-slate-500 hover:bg-slate-900/5 aria-pressed:bg-[#3b5bdb] aria-pressed:text-white"
        >
          <Pin size={14} aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={onDock}
          aria-label={`Minimize ${props.asset.label}`}
          className="grid h-[26px] w-[26px] place-items-center rounded-lg text-slate-500 hover:bg-slate-900/5"
        >
          <Minus size={16} aria-hidden="true" />
        </button>
      </header>

      <div className="mx-[18px] overflow-hidden rounded-[12px] bg-white p-1">
        <img src={blobUrl(props.asset.image_url)} alt={props.asset.caption} className="max-h-80 w-full bg-white object-contain" />
      </div>

      <div className="px-[18px] pb-3 pt-2">
        <p className="text-[12.5px] leading-[1.55] text-slate-700 dark:text-slate-200">{props.asset.caption}</p>
        <button
          type="button"
          onClick={onJumpToAsset}
          className="mt-2 inline-flex items-center gap-1 rounded-full border border-[#3b5bdb]/20 bg-[#3b5bdb]/10 px-3 py-1 text-[12.5px] font-semibold text-[#2f4ac2] hover:bg-[#3b5bdb]/20"
        >
          Jump to {props.asset.label}
          <ArrowUpRight size={14} aria-hidden="true" />
        </button>
      </div>

      <footer className="flex flex-wrap items-center gap-1 border-t border-slate-900/10 px-[18px] py-2 dark:border-white/10">
        <span className="mr-1 text-[11px] text-slate-400">
          {popup.mode === "pinned" ? "Pinned" : "Auto · fades on scroll"}
        </span>
        {props.mentions.map((mention) => (
            <button
              key={`${mention.page}-${mention.index}`}
              type="button"
              onClick={() => onJumpToMention(mention)}
              className={`rounded-full px-2 py-1 text-[11px] font-semibold focus-visible:outline-2 focus-visible:outline-[#3b5bdb] ${
                mention.page === props.currentPage
                  ? "bg-[#3b5bdb] text-white"
                  : "bg-slate-900/5 text-slate-500 hover:bg-slate-900/10 dark:bg-white/10 dark:text-slate-300"
              }`}
            >
              p.{mention.page + 1}
            </button>
        ))}
      </footer>
    </article>
  );
}
