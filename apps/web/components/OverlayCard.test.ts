import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import OverlayCard, {
  clampPopupPosition,
  isMentionActive,
  placePopup,
  shouldCloseCompactOutline,
  shouldOpenPopup,
  transitionPopup,
  type PopupState,
} from "./OverlayCard";
import type { Asset } from "../lib/manifest";

const asset: Asset = {
  asset_id: "fig-1",
  kind: "figure",
  label: "Figure 1",
  number: "1",
  page: 2,
  bbox: [0.1, 0.1, 0.9, 0.8],
  caption: "The original paper figure caption.",
  caption_bbox: [0.1, 0.8, 0.9, 0.9],
  image_url: "/crops/fig-1.png",
  image_width: 1200,
  parent_id: null,
};

const popup: PopupState = {
  assetId: "fig-1",
  mode: "open",
  position: { x: 180, y: 220 },
  anchorMentionId: "fig-1:p0:m0",
  z: 3,
};

describe("isMentionActive", () => {
  it("activates mentions only within the 10% to 82% reading zone", () => {
    expect(isMentionActive({ top: 200 }, 1000)).toBe(true);
    expect(isMentionActive({ top: 50 }, 1000)).toBe(false);
    expect(isMentionActive({ top: 900 }, 1000)).toBe(false);
  });

  it("measures the reading zone from a non-zero scroll-root offset", () => {
    expect(isMentionActive({ top: 250 }, 1000, 200)).toBe(false);
    expect(isMentionActive({ top: 400 }, 1000, 200)).toBe(true);
    expect(isMentionActive({ top: 1050 }, 1000, 200)).toBe(false);
  });
});

describe("shouldCloseCompactOutline", () => {
  it("closes below 1100px but stays open at the breakpoint", () => {
    expect(shouldCloseCompactOutline(1099)).toBe(true);
    expect(shouldCloseCompactOutline(1100)).toBe(false);
  });
});

describe("shouldOpenPopup", () => {
  it("does not reopen docked or re-raise visible popups during ambient activation", () => {
    expect(shouldOpenPopup({ ...popup, mode: "docked" }, false)).toBe(false);
    expect(shouldOpenPopup({ ...popup, mode: "open" }, false)).toBe(false);
    expect(shouldOpenPopup({ ...popup, mode: "pinned" }, false)).toBe(false);
    expect(shouldOpenPopup({ ...popup, mode: "idle" }, false)).toBe(true);
    expect(shouldOpenPopup({ ...popup, mode: "docked" }, true)).toBe(true);
    expect(shouldOpenPopup(undefined, false)).toBe(true);
  });
});

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

describe("OverlayCard", () => {
  it("clamps a drag position to the viewport edge inset", () => {
    expect(clampPopupPosition(
      { x: -20, y: 900 },
      { width: 390, height: 336 },
      { width: 900, height: 700 },
    )).toEqual({ x: 8, y: 356 });
  });

  it("renders a fixed glass popup with opaque crop and source navigation", () => {
    const markup = renderToStaticMarkup(createElement(OverlayCard, {
      asset,
      popup,
      mentions: [{ assetId: "fig-1", kind: "figure", number: "1", page: 4, text: "Figure 1", rect: null, index: 0 }],
      currentPage: 2,
      onMove: vi.fn(),
      onPin: vi.fn(),
      onDock: vi.fn(),
      onRaise: vi.fn(),
      onJumpToAsset: vi.fn(),
      onJumpToMention: vi.fn(),
    }));

    expect(markup).toContain('data-popup-asset="fig-1"');
    expect(markup).toContain("fixed overflow-hidden rounded-[20px]");
    expect(markup).toContain("rounded-[12px] bg-white");
    expect(markup).toContain("Auto · fades on scroll");
    expect(markup).toContain("Jump to Figure 1");
    expect(markup).toContain("p.5");
  });
});
