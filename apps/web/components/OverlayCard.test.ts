import { describe, expect, it } from "vitest";
import { placePopup, transitionPopup, type PopupState } from "./OverlayCard";

describe("placePopup", () => {
  it("returns the same position for identical geometry", () => {
    const input = {
      popup: { width: 390, height: 336 },
      anchor: { left: 700, top: 420, right: 748, bottom: 438 },
      viewport: { width: 1512, height: 960 },
      occupied: [],
    };
    expect(placePopup(input)).toEqual(placePopup(input));
  });

  it("chooses a non-overlapping slot nearest the anchor", () => {
    const position = placePopup({
      popup: { width: 390, height: 336 },
      anchor: { left: 700, top: 420, right: 748, bottom: 438 },
      viewport: { width: 1512, height: 960 },
      occupied: [{ x: 1086, y: 350, width: 390, height: 336 }],
    });
    expect(position).not.toEqual({ x: 1086, y: 350 });
    expect(position.x).toBeGreaterThanOrEqual(8);
    expect(position.y).toBeGreaterThanOrEqual(84);
  });

  it("clamps placement inside the viewport", () => {
    const position = placePopup({
      popup: { width: 390, height: 336 },
      anchor: { left: 20, top: 900, right: 60, bottom: 918 },
      viewport: { width: 900, height: 700 },
      occupied: [],
    });
    expect(position.x).toBeGreaterThanOrEqual(8);
    expect(position.y + 336).toBeLessThanOrEqual(700 - 24);
  });
});

describe("transitionPopup", () => {
  const popup: PopupState = {
    assetId: "fig-1",
    mode: "open",
    position: { x: 100, y: 120 },
    anchorMentionId: "fig-1:p0:m0",
    z: 1,
  };

  it("pins on click or drag", () => {
    expect(transitionPopup(popup, { type: "pin" }).mode).toBe("pinned");
    expect(transitionPopup(popup, { type: "drag", position: { x: 180, y: 160 } }).mode).toBe("pinned");
  });

  it("moves minimized popups into the dock", () => {
    expect(transitionPopup(popup, { type: "dock" }).mode).toBe("docked");
  });
});
