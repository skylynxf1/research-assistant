import type { Citation } from "../citations";
import type { Manifest, Section } from "../manifest";
import { paperIdOf, paperRefOf, sectionIdFor } from "../evidence/source";
import type { Mention, PageTextItem } from "../mentions";
import type {
  AssetRef,
  CitationRef,
  ConceptRef,
  NormalizedBBox,
  PassageRef,
  ResearchContext,
  SectionRef,
  SelectionContext,
  TextItemRange,
} from "./types";

export interface PageContextData {
  items: PageTextItem[];
  mentions: Mention[];
  citations: Citation[];
}

interface BuildContextInput {
  manifest: Manifest;
  selection: SelectionContext;
  pages: PageContextData[];
}

const WINDOW_SIZE = 2;

function unionBBoxes(boxes: NormalizedBBox[]): NormalizedBBox | undefined {
  if (boxes.length === 0) return undefined;
  return boxes.reduce<NormalizedBBox>(
    (result, box) => [
      Math.min(result[0], box[0]),
      Math.min(result[1], box[1]),
      Math.max(result[2], box[2]),
      Math.max(result[3], box[3]),
    ],
    boxes[0],
  );
}

function sectionId(index: number): string {
  return sectionIdFor(index);
}

export function sectionAtPage(sections: Section[], page: number): SectionRef | undefined {
  let matchIndex = -1;
  for (let index = 0; index < sections.length; index += 1) {
    if (sections[index].page <= page) matchIndex = index;
    else break;
  }
  if (matchIndex < 0) return undefined;
  return { sectionId: sectionId(matchIndex), ...sections[matchIndex] };
}

interface IndexedItem {
  item: PageTextItem;
  index: number;
}

interface TextLine {
  items: IndexedItem[];
  bbox: NormalizedBBox;
}

function linesForPage(items: PageTextItem[]): TextLine[] {
  const lines: TextLine[] = [];
  let current: IndexedItem[] = [];

  const flush = () => {
    if (current.length === 0) return;
    const bbox = unionBBoxes(current.map(({ item }) => item.rect));
    if (bbox) lines.push({ items: current, bbox });
    current = [];
  };

  items.forEach((item, index) => {
    current.push({ item, index });
    if (item.hasEOL) flush();
  });
  flush();
  return lines;
}

function lineText(line: TextLine): string {
  return line.items.map(({ item }) => item.str).join("").trim();
}

function joinLines(lines: TextLine[]): string {
  return lines.reduce((text, line) => {
    const next = lineText(line);
    if (!text) return next;
    if (/[-\u2010\u2011]$/.test(text)) return `${text.slice(0, -1)}${next}`;
    return `${text} ${next}`;
  }, "");
}

export function buildPagePassages(
  paperId: string,
  page: number,
  items: PageTextItem[],
  sections: Section[],
): PassageRef[] {
  const lines = linesForPage(items).filter((line) => lineText(line).length > 0);
  if (lines.length === 0) return [];

  const groups: TextLine[][] = [];
  let current: TextLine[] = [];
  for (const line of lines) {
    const previous = current.at(-1);
    const previousHeight = previous ? previous.bbox[3] - previous.bbox[1] : 0;
    const gap = previous ? line.bbox[1] - previous.bbox[3] : 0;
    if (previous && gap > Math.max(0.008, previousHeight * 0.9)) {
      groups.push(current);
      current = [];
    }
    current.push(line);
  }
  if (current.length > 0) groups.push(current);

  const section = sectionAtPage(sections, page);
  return groups.map((group, passageIndex) => {
    const indexedItems = group.flatMap((line) => line.items);
    const itemRanges: TextItemRange[] = indexedItems.map(({ item, index }) => ({
      itemIndex: index,
      startOffset: 0,
      endOffset: item.str.length,
    }));
    const bbox = unionBBoxes(group.map((line) => line.bbox));
    return {
      id: `${paperId}:page-${page}:passage-${passageIndex}`,
      paperId,
      page,
      text: joinLines(group),
      itemRanges,
      ...(bbox ? { bbox } : {}),
      ...(section ? { sectionId: section.sectionId } : {}),
    };
  });
}

