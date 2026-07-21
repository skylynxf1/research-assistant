/**
 * Client-side mention detection.
 *
 * This is the TypeScript half of the language boundary (plan deviation 1): the client
 * owns mentions, hotspots and the reverse index, while Python owns figure regions,
 * crops, captions and references. The manifest deliberately has no mentions[] array.
 *
 * The work happens in three steps:
 *
 *   1. Flatten pdf.js text items into one page string, remembering which item every
 *      character came from. pdf.js splits text at arbitrary boundaries - a single word
 *      can span several items - so matching item by item would miss most mentions.
 *   2. Normalize that string (ligatures, dashes, hyphenated line breaks) while keeping
 *      an index back to the raw string, so a match can still be located on the page.
 *   3. Match, expand ranges, resolve to assets, and drop caption self-references.
 */

export type BBox = [number, number, number, number];

/** The pdf.js data this module needs, narrowed to keep it testable. */
export interface PageTextItem {
  str: string;
  hasEOL: boolean;
  /** Normalized, top-left origin, matching the manifest's convention. */
  rect: BBox;
}

export interface MentionAsset {
  asset_id: string;
  kind: string;
  number: string;
  page: number;
  caption_bbox: BBox | null;
}

export interface Mention {
  /** null when the paper cites something we did not extract. Never render a hotspot. */
  assetId: string | null;
  kind: string;
  number: string;
  page: number;
  /** The surface form exactly as it appears, e.g. "Fig. 2". */
  text: string;
  rect: BBox | null;
  /** Order of appearance within the page, for keyboard navigation. */
  index: number;
}

const KIND_BY_PREFIX: Record<string, string> = {
  fig: "figure",
  tab: "table",
  alg: "algorithm",
  eq: "equation",
};

/**
 * A kind word, then a number, optionally continuing as a range or list.
 *
 * The plural ("Figures") is allowed here, unlike in caption parsing, because a plural is
 * exactly what introduces a range: "Figures 2-4".
 */
const MENTION_RE = new RegExp(
  String.raw`\b(?<kind>Fig(?:ure)?s?|Tab(?:le)?s?|Alg(?:orithm)?s?|Eq(?:uation|n)?s?)(?<sep>\.?\s*)` +
    String.raw`(?<numbers>(?:S\d+|A\.\d+|\d+[a-z]?)(?:\s*(?:[-–—]|,|and|&)\s*(?:S\d+|A\.\d+|\d+[a-z]?))*)`,
  "gi",
);

/** A range wider than this is a typo or a page range, not a list of figures. */
const MAX_RANGE_SPAN = 12;

/** A horizontal gap wider than this fraction of the font size is a word space. */
const SPACE_GAP_RATIO = 0.25;

/** Spelled-out kind words. "Fig." is an abbreviation; "figure." ends a sentence. */
const FULL_KIND_RE = /^(?:figures?|tables?|algorithms?|equations?)$/i;

const LIGATURES: Record<string, string> = {
  "ﬀ": "ff",
  "ﬁ": "fi",
  "ﬂ": "fl",
  "ﬃ": "ffi",
  "ﬄ": "ffl",
  "ﬅ": "st",
  "ﬆ": "st",
};

export interface FlatPage {
  /** Normalized text the regex runs over. */
  text: string;
  /** For each character of `text`, the index of the item it came from. */
  owners: number[];
}

/**
 * Flatten items into a normalized string plus a character-to-item map.
 *
 * Normalization happens in the same pass as flattening so the map stays exact: folding a
 * ligature turns one character into two, and joining a hyphenated line break removes
 * two, either of which would desynchronize a map built afterwards.
 */
export function flattenPage(items: PageTextItem[]): FlatPage {
  let text = "";
  const owners: number[] = [];

  const push = (chunk: string, itemIndex: number) => {
    for (const char of chunk) {
      text += char;
      owners.push(itemIndex);
    }
  };

  items.forEach((item, itemIndex) => {
    for (const char of item.str) {
      const folded = LIGATURES[char];
      if (folded !== undefined) {
        push(folded, itemIndex);
      } else if (char === "–" || char === "—" || char === "‐") {
        // Keep dashes distinct from spaces: "Figures 2–4" is a range.
        push(char, itemIndex);
      } else {
        push(char, itemIndex);
      }
    }
    if (item.hasEOL) {
      push("\n", itemIndex);
      return;
    }
    // pdf.js often emits adjacent runs with no space character between them, leaving the
    // word boundary implied by geometry alone. Without this, a whole line flattens to
    // "asshowninFigure1" and nothing matches. Threshold from spec section 6 stage 5.
    const next = items[itemIndex + 1];
    if (next && !/\s$/.test(item.str) && !/^\s/.test(next.str)) {
      const gap = next.rect[0] - item.rect[2];
      const fontSize = item.rect[3] - item.rect[1];
      if (gap > fontSize * SPACE_GAP_RATIO) {
        push(" ", itemIndex);
      }
    }
  });

  // Rejoin words broken across a line break ("Fig-\nure 3"), keeping the map aligned by
  // rebuilding rather than splicing.
  let joined = "";
  const joinedOwners: number[] = [];
  for (let i = 0; i < text.length; i += 1) {
    const isHyphen = /[-‐‑–]/.test(text[i]);
    if (isHyphen) {
      // Look ahead past whitespace for a lowercase continuation.
      let j = i + 1;
      while (j < text.length && /\s/.test(text[j])) j += 1;
      const crossedLine = /\n/.test(text.slice(i + 1, j));
      if (crossedLine && j < text.length && /[a-z]/.test(text[j])) {
        i = j - 1; // drop the hyphen and the whitespace
        continue;
      }
    }
    joined += text[i];
    joinedOwners.push(owners[i]);
  }

  return { text: joined, owners: joinedOwners };
}

