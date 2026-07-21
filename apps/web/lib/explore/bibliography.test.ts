import { describe, expect, it } from "vitest";
import type { PageTextItem } from "../mentions";
import { citationBodyItems } from "./bibliography";

const item = (str: string): PageTextItem => ({
  str,
  hasEOL: true,
  rect: [0.1, 0.1, 0.9, 0.2],
});

describe("bibliography boundary", () => {
  it("keeps body text before a References heading on the same page", () => {
    const scan = citationBodyItems(
      [item("Conclusion text [3]."), item("References"), item("[1] Bibliography entry")],
      false,
    );

    expect(scan.items.map(({ str }) => str)).toEqual(["Conclusion text [3]."]);
    expect(scan.bibliographyStarted).toBe(true);
  });

  it("drops all text on pages after the bibliography starts", () => {
    const scan = citationBodyItems([item("[5] Another bibliography entry")], true);
    expect(scan.items).toEqual([]);
    expect(scan.bibliographyStarted).toBe(true);
  });

  it("does not mistake an ordinary sentence mentioning references for a heading", () => {
    const items = [item("See references in the appendix [2].")];
    const scan = citationBodyItems(items, false);
    expect(scan.items).toEqual(items);
    expect(scan.bibliographyStarted).toBe(false);
  });

  it("recognizes Bibliography as the alternate heading", () => {
    const scan = citationBodyItems([item("Bibliography"), item("Smith, 2020")], false);
    expect(scan.items).toEqual([]);
    expect(scan.bibliographyStarted).toBe(true);
  });
});
