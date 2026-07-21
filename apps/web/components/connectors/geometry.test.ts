import { describe, expect, it } from "vitest";
import {
  connectorPath,
  resolveConnectorGeometry,
  selectNearestMentionRect,
  stableConnectorSeed,
} from "./geometry";
import { inkedPathData } from "./inkedPath";

const rect = (left: number, top: number, right: number, bottom: number) => ({
  left,
  top,
  right,
  bottom,
  width: right - left,
  height: bottom - top,
});

describe("connector geometry", () => {
  it("selects the wrapped mention rect nearest the card", () => {
    const card = rect(500, 100, 820, 360);
    const lines = [rect(100, 140, 220, 158), rect(100, 164, 175, 182)];

    expect(selectNearestMentionRect(card, lines)).toEqual(lines[0]);
  });

  it("anchors to the nearest card edge and the mention baseline", () => {
    const geometry = resolveConnectorGeometry(
      rect(500, 100, 820, 360),
      [rect(100, 140, 220, 158)],
    );

    expect(geometry).toMatchObject({
      card: { x: 500 },
      mention: { x: 220, y: 158 },
    });
  });

  it("hides a connector when the card overlaps its mention", () => {
    expect(
      resolveConnectorGeometry(rect(100, 100, 300, 280), [rect(115, 130, 180, 148)]),
    ).toBeNull();
  });

  it("clamps short curves and keeps long curves bounded", () => {
    const shortPath = connectorPath({ x: 100, y: 100 }, { x: 145, y: 110 });
    const longPath = connectorPath({ x: 1200, y: 50 }, { x: 50, y: 900 });

    expect(shortPath.controlDistance).toBeLessThanOrEqual(28);
    expect(longPath.controlDistance).toBeLessThanOrEqual(220);
    expect(longPath.d).toMatch(/^M .* C /);
  });
});

describe("stable Rough.js seeding", () => {
  it("derives the same positive seed for a connector across endpoint changes", () => {
    const first = stableConnectorSeed("fig-1:p2:m4");
    const moved = stableConnectorSeed("fig-1:p2:m4");

    expect(first).toBe(moved);
    expect(first).toBeGreaterThan(0);
    expect(stableConnectorSeed("fig-1:p7:m1")).not.toBe(first);
  });

  it("keeps the Rough.js operation pattern stable when endpoints move", () => {
    const first = inkedPathData("fig-1:p2:m4", "M 10 20 C 30 20, 70 80, 90 80");
    const repeated = inkedPathData("fig-1:p2:m4", "M 10 20 C 30 20, 70 80, 90 80");
    const moved = inkedPathData("fig-1:p2:m4", "M 20 25 C 45 25, 90 95, 110 95");

    expect(repeated).toEqual(first);
    expect(moved).toHaveLength(first.length);
    expect(moved.map((path) => path.match(/[A-Z]/g))).toEqual(
      first.map((path) => path.match(/[A-Z]/g)),
    );
  });
});
