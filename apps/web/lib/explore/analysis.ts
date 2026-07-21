/**
 * Loads a paper and its client-side mention index for the exploration surfaces.
 *
 * The reverse index is a client-side artifact by design (§1.1): the manifest has no
 * mentions[], so anything wanting reverse links has to build them from pdf.js text. This
 * reuses `findMentions` and `pageTextItems` rather than reimplementing detection — there
 * is exactly one mention detector in this codebase and this is not a second one.
 *
 * It deliberately does not import from the reader. §18 asks Developer B not to edit
 * Reader.tsx concurrently, so the few lines of load-and-scan are repeated here instead of
 * being hoisted out of the reader. The detection logic itself is shared; only the
 * orchestration is duplicated.
 *
 * Results are cached per digest (§21: do not rebuild whole-paper state repeatedly), so
 * moving between exploration tabs costs nothing after the first load.
 */

import { loadManifest, pdfUrl } from "../api";
import { findCitations, type Citation } from "../citations";
import type { Manifest } from "../manifest";
import { buildReverseIndex, findMentions, type Mention } from "../mentions";
import type { PageTextItem } from "../mentions";
import { loadPdf, pageTextItems } from "../pdf";
import { citationBodyItems } from "./bibliography";

export interface PaperAnalysis {
  manifest: Manifest;
  /** assetId -> every mention of it, in reading order. */
  reverseIndex: Map<string, Mention[]>;
  mentionsByPage: Mention[][];
  citationsByPage: Citation[][];
  /** Source text geometry retained for deterministic reflow and accessibility. */
  pageItems: PageTextItem[][];
}

const cache = new Map<string, Promise<PaperAnalysis>>();

async function analyse(digest: string): Promise<PaperAnalysis> {
  const manifest = await loadManifest(digest);
  const pdf = await loadPdf(pdfUrl(digest));

  const mentionsByPage: Mention[][] = [];
  const citationsByPage: Citation[][] = [];
  const pageItems: PageTextItem[][] = [];
  let bibliographyStarted = false;
  for (let index = 0; index < pdf.numPages; index += 1) {
    const page = await pdf.getPage(index + 1);
    const items = await pageTextItems(page);
    pageItems.push(items);
    mentionsByPage.push(findMentions(items, { page: index, assets: manifest.assets }));
    const citationBody = citationBodyItems(items, bibliographyStarted);
    bibliographyStarted = citationBody.bibliographyStarted;
    citationsByPage.push(findCitations(citationBody.items, { references: manifest.references }));
  }

  return {
    manifest,
    mentionsByPage,
    citationsByPage,
    pageItems,
    reverseIndex: buildReverseIndex(mentionsByPage.flat()),
  };
}

export function loadPaperAnalysis(digest: string): Promise<PaperAnalysis> {
  const cached = cache.get(digest);
  if (cached) return cached;

  const pending = analyse(digest).catch((error) => {
    // Do not cache a failure: a transient API hiccup should not poison the tab forever.
    cache.delete(digest);
    throw error;
  });
  cache.set(digest, pending);
  return pending;
}
