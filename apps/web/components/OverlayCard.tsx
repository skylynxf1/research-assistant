"use client";

import { Pin } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { blobUrl } from "../lib/api";
import type { Asset } from "../lib/manifest";
import type { Mention } from "../lib/mentions";

export interface CardState {
  assetId: string;
  x: number;
  y: number;
  /** Soft pins are replaced by the next auto-dock; hard pins persist until dismissed. */
  hard: boolean;
}

interface Props {
  asset: Asset;
  card: CardState;
  mentions: Mention[];
  currentPage: number;
  focused: boolean;
  ordinal: number;
  onMove: (x: number, y: number) => void;
  onClose: () => void;
  onFocus: () => void;
  onJumpToMention: (mention: Mention) => void;
  onExpand: () => void;
  onPin: () => void;
}

/**
 * A draggable, translucent card floating over the PDF.
 *
 * This replaces spec section 8's dock rail (plan deviation 1), but keeps its central
 * argument: the card *stays* while the reader keeps scrolling. A popup that vanishes on
 * mouse-out reproduces the exact problem the tool exists to solve.
 */
export default function OverlayCard({
  asset,
  card,
  mentions,
  currentPage,
  focused,
  ordinal,
  onMove,
  onClose,
  onFocus,
  onJumpToMention,
  onExpand,
  onPin,
}: Props) {
  const dragOffset = useRef<{ x: number; y: number } | null>(null);
  const [dragging, setDragging] = useState(false);

  const onPointerDown = useCallback(
    (event: React.PointerEvent) => {
      if ((event.target as HTMLElement).closest("button")) return;
      onFocus();
      dragOffset.current = { x: event.clientX - card.x, y: event.clientY - card.y };
      setDragging(true);
      (event.target as HTMLElement).setPointerCapture(event.pointerId);
    },
    [card.x, card.y, onFocus],
  );

  const onPointerMove = useCallback(
    (event: React.PointerEvent) => {
      if (!dragOffset.current) return;
      onMove(
        Math.max(0, event.clientX - dragOffset.current.x),
        Math.max(0, event.clientY - dragOffset.current.y),
      );
    },
    [onMove],
  );

  const endDrag = useCallback(() => {
    dragOffset.current = null;
    setDragging(false);
  }, []);

  return (
    <aside
      data-tour="figure-card"
      aria-label={`${asset.label} source card`}
      className={`fixed z-40 w-[min(20rem,calc(100vw-1rem))] rounded-lg border shadow-2xl backdrop-blur-md transition-shadow ${
        focused
          ? "border-sky-400 bg-white/95 dark:bg-neutral-900/95"
          : "border-neutral-300/70 bg-white/85 dark:border-neutral-700/70 dark:bg-neutral-900/85"
      }`}
      style={{ left: card.x, top: card.y }}
      onMouseDown={onFocus}
    >
      <header
        tabIndex={0}
        aria-label={`Move ${asset.label} card with the arrow keys`}
        aria-keyshortcuts="ArrowUp ArrowDown ArrowLeft ArrowRight"
        className={`flex items-center gap-2 rounded-t-lg border-b border-neutral-200/60 px-3 py-1.5 dark:border-neutral-700/60 ${
          dragging ? "cursor-grabbing" : "cursor-grab"
        }`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onFocus={onFocus}
        onKeyDown={(event) => {
          const delta = event.shiftKey ? 40 : 16;
          const movement: Record<string, [number, number]> = {
            ArrowLeft: [-delta, 0], ArrowRight: [delta, 0], ArrowUp: [0, -delta], ArrowDown: [0, delta],
          };
          const offset = movement[event.key];
          if (!offset) return;
          event.preventDefault();
          onMove(card.x + offset[0], card.y + offset[1]);
        }}
      >
        <span className="rounded bg-neutral-200 px-1.5 text-xs font-mono text-neutral-600 dark:bg-neutral-700 dark:text-neutral-300">
          {ordinal}
        </span>
        <span className="flex-1 truncate text-sm font-medium">{asset.label}</span>
        {card.hard ? null : (
          <span title="auto-docked; click a mention to pin" className="text-xs opacity-50">
            auto
          </span>
        )}
        <button type="button" onClick={onPin} aria-label={`Pin ${asset.label} to Workspace`} className="rounded p-1 text-neutral-500 hover:bg-neutral-200 dark:hover:bg-neutral-700">
          <Pin aria-hidden="true" size={14} />
        </button>
        <button
          type="button"
          onClick={onClose}
          aria-label={`Close ${asset.label}`}
          className="rounded px-1 text-neutral-500 hover:bg-neutral-200 dark:hover:bg-neutral-700"
        >
          ×
        </button>
      </header>

      <button type="button" onClick={onExpand} className="block w-full" title="Click to enlarge">
        {/* Never inverted in dark mode, unlike the page canvas. */}
        <img
          src={blobUrl(asset.image_url)}
          alt={asset.caption}
          className="max-h-64 w-full bg-white object-contain"
        />
      </button>

      <p className="max-h-24 overflow-y-auto px-3 py-2 text-xs leading-snug text-neutral-700 dark:text-neutral-300">
        {asset.caption}
      </p>

      {/*
        Reverse links. Spec section 8 calls these a headline feature rather than a
        detail: they are what makes a figure legible when it is discussed in three
        separate places, and nobody else does it.
      */}
      {mentions.length > 0 && (
        <footer className="flex flex-wrap items-center gap-1 border-t border-neutral-200/60 px-3 py-1.5 text-xs dark:border-neutral-700/60">
          <span className="mr-1 opacity-60">referenced from</span>
          {mentions.map((mention, i) => (
            <button
              key={i}
              type="button"
              onClick={() => onJumpToMention(mention)}
              className={`rounded px-1.5 py-0.5 font-mono ${
                mention.page === currentPage
                  ? "bg-amber-400/70 text-neutral-900"
                  : "bg-neutral-200 hover:bg-neutral-300 dark:bg-neutral-700 dark:hover:bg-neutral-600"
              }`}
            >
              p.{mention.page + 1}
            </button>
          ))}
        </footer>
      )}
    </aside>
  );
}