function kindFromWord(word: string): string {
  const lower = word.toLowerCase().replace(/[.s]+$/, "");
  const prefix = lower.slice(0, 3);
  return KIND_BY_PREFIX[prefix] ?? "figure";
}

/** Expand "2-4" to ["2","3","4"], and "1, 2 and 3" to ["1","2","3"]. */
function expandNumbers(raw: string): string[] {
  const tokens = raw.split(/\s*(?:,|and|&)\s*/i).filter(Boolean);
  const numbers: string[] = [];

  for (const token of tokens) {
    const range = token.match(/^(\d+)\s*[-–—]\s*(\d+)$/);
    if (range) {
      const from = Number(range[1]);
      const to = Number(range[2]);
      if (to < from || to - from > MAX_RANGE_SPAN) {
        return []; // implausible: a typo or a page range, so claim nothing
      }
      for (let n = from; n <= to; n += 1) numbers.push(String(n));
    } else {
      numbers.push(token.trim());
    }
  }
  return numbers;
}

/** The bounding box of the characters in [start, end), for drawing a hotspot. */
export function rectForRange(
  items: PageTextItem[],
  owners: number[],
  start: number,
  end: number,
): BBox | null {
  const touched = [...new Set(owners.slice(start, end))];

  const rects = touched
    .map((itemIndex) => {
      const rect = items[itemIndex]?.rect;
      if (!rect) return null;

      // pdf.js frequently emits an entire line as one item, so using its rect verbatim
      // would underline the whole line. Interpolate across the item by character
      // position instead. Proportional fonts make this approximate, but a slightly
      // imprecise underline is far better than one covering half a paragraph.
      const first = owners.indexOf(itemIndex);
      const last = owners.lastIndexOf(itemIndex);
      const length = last - first + 1;
      if (length <= 0) return rect;

      const from = (Math.max(start, first) - first) / length;
      const to = (Math.min(end, last + 1) - first) / length;
      const width = rect[2] - rect[0];
      return [rect[0] + width * from, rect[1], rect[0] + width * to, rect[3]] as BBox;
    })
    .filter(Boolean) as BBox[];

  return unionRects(rects);
}

function unionRects(rects: BBox[]): BBox | null {
  if (rects.length === 0) return null;
  return rects.reduce(
    (acc, r) => [
      Math.min(acc[0], r[0]),
      Math.min(acc[1], r[1]),
      Math.max(acc[2], r[2]),
      Math.max(acc[3], r[3]),
    ],
    rects[0],
  );
}

function intersects(a: BBox, b: BBox): boolean {
  return a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1];
}

/**
 * Resolve (kind, number) to an asset id.
 *
 * Appendix figures can restart numbering, so this key is not unique. When it collides,
 * take the asset nearest the citing page, which is what a reader means.
 */
function resolveAsset(
  kind: string,
  numberText: string,
  page: number,
  assets: MentionAsset[],
): string | null {
  const candidates = assets.filter(
    (a) => a.kind === kind && a.number.toLowerCase() === numberText.toLowerCase(),
  );
  if (candidates.length === 0) return null;

  return candidates.reduce((best, current) =>
    Math.abs(current.page - page) < Math.abs(best.page - page) ? current : best,
  ).asset_id;
}

export function findMentions(
  items: PageTextItem[],
  options: { page: number; assets: MentionAsset[] },
): Mention[] {
  const { page, assets } = options;
  const { text, owners } = flattenPage(items);
  const captions = assets
    .filter((a) => a.page === page && a.caption_bbox !== null)
    .map((a) => a.caption_bbox as BBox);

  const mentions: Mention[] = [];
  let index = 0;

  for (const match of text.matchAll(MENTION_RE)) {
    const start = match.index ?? 0;
    const end = start + match[0].length;
    const kindWord = match.groups?.kind ?? "";
    // "Fig. 2" is an abbreviation. "...the figure. 1 Introduction" is a sentence ending
    // before a section number, and matching it would open a figure from a heading.
    if (FULL_KIND_RE.test(kindWord) && (match.groups?.sep ?? "").includes(".")) continue;

    const kind = kindFromWord(kindWord);
    const numbers = expandNumbers(match.groups?.numbers ?? "");
    if (numbers.length === 0) continue;

    const rect = rectForRange(items, owners, start, end);

    // A caption is not a mention of itself. Without this every figure gains a spurious
    // self-mention and the reverse index is wrong on every paper.
    if (rect && captions.some((caption) => intersects(rect, caption))) continue;

    for (const number of numbers) {
      mentions.push({
        assetId: resolveAsset(kind, number, page, assets),
        kind,
        number,
        page,
        text: match[0].trim(),
        rect,
        index: index++,
      });
    }
  }

  return mentions;
}

/**
 * Group mentions by asset, in reading order.
 *
 * Spec section 8 calls this a headline feature rather than a detail: it is what makes a
 * figure legible when it is discussed in three separate places. Unmatched mentions are
 * omitted because they have nothing to link to.
 */
export function buildReverseIndex(mentions: Mention[]): Map<string, Mention[]> {
  const index = new Map<string, Mention[]>();

  for (const mention of mentions) {
    if (mention.assetId === null) continue;
    const bucket = index.get(mention.assetId);
    if (bucket) bucket.push(mention);
    else index.set(mention.assetId, [mention]);
  }

  for (const bucket of index.values()) {
    bucket.sort((a, b) => a.page - b.page || (a.rect?.[1] ?? 0) - (b.rect?.[1] ?? 0));
  }
  return index;
}
