import type { Citation } from "../citations";
import type { Asset, Section } from "../manifest";
import { flattenPage, rectForRange, type Mention, type PageTextItem } from "../mentions";
import { buildPagePassages, sectionAtPage } from "../research-context/context";
import type { AssetRef, NormalizedBBox } from "../research-context/types";
import type { ConceptOccurrence, ConceptThread, ConceptThreadGroup } from "./types";

interface ThreadPageData {
  items: PageTextItem[];
  mentions: Mention[];
  citations: Citation[];
}

interface BuildThreadInput {
  paperId: string;
  concept: string;
  pages: ThreadPageData[];
  sections: Section[];
  assets: Asset[];
}

interface SearchPage {
  text: string;
  owners: number[];
}

function normalizeHyphenatedWords(text: string): string {
  return text.replace(/([\p{L}\p{N}])[-\u2010\u2011]([\p{L}\p{N}])/gu, "$1$2");
}

function searchable(items: PageTextItem[]): SearchPage {
  const flat = flattenPage(items);
  let text = "";
  const owners: number[] = [];
  let index = 0;
  while (index < flat.text.length) {
    if (/\s/.test(flat.text[index])) {
      text += " ";
      owners.push(flat.owners[index]);
      while (index < flat.text.length && /\s/.test(flat.text[index])) index += 1;
      continue;
    }
    const char = flat.text[index];
    if (
      /[-\u2010\u2011]/.test(char) &&
      /[\p{L}\p{N}]/u.test(text.at(-1) ?? "") &&
      /[\p{L}\p{N}]/u.test(flat.text[index + 1] ?? "")
    ) {
      index += 1;
      continue;
    }
    text += char;
    owners.push(flat.owners[index]);
    index += 1;
  }
  return { text, owners };
}

function normalizedConcept(concept: string): string {
  const item: PageTextItem = { str: concept, hasEOL: false, rect: [0, 0, 1, 1] };
  return normalizeHyphenatedWords(flattenPage([item]).text).replace(/\s+/g, " ").trim();
}

function isWordCharacter(char: string | undefined): boolean {
  return Boolean(char && /[\p{L}\p{N}_]/u.test(char));
}

function assetRef(paperId: string, asset: Asset): AssetRef {
  return {
    assetId: asset.asset_id,
    paperId,
    kind: asset.kind,
    label: asset.label,
    page: asset.page,
    bbox: asset.bbox,
    caption: asset.caption,
  };
}

function bboxDistance(a: NormalizedBBox, b: NormalizedBBox): number {
  return Math.hypot((a[0] + a[2] - b[0] - b[2]) / 2, (a[1] + a[3] - b[1] - b[3]) / 2);
}

function conceptId(concept: string): string {
  const slug = concept.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `concept-${slug || "selection"}`;
}

export function buildConceptThread({
  paperId,
  concept,
  pages,
  sections,
  assets,
}: BuildThreadInput): ConceptThread {
  const query = normalizedConcept(concept);
  const occurrences: ConceptOccurrence[] = [];

  if (query.length > 0) {
    pages.forEach((page, pageIndex) => {
      const flat = searchable(page.items);
      const haystack = flat.text.toLocaleLowerCase();
      const needle = query.toLocaleLowerCase();
      const passages = buildPagePassages(paperId, pageIndex, page.items, sections);
      let from = 0;

      while (from <= haystack.length - needle.length) {
        const start = haystack.indexOf(needle, from);
        if (start < 0) break;
        const end = start + needle.length;
        from = Math.max(end, start + 1);
        if (isWordCharacter(haystack[start - 1]) || isWordCharacter(haystack[end])) continue;

        const touchedItems = new Set(flat.owners.slice(start, end));
        const passage =
          passages.find((candidate) =>
            candidate.itemRanges.some((range) => touchedItems.has(range.itemIndex)),
          ) ?? passages[0];
        if (!passage) continue;

        const bbox = rectForRange(page.items, flat.owners, start, end) ?? passage.bbox;
        const section = sectionAtPage(sections, pageIndex);
        const nearbyAssets = assets
          .filter((asset) => asset.page === pageIndex)
          .sort((a, b) =>
            bbox
              ? bboxDistance(a.bbox, bbox) - bboxDistance(b.bbox, bbox)
              : a.asset_id.localeCompare(b.asset_id),
          )
          .slice(0, 2)
          .map((asset) => assetRef(paperId, asset));
        const occurrenceIndex = occurrences.length;
        occurrences.push({
          id: `${paperId}:concept-${conceptId(concept)}:${occurrenceIndex}`,
          page: pageIndex,
          passage,
          evidence: {
            paperId,
            page: pageIndex,
            kind: "passage",
            text: passage.text,
            passageId: passage.id,
            ...(bbox ? { bbox } : {}),
            ...(section ? { sectionId: section.sectionId } : {}),
          },
          nearbyAssets,
        });
      }
    });
  }

  const groups: ConceptThreadGroup[] = [];
  for (const occurrence of occurrences) {
    const section = sectionAtPage(sections, occurrence.page);
    const key = section?.sectionId ?? "unsectioned";
    const existing = groups.find((group) => (group.section?.sectionId ?? "unsectioned") === key);
    if (existing) existing.occurrences.push(occurrence);
    else groups.push({ ...(section ? { section } : {}), occurrences: [occurrence] });
  }

  const id = conceptId(concept);
  return {
    id: `${paperId}:thread-${id}`,
    paperId,
    concept: { conceptId: id, paperId, label: concept.trim() },
    occurrences,
    groups,
  };
}
