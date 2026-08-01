import { describe, expect, it } from "vitest";
import { mentionAnchorId } from "./figure-navigation";

describe("mention anchor ids", () => {
  it("addresses one mention rather than the whole asset", () => {
    expect(mentionAnchorId("fig-2", 4, 3)).toBe("fig-2:p4:m3");
  });

  it("separates two mentions of the same figure on different pages", () => {
    expect(mentionAnchorId("fig-1", 2, 0)).not.toBe(mentionAnchorId("fig-1", 7, 0));
  });
});
