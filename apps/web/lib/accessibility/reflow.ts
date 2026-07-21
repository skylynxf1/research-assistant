import type { Citation } from "../citations";
import { sectionIdFor } from "../evidence/source";
import type { Manifest } from "../manifest";
import type { BBox, Mention, PageTextItem } from "../mentions";

export interface ReflowHeading {
  type: "heading";
  title: string;
  level: number;
  page: number;
  sectionId: string;
}

export interface ReflowCitation {
  text: string;
  refIds: string[];
  openable: boolean;
}

export interface ReflowParagraph {
  type: "paragraph";
  text: string;
  page: number;
  assetIds: string[];
  citations: ReflowCitation[];
}

export type ReflowBlock = ReflowHeading | ReflowParagraph;

export type ReflowDocument =
  | { status: "ready"; blocks: ReflowBlock[] }
  | { status: "uncertain"; reasons: string[] };

interface Line {
  text: string;
  rect: BBox;
  column: "left" | "right" | "spanning";
}

function union(rects: BBox[]): BBox {
  return rects.reduce(
    (box, rect) => [
      Math.min(box[0], rect[0]),
      Math.min(box[1], rect[1]),
      Math.max(box[2], rect[2]),
      Math.max(box[3], rect[3]),
    ],
    rects[0],
  );
}

function joinItems(items: PageTextItem[]): string {
  let text = "";
  for (const item of items) {
    const value = item.str.trim();
    if (!value) continue;
    if (text && !/[-–—‐]$/.test(text) && !/^[,.;:!?)]/.test(value)) text += " ";
    text += value;
  }
  return text.trim();
}

function linesOf(items: PageTextItem[]): Line[] {
  const lines: Line[] = [];
  let pending: PageTextItem[] = [];
  const flush = () => {
    if (pending.length === 0) return;
    const text = joinItems(pending);
    const rect = union(pending.map((item) => item.rect));
    pending = [];
    if (!text) return;
    const width = rect[2] - rect[0];
    const crossesMiddle = rect[0] < 0.5 && rect[2] > 0.5;
    const column = width >= 0.55
      ? "spanning"
      : crossesMiddle
        ? "spanning"
        : (rect[0] + rect[2]) / 2 < 0.5
          ? "left"
          : "right";
    lines.push({ text, rect, column });
  };

  for (const item of items) {
    pending.push(item);
    if (item.hasEOL) flush();
  }
  flush();
  return lines;
}

function orderPage(items: PageTextItem[]): { lines: Line[]; reason?: string } {
  const lines = linesOf(items);
  const ambiguous = lines.find((line) => {
    const width = line.rect[2] - line.rect[0];
    return line.rect[0] < 0.48 && line.rect[2] > 0.52 && width < 0.55;
  });
  if (ambiguous) return { lines: [], reason: `ambiguous midpoint text: ${ambiguous.text}` };

  const spanning = lines
    .filter((line) => line.column === "spanning")
    .sort((a, b) => a.rect[1] - b.rect[1]);
  const zones: Line[][] = Array.from({ length: spanning.length + 1 }, () => []);
  for (const line of lines) {
    if (line.column === "spanning") continue;
    const zone = spanning.filter((anchor) => anchor.rect[1] < line.rect[1]).length;
    zones[zone].push(line);
  }

  const ordered: Line[] = [];
  for (let index = 0; index < zones.length; index += 1) {
    const zone = zones[index];
    const left = zone.filter((line) => line.column === "left").sort((a, b) => a.rect[1] - b.rect[1]);
    const right = zone.filter((line) => line.column === "right").sort((a, b) => a.rect[1] - b.rect[1]);
    ordered.push(...left, ...right);
    if (spanning[index]) ordered.push(spanning[index]);
  }
  return { lines: ordered };
}

function normalizedHeading(text: string): string {
  return text
    .toLowerCase()
    .replace(/^\s*\d+(?:\.\d+)*\.?\s+/, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function actionsFor(
  text: string,
  mentions: readonly Mention[],
  citations: readonly Citation[],
): Pick<ReflowParagraph, "assetIds" | "citations"> {
  const lower = text.toLowerCase();
  const assetIds = [
    ...new Set(
      mentions
        .filter((mention) => mention.assetId && lower.includes(mention.text.toLowerCase()))
        .map((mention) => mention.assetId as string),
    ),
  ];
  const linkedCitations = citations
    .filter((citation) => lower.includes(citation.text.toLowerCase()))
    .map(({ text: surface, refIds, openable }) => ({ text: surface, refIds, openable }));
  return { assetIds, citations: linkedCitations };
}

function canJoin(previous: Line, current: Line): boolean {
  if (previous.column !== current.column || previous.column === "spanning") return false;
  const height = Math.max(previous.rect[3] - previous.rect[1], current.rect[3] - current.rect[1]);
  const gap = current.rect[1] - previous.rect[3];
  return gap >= -height * 0.5 && gap <= height * 1.25 && Math.abs(previous.rect[0] - current.rect[0]) < 0.04;
}

export function buildReflowDocument(
  manifest: Manifest,
  pageItems: readonly PageTextItem[][],
  mentionsByPage: readonly Mention[][],
  citationsByPage: readonly Citation[][],
): ReflowDocument {
  const blocks: ReflowBlock[] = [];
  const emittedSections = new Set<number>();
  const reasons: string[] = [];

  for (let page = 0; page < pageItems.length; page += 1) {
    const ordered = orderPage(pageItems[page]);
    if (ordered.reason) {
      reasons.push(`page ${page + 1}: ${ordered.reason}`);
      continue;
    }

    let paragraphLines: Line[] = [];
    const flushParagraph = () => {
      if (paragraphLines.length === 0) return;
      const text = paragraphLines.map((line) => line.text).join(" ");
      blocks.push({
        type: "paragraph",
        text,
        page,
        ...actionsFor(text, mentionsByPage[page] ?? [], citationsByPage[page] ?? []),
      });
      paragraphLines = [];
    };

    for (const line of ordered.lines) {
      const sectionIndex = manifest.sections.findIndex(
        (section, index) =>
          !emittedSections.has(index) &&
          section.page === page &&
          normalizedHeading(section.title) === normalizedHeading(line.text),
      );
      if (sectionIndex >= 0) {
        flushParagraph();
        const section = manifest.sections[sectionIndex];
        emittedSections.add(sectionIndex);
        blocks.push({
          type: "heading",
          title: section.title,
          level: Math.min(6, Math.max(2, section.level + 1)),
          page,
          sectionId: sectionIdFor(sectionIndex),
        });
        continue;
      }

      const previous = paragraphLines.at(-1);
      if (previous && !canJoin(previous, line)) flushParagraph();
      paragraphLines.push(line);
    }
    flushParagraph();

    manifest.sections.forEach((section, index) => {
      if (section.page !== page || emittedSections.has(index)) return;
      emittedSections.add(index);
      blocks.push({
        type: "heading",
        title: section.title,
        level: Math.min(6, Math.max(2, section.level + 1)),
        page,
        sectionId: sectionIdFor(index),
      });
    });
  }

  return reasons.length > 0 ? { status: "uncertain", reasons } : { status: "ready", blocks };
}
