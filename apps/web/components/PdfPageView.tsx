"use client";

import { useEffect, useRef, useState } from "react";
import { mountTextLayer, type MountedTextLayer, type PDFDocumentProxy } from "../lib/pdf";
import type { Citation } from "../lib/citations";
import type { BBox, Mention, PageTextItem } from "../lib/mentions";
import { captureSelection, type CapturedSelection } from "../lib/selection/dom";
import { shouldCaptureKeyboardSelection } from "../lib/selection/keyboard";

interface Props {
  doc: PDFDocumentProxy;
  pageIndex: number;
  width: number;
  /** Render the canvas only when near the viewport (spec section 8). */
  active: boolean;
  dark: boolean;
  mentions: Mention[];
  citations: Citation[];
  textItems: PageTextItem[];
  onOpenAsset: (assetId: string) => void;
  onOpenCitation: (citation: Citation) => void;
  onTextSelection: (selection: CapturedSelection) => void;
  highlightedAssetId: string | null;
  evidenceBBox?: BBox;
  /** Marks the paper's very first figure/table mention as the onboarding tour anchor. */
  tourAnchorMentionId?: string | null;
}

/**
 * One page: a canvas plus an absolutely positioned hotspot layer.
 *
 * Hotspots are subtle underlines rather than highlights. A highlight fights with the
 * reader's own annotations, and the point of this tool is to stay out of the way of
 * someone who is genuinely reading (spec section 8).
 */
