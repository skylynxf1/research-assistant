import { describe, expect, it } from "vitest";
import { placeCardNearMention, placementForPromotion } from "./cardPlacement";

const rect = (left: number, top: number, right: number, bottom: number) => ({
  left,
  top,
  right,
  bottom,
  width: right - left,
  height: bottom - top,
});

describe("card placement", () => {
  it("places a card to the right of a mention when space is available", () => {
    expect(placeCardNearMention(rect(180, 240, 230, 258), { width: 1200, height: 800 })).toEqual({
      x: 286,
      y: 200,
    });
  });

  it("places a card to the left when the mention is near the right edge", () => {
    expect(placeCardNearMention(rect(1050, 300, 1100, 318), { width: 1200, height: 800 })).toEqual({
      x: 674,
      y: 260,
    });
  });

  it("clamps placement inside a small viewport", () => {
    expect(placeCardNearMention(rect(580, 760, 620, 778), { width: 640, height: 800 })).toEqual({
      x: 204,
      y: 484,
    });
  });

  it("repositions an auto-docked card when a mention hard-pins it", () => {
    expect(placementForPromotion({ hard: false, x: 40, y: 110 }, true, { x: 254, y: 200 })).toEqual({
      x: 254,
      y: 200,
    });
  });

  it("preserves the reader's position for an existing hard pin", () => {
    expect(placementForPromotion({ hard: true, x: 75, y: 90 }, true, { x: 254, y: 200 })).toEqual({
      x: 75,
      y: 90,
    });
  });
});