function overlapsSelection(passage: PassageRef, selection: SelectionContext): boolean {
  if (passage.page !== selection.page) return false;
  const selectedItems = new Set(selection.itemRanges.map((range) => range.itemIndex));
  return passage.itemRanges.some((range) => selectedItems.has(range.itemIndex));
}

function centerDistance(a: NormalizedBBox, b: NormalizedBBox): number {
  const ax = (a[0] + a[2]) / 2;
  const ay = (a[1] + a[3]) / 2;
  const bx = (b[0] + b[2]) / 2;
  const by = (b[1] + b[3]) / 2;
  return Math.hypot(ax - bx, ay - by);
}

function nearbyEnough(rect: NormalizedBBox | null, selection?: NormalizedBBox): boolean {
  if (!rect || !selection) return true;
  return centerDistance(rect, selection) <= 0.25;
}

function conceptFromSelection(paperId: string, text: string): ConceptRef[] {
  const label = text.replace(/\s+/g, " ").trim();
  if (label.length < 2 || label.length > 120) return [];
  const slug = label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return [{ conceptId: `concept-${slug || "selection"}`, paperId, label }];
}

export function buildResearchContext({
  manifest,
  selection,
  pages,
}: BuildContextInput): ResearchContext {
  const paperId = paperIdOf(manifest);
  const allPassages = pages.flatMap((page, index) =>
    buildPagePassages(paperId, index, page.items, manifest.sections),
  );
  const selectedIndex = allPassages.findIndex((passage) => overlapsSelection(passage, selection));
  const selected = selectedIndex >= 0 ? allPassages[selectedIndex] : undefined;
  const before =
    selectedIndex >= 0
      ? allPassages.slice(Math.max(0, selectedIndex - WINDOW_SIZE), selectedIndex)
      : [];
  const after = selectedIndex >= 0 ? allPassages.slice(selectedIndex + 1, selectedIndex + 3) : [];

  const nearbyAssets: AssetRef[] = manifest.assets
    .filter((asset) => asset.page === selection.page)
    .filter(
      (asset) =>
        !selection.bbox || centerDistance(asset.bbox, selection.bbox) <= 0.4,
    )
    .sort((a, b) => centerDistance(a.bbox, selection.bbox ?? a.bbox) - centerDistance(b.bbox, selection.bbox ?? b.bbox))
    .slice(0, 3)
    .map((asset) => ({
      assetId: asset.asset_id,
      paperId,
      kind: asset.kind,
      label: asset.label,
      page: asset.page,
      bbox: asset.bbox,
      caption: asset.caption,
    }));

  const pageData = pages[selection.page];
  const citations: CitationRef[] = (pageData?.citations ?? [])
    .filter((citation) => nearbyEnough(citation.rect, selection.bbox))
    .map((citation) => ({
      refIds: citation.refIds,
      text: citation.text,
      page: selection.page,
      ...(citation.rect ? { bbox: citation.rect } : {}),
      openable: citation.openable,
    }));
  const mentions = (pageData?.mentions ?? [])
    .filter((mention) => nearbyEnough(mention.rect, selection.bbox))
    .map((mention) => ({
      ...(mention.assetId ? { assetId: mention.assetId } : {}),
      kind: mention.kind,
      number: mention.number,
      text: mention.text,
      page: mention.page,
      ...(mention.rect ? { bbox: mention.rect } : {}),
    }));

  const sourceWindow = { before, ...(selected ? { selected } : {}), after };
  return {
    paper: {
      ...paperRefOf(manifest),
      sourceType: manifest.source.type,
    },
    selection,
    section: sectionAtPage(manifest.sections, selection.page),
    surroundingPassages: [...before, ...(selected ? [selected] : []), ...after],
    concepts: conceptFromSelection(paperId, selection.text),
    nearbyAssets,
    citations,
    mentions,
    sourceWindow,
  };
}
