import type { PageTextItem } from "../mentions";

export interface CitationBodyScan {
  items: PageTextItem[];
  bibliographyStarted: boolean;
}

const BIBLIOGRAPHY_HEADING = /^(?:references|bibliography)$/i;

/**
 * Exclude reference-list entries from citation detection.
 *
 * A bibliography may start halfway down the conclusion page, so filtering whole pages
 * would also discard real body citations. Keep the prefix before the exact heading and
 * suppress only the remainder of the document.
 */
export function citationBodyItems(
  items: PageTextItem[],
  bibliographyAlreadyStarted: boolean,
): CitationBodyScan {
  if (bibliographyAlreadyStarted) return { items: [], bibliographyStarted: true };

  const headingIndex = items.findIndex((item) => BIBLIOGRAPHY_HEADING.test(item.str.trim()));
  if (headingIndex < 0) return { items, bibliographyStarted: false };

  return { items: items.slice(0, headingIndex), bibliographyStarted: true };
}
