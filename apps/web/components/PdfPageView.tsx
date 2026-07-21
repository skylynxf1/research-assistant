"use client";

import { useEffect, useRef, useState } from "react";
import type { PDFDocumentProxy } from "../lib/pdf";
import type { Citation } from "../lib/citations";
import type { Mention } from "../lib/mentions";

interface Props {
  doc: PDFDocumentProxy;
  pageIndex: number;
  width: number;
  /** Render the canvas only when near the viewport (spec section 8). */
  active: boolean;
  dark: boolean;
  mentions: Mention[];
  citations: Citation[];
  onOpenAsset: (assetId: string) => void;
  onOpenCitation: (citation: Citation) => void;
  highlightedAssetId: string | null;
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
  onOpenAsset,
  onOpenCitation,
  highlightedAssetId,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [height, setHeight] = useState(width * 1.294); // letter aspect until measured

  useEffect(() => {
    let cancelled = false;
    let task: { cancel: () => void } | null = null;

    (async () => {
      const page = await doc.getPage(pageIndex + 1);
      const base = page.getViewport({ scale: 1 });
      const scale = width / base.width;
      const viewport = page.getViewport({ scale: scale * (window.devicePixelRatio || 1) });
      if (cancelled) return;

      setHeight(base.height * scale);
      const canvas = canvasRef.current;
      if (!canvas || !active) return;

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

    return () => {
      cancelled = true;
      task?.cancel?.();
    };
  }, [doc, pageIndex, width, active]);

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

      {mentions
        .filter((mention) => mention.assetId !== null && mention.rect !== null)
        .map((mention, i) => (
          <button
            key={`m-${i}`}
            type="button"
            title={`Open ${mention.text}`}
            onClick={() => onOpenAsset(mention.assetId as string)}
            className={`absolute cursor-pointer border-b-2 transition-colors ${
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

      {citations
        .filter((citation) => citation.openable && citation.rect !== null)
        .map((citation, i) => (
          <button
            key={`c-${i}`}
            type="button"
            title={`Open ${citation.text} side by side`}
            onClick={() => onOpenCitation(citation)}
            className="absolute cursor-pointer border-b-2 border-violet-500/60 hover:bg-violet-400/20"
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