export default function PdfPageView({
  doc,
  pageIndex,
  width,
  active,
  dark,
  mentions,
  citations,
  textItems,
  onOpenAsset,
  onOpenCitation,
  onTextSelection,
  highlightedAssetId,
  evidenceBBox,
  tourAnchorMentionId,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const textLayerRef = useRef<HTMLDivElement | null>(null);
  const [height, setHeight] = useState(width * 1.294); // letter aspect until measured

  useEffect(() => {
    let cancelled = false;
    let task: { cancel: () => void } | null = null;
    let textLayer: MountedTextLayer | null = null;

    (async () => {
      const page = await doc.getPage(pageIndex + 1);
      const base = page.getViewport({ scale: 1 });
      const scale = width / base.width;
      const textViewport = page.getViewport({ scale });
      const viewport = page.getViewport({ scale: scale * (window.devicePixelRatio || 1) });
      if (cancelled) return;

      setHeight(base.height * scale);
      const canvas = canvasRef.current;
      if (!canvas || !active) return;

      const textContainer = textLayerRef.current;
      if (textContainer) {
        textContainer.replaceChildren();
        textContainer.style.setProperty("--scale-factor", String(scale));
        textLayer = await mountTextLayer(page, textContainer, textViewport);
        if (cancelled) return;
      }

      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const context = canvas.getContext("2d");
      if (!context) return;

      // pdf.js 6 wants the canvas itself, not only its context.
      const renderTask = page.render({ canvas, canvasContext: context, viewport });
      task = renderTask;
      try {
        await renderTask.promise;
      } catch {
        // Cancelled by a re-render; nothing to do.
      }
    })();

    const captureCurrentSelection = () => {
    const root = textLayerRef.current;
    if (!root) return;
    const selection = captureSelection(root, pageIndex, textItems);
    if (selection) onTextSelection(selection);
  };

  return () => {
      cancelled = true;
      task?.cancel?.();
      textLayer?.cancel();
      textLayerRef.current?.replaceChildren();
    };
  }, [doc, pageIndex, width, active]);

  const captureCurrentSelection = () => {
    const root = textLayerRef.current;
    if (!root) return;
    const selection = captureSelection(root, pageIndex, textItems);
    if (selection) onTextSelection(selection);
  };

  return (
    <div
      data-page={pageIndex}
      className="relative mx-auto mb-6 bg-white shadow-lg"
      style={{ width, height }}
    >
      <canvas
        ref={canvasRef}
        className="block h-full w-full"
        // Dark mode inverts the page but never the figure crops: inverting a plot with a
        // white background makes it unreadable and inverting a photo destroys it.
        style={{ filter: dark ? "invert(1) hue-rotate(180deg)" : undefined }}
      />

      <div
        ref={textLayerRef}
        className="pdf-text-layer"
        tabIndex={0}
        role="document"
        aria-label={`Page ${pageIndex + 1} text`}
        onMouseUp={captureCurrentSelection}
        onKeyUp={(event) => {
          if (shouldCaptureKeyboardSelection(event.key, event.shiftKey)) {
            captureCurrentSelection();
          }
        }}
      />

      {evidenceBBox && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute z-20 border-2 border-amber-500 bg-amber-300/20 shadow-[0_0_0_2px_rgba(255,255,255,0.65)]"
          style={{
            left: `${evidenceBBox[0] * 100}%`,
            top: `${evidenceBBox[1] * 100}%`,
            width: `${(evidenceBBox[2] - evidenceBBox[0]) * 100}%`,
            height: `${(evidenceBBox[3] - evidenceBBox[1]) * 100}%`,
          }}
        />
      )}

      {mentions
        .filter((mention) => mention.assetId !== null && mention.rect !== null)
<<<<<<< Updated upstream
        .map((mention, i) => (
          <button
            key={`m-${i}`}
            type="button"
            title={`Open ${mention.text}`}
            onClick={() => onOpenAsset(mention.assetId as string)}
            className={`absolute z-30 cursor-pointer border-b-2 transition-colors ${
              highlightedAssetId === mention.assetId
                ? "border-amber-500 bg-amber-300/25"
                : "border-sky-500/60 hover:bg-sky-400/20"
            }`}
            style={{
              left: `${mention.rect![0] * 100}%`,
              top: `${mention.rect![1] * 100}%`,
              width: `${(mention.rect![2] - mention.rect![0]) * 100}%`,
              height: `${(mention.rect![3] - mention.rect![1]) * 100}%`,
            }}
          />
        ))}
=======
        .map((mention, i) => {
          const assetId = mention.assetId as string;
          const mentionId = `${assetId}:p${pageIndex}:m${mention.index}`;
          return (
            <button
              key={`m-${i}`}
              data-mention-id={mentionId}
              data-mention-asset={assetId}
              data-tour={mentionId === tourAnchorMentionId ? "figure-mention" : undefined}
              type="button"
              title={`Open ${mention.text}`}
              onClick={() => onOpenAsset(assetId, mentionId)}
              className={`absolute z-30 cursor-pointer border-b-2 transition-colors ${
                highlightedAssetId === mention.assetId
                  ? "border-amber-500 bg-amber-300/25"
                  : "border-sky-500/60 hover:bg-sky-400/20"
              }`}
              style={{
                left: `${mention.rect![0] * 100}%`,
                top: `${mention.rect![1] * 100}%`,
                width: `${(mention.rect![2] - mention.rect![0]) * 100}%`,
                height: `${(mention.rect![3] - mention.rect![1]) * 100}%`,
              }}
            />
          );
        })}
>>>>>>> Stashed changes

      {citations
        .filter((citation) => citation.openable && citation.rect !== null)
        .map((citation, i) => (
          <button
            key={`c-${i}`}
            type="button"
            title={`Open ${citation.text} side by side`}
            onClick={() => onOpenCitation(citation)}
            className="absolute z-30 cursor-pointer border-b-2 border-violet-500/60 hover:bg-violet-400/20"
            style={{
              left: `${citation.rect![0] * 100}%`,
              top: `${citation.rect![1] * 100}%`,
              width: `${(citation.rect![2] - citation.rect![0]) * 100}%`,
              height: `${(citation.rect![3] - citation.rect![1]) * 100}%`,
            }}
          />
        ))}
    </div>
  );
}
