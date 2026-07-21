/**
 * pdf.js setup and the bridge from its text layer to our detection modules.
 *
 * pdfjs-dist is imported directly rather than through react-pdf, because we need
 * low-level access to textContent.items that wrappers hide (spec section 9).
 */

import * as pdfjs from "pdfjs-dist";
import type { PDFDocumentProxy, PDFPageProxy } from "pdfjs-dist";
import type { PageTextItem } from "./mentions";

/** The worker is copied into public/ at setup; a bundled path would not resolve here. */
pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

export type { PDFDocumentProxy, PDFPageProxy };

export async function loadPdf(url: string): Promise<PDFDocumentProxy> {
  return pdfjs.getDocument({ url }).promise;
}

/**
 * Convert a page's text content into normalized, top-left-origin items.
 *
 * This is the single place pdf.js viewport coordinates are converted for the client. The
 * manifest already stores normalized top-left boxes, so after this both sides speak the
 * same language and nothing downstream needs to know about PDF coordinates.
 */
export async function pageTextItems(page: PDFPageProxy): Promise<PageTextItem[]> {
  const content = await page.getTextContent();
  const viewport = page.getViewport({ scale: 1 });
  const { width, height } = viewport;

  return content.items
    .filter((item): item is Extract<typeof item, { str: string }> => "str" in item)
    .map((item) => {
      // transform is [a, b, c, d, e, f]; e/f are the text origin in PDF user space, and
      // the origin sits at the text baseline, not the top of the glyphs.
      const [, , , scaleY, x, y] = item.transform as number[];
      const itemHeight = Math.abs(scaleY) || item.height || 10;
      const top = height - y - itemHeight;
      return {
        str: item.str,
        hasEOL: Boolean(item.hasEOL),
        rect: [
          x / width,
          top / height,
          (x + (item.width || 0)) / width,
          (top + itemHeight) / height,
        ] as [number, number, number, number],
      };
    });
}
