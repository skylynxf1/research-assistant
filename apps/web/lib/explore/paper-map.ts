/**
 * Deterministic structural model for one paper — expansion doc §B2.
 *
 * Every node comes from the manifest or the client-side citation scan. This module owns
 * organization only: it does not infer topics, summarize sections, or duplicate extraction.
 */

import type { Citation } from "../citations";
import { sectionIdFor } from "../evidence/source";
import type { Asset, Manifest, Reference } from "../manifest";
import type { Mention } from "../mentions";
import { sectionForPage } from "./atlas";

export interface PaperMapAsset {
  asset: Asset;
  mentionPages: number[];
}

export interface PaperMapCitation {
  reference: Reference;
  page: number;
  surface: string;
}

export interface PaperMapSection {
  id: string;
  title: string;
  page: number | null;
  level: number;
  assets: PaperMapAsset[];
  citations: PaperMapCitation[];
  children: PaperMapSection[];
}

export interface PaperMapModel {
  title: string;
  sections: PaperMapSection[];
  /** Assets plus distinct section-local citation entries. */
  objectCount: number;
}

const UNSECTIONED_ID = "unsectioned";

/** A navigation affordance exists only when extraction explicitly confirmed both fields. */
export function openableArxivId(reference: Reference): string | null {
  return reference.openable && reference.arxiv_id ? reference.arxiv_id : null;
}

function sectionNode(
  id: string,
  title: string,
  page: number | null,
  level: number,
): PaperMapSection {
  return { id, title, page, level, assets: [], citations: [], children: [] };
}

function distinctMentionPages(assetId: string, mentionsByPage: Mention[][]): number[] {
  const pages = mentionsByPage
    .flat()
    .filter((mention) => mention.assetId === assetId)
    .map((mention) => mention.page);
  return [...new Set(pages)].sort((a, b) => a - b);
}

export function buildPaperMap(
  manifest: Manifest,
  mentionsByPage: Mention[][],
  citationsByPage: Citation[][],
): PaperMapModel {
  const roots: PaperMapSection[] = [];
  const stack: PaperMapSection[] = [];
  const sectionsById = new Map<string, PaperMapSection>();

  manifest.sections.forEach((section, index) => {
    const node = sectionNode(sectionIdFor(index), section.title, section.page, section.level);
    sectionsById.set(node.id, node);

    while (stack.length > 0 && stack[stack.length - 1].level >= node.level) stack.pop();
    const parent = stack[stack.length - 1];
    if (parent) parent.children.push(node);
    else roots.push(node);
    stack.push(node);
  });

  let unsectioned: PaperMapSection | null = null;
  const sectionForObject = (page: number): PaperMapSection => {
    const assigned = sectionForPage(manifest, page);
    const matched = assigned ? sectionsById.get(assigned.sectionId) : undefined;
    if (matched) return matched;

    if (!unsectioned) {
      unsectioned = sectionNode(UNSECTIONED_ID, "Unsectioned", null, 0);
      roots.unshift(unsectioned);
    }
    return unsectioned;
  };

  [...manifest.assets]
    .sort((a, b) => a.page - b.page || a.asset_id.localeCompare(b.asset_id))
    .forEach((asset) => {
      sectionForObject(asset.page).assets.push({
        asset,
        mentionPages: distinctMentionPages(asset.asset_id, mentionsByPage),
      });
    });

  const referencesById = new Map(manifest.references.map((reference) => [reference.ref_id, reference]));
  const seenCitations = new Set<string>();
  let citationCount = 0;

  citationsByPage.forEach((citations, page) => {
    for (const citation of citations) {
      for (const refId of citation.refIds) {
        const reference = referencesById.get(refId);
        if (!reference) continue;

        const section = sectionForObject(page);
        const key = `${section.id}|${refId}`;
        if (seenCitations.has(key)) continue;

        seenCitations.add(key);
        section.citations.push({ reference, page, surface: citation.text });
        citationCount += 1;
      }
    }
  });

  return {
    title: manifest.title,
    sections: roots,
    objectCount: manifest.assets.length + citationCount,
  };
}
