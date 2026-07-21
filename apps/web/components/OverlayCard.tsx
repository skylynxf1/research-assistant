"use client";

import { useEffect, useState } from "react";
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

export default function OverlayCard({
  asset,
  card,
  mentions,
  currentPage,
  focused,
  reciprocal,
  anchorVisible,
  positioned,
  y,
  scrollDriven,
  variant = "rail",
  compact = false,
  onClose,
  onFocus,
  onHoverChange,
  onJumpToMention,
  onExpand,
}: Props) {
  const [entered, setEntered] = useState(false);
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setEntered(true));
    return () => window.cancelAnimationFrame(frame);
  }, []);

  const dismiss = () => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      onClose();
      return;
    }
    setClosing(true);
    window.setTimeout(onClose, 120);
  };

  const isRail = variant === "rail";
  const translatedY = y + (entered ? 0 : 8);

  return (
    <article
      data-rail-card={asset.asset_id}
      tabIndex={0}
      onMouseEnter={() => onHoverChange(true)}
      onMouseLeave={() => onHoverChange(false)}
      onFocus={() => {
        onFocus();
        onHoverChange(true);
      }}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) onHoverChange(false);
      }}
      className={`group overflow-hidden rounded-md border bg-neutral-50 outline-none dark:bg-neutral-900 ${
        focused || reciprocal
          ? "border-sky-500"
          : "border-neutral-900/10 dark:border-white/10"
      } ${
        scrollDriven
          ? "transition-none"
          : "transition-[transform,opacity,border-color] duration-200 ease-[cubic-bezier(0.2,0,0,1)] motion-reduce:transition-opacity"
      } ${isRail ? "absolute inset-x-0" : "relative w-full"}`}
      style={{
        transform: isRail
          ? `translateY(${translatedY}px)${closing ? " scale(0.98)" : ""}`
          : closing
            ? "scale(0.98)"
            : undefined,
        opacity: closing || !positioned ? 0 : entered ? (anchorVisible ? 1 : 0.55) : 0,
      }}
    >
      <header className="flex items-center gap-2 border-b border-neutral-900/10 px-3 py-2 dark:border-white/10">
        <span className="flex-1 truncate text-[11px] font-medium uppercase tracking-[0.08em] text-neutral-500 dark:text-neutral-400">
          {asset.label}
        </span>
        {!card.hard && <span className="text-[11px] text-neutral-400">auto</span>}
        <button
          type="button"
          onClick={dismiss}
          aria-label={`Close ${asset.label}`}
          className="rounded px-1 text-neutral-500 hover:bg-neutral-200 focus-visible:outline-2 focus-visible:outline-sky-500 dark:hover:bg-neutral-800"
        >
          ×
        </button>
      </header>

      <button type="button" onClick={onExpand} className="block w-full bg-white p-1" title="Enlarge figure">
        <img
          src={blobUrl(asset.image_url)}
          alt={asset.caption}
          className={`${compact ? "max-h-24" : "max-h-80"} w-full bg-white object-contain`}
        />
      </button>

      <details className={`${compact ? "hidden" : "block"} border-t border-neutral-900/10 px-3 py-2 text-[13px] leading-[1.5] text-neutral-700 dark:border-white/10 dark:text-neutral-300`}>
        <summary className="line-clamp-3 cursor-pointer list-none">{asset.caption}</summary>
        <p className="pt-2">{asset.caption}</p>
      </details>

      {mentions.length > 0 && (
        <footer className="flex flex-wrap items-center gap-1 border-t border-neutral-900/10 px-3 py-2 text-xs dark:border-white/10">
          {mentions.map((mention) => (
            <button
              key={`${mention.page}-${mention.index}`}
              type="button"
              onClick={() => onJumpToMention(mention)}
              className={`rounded px-2 py-1 font-mono focus-visible:outline-2 focus-visible:outline-sky-500 ${
                mention.page === currentPage
                  ? "bg-sky-500 text-white"
                  : "text-neutral-500 hover:bg-neutral-200 dark:text-neutral-400 dark:hover:bg-neutral-800"
              }`}
            >
              p.{mention.page + 1}
            </button>
          ))}
        </footer>
      )}
    </article>
  );
}
