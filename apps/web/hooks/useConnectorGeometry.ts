"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { connectorPath, resolveConnectorGeometry, type Point, type RectLike } from "../components/connectors/geometry";

export interface ConnectorTarget {
  assetId: string;
  anchorMentionId?: string;
}

export interface MeasuredConnector {
  connectorId: string;
  assetId: string;
  mentionId: string;
  start: Point;
  end: Point;
  path: string;
}

export function cancelConnectorFrame(
  frame: { current: number | null },
  cancel: (handle: number) => void,
): void {
  if (frame.current === null) return;
  cancel(frame.current);
  frame.current = null;
}

function isVisible(rect: RectLike): boolean {
  return rect.bottom > 0 && rect.top < window.innerHeight && rect.right > 0 && rect.left < window.innerWidth;
}

function sameMeasurements(a: MeasuredConnector[], b: MeasuredConnector[]): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** Measures all anchors in one read phase and only schedules work while geometry is dirty. */
export function useConnectorGeometry(targets: ConnectorTarget[]): MeasuredConnector[] {
  const [measurements, setMeasurements] = useState<MeasuredConnector[]>([]);
  const targetsRef = useRef(targets);
  const frameRef = useRef<number | null>(null);
  targetsRef.current = targets;

  const measure = useCallback(() => {
    frameRef.current = null;

    // Read every DOM rectangle before the state write below to avoid layout thrash.
    const reads = targetsRef.current.map((target) => {
      const card = document.querySelector<HTMLElement>(`[data-connector-card="${CSS.escape(target.assetId)}"]`);
      const mentions = Array.from(
        document.querySelectorAll<HTMLElement>(`[data-connector-asset="${CSS.escape(target.assetId)}"]`),
      );
      const cardRect = card?.isConnected ? card.getBoundingClientRect() : null;
      const mentionRects = mentions.map((element) => ({
        element,
        rects: element.isConnected ? Array.from(element.getClientRects()) : [],
      }));
      return { target, cardRect, mentionRects };
    });

    const next = reads.flatMap(({ target, cardRect, mentionRects }) => {
      if (!cardRect) return [];
      const visible = mentionRects.filter(({ rects }) => rects.some(isVisible));
      const preferred = visible.find(
        ({ element }) => element.dataset.connectorMention === target.anchorMentionId,
      );
      const selected = preferred ?? visible[0];
      if (!selected) return [];
      const visibleRects = selected.rects.filter(isVisible);
      const geometry = resolveConnectorGeometry(cardRect, visibleRects);
      const mentionId = selected.element.dataset.connectorMention;
      if (!geometry || !mentionId) return [];
      return [{
        connectorId: mentionId,
        assetId: target.assetId,
        mentionId,
        start: geometry.card,
        end: geometry.mention,
        path: connectorPath(geometry.card, geometry.mention).d,
      }];
    });
    setMeasurements((current) => (sameMeasurements(current, next) ? current : next));
  }, []);

  const markDirty = useCallback(() => {
    if (frameRef.current !== null) return;
    frameRef.current = window.requestAnimationFrame(measure);
  }, [measure]);

  useEffect(() => {
    markDirty();
  }, [markDirty, targets]);

  useEffect(() => {
    const onDirty = () => markDirty();
    window.addEventListener("scroll", onDirty, { passive: true, capture: true });
    window.addEventListener("resize", onDirty, { passive: true });
    window.addEventListener("marginalia:connector-dirty", onDirty);

    const mutationObserver = new MutationObserver(onDirty);
    const reader = document.querySelector("[data-connector-reader]");
    if (reader) mutationObserver.observe(reader, { childList: true, subtree: true });

    return () => {
      window.removeEventListener("scroll", onDirty, true);
      window.removeEventListener("resize", onDirty);
      window.removeEventListener("marginalia:connector-dirty", onDirty);
      mutationObserver.disconnect();
      cancelConnectorFrame(frameRef, window.cancelAnimationFrame);
    };
  }, [markDirty]);

  useEffect(() => {
    const observer = new ResizeObserver(markDirty);
    targets.forEach(({ assetId }) => {
      const card = document.querySelector(`[data-connector-card="${CSS.escape(assetId)}"]`);
      if (card) observer.observe(card);
    });
    return () => observer.disconnect();
  }, [markDirty, targets]);

  return measurements;
}
