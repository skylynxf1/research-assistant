export interface Point {
  x: number;
  y: number;
}

export interface RectLike {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

export interface ConnectorGeometry {
  card: Point;
  mention: Point;
}

const MIN_CONNECTOR_DISTANCE = 40;
const MIN_CONTROL_DISTANCE = 18;
const MAX_CONTROL_DISTANCE = 220;

function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function nearestPointOnCard(card: RectLike, target: Point): Point {
  const candidates = [
    { x: card.left, y: Math.min(card.bottom, Math.max(card.top, target.y)) },
    { x: card.right, y: Math.min(card.bottom, Math.max(card.top, target.y)) },
    { x: Math.min(card.right, Math.max(card.left, target.x)), y: card.top },
    { x: Math.min(card.right, Math.max(card.left, target.x)), y: card.bottom },
  ];
  return candidates.reduce((nearest, candidate) =>
    distance(candidate, target) < distance(nearest, target) ? candidate : nearest,
  );
}

export function selectNearestMentionRect(
  card: RectLike,
  mentionRects: RectLike[],
): RectLike | null {
  if (mentionRects.length === 0) return null;
  const cardCenter = { x: card.left + card.width / 2, y: card.top + card.height / 2 };
  return mentionRects.reduce((nearest, candidate) => {
    const nearestPoint = { x: nearest.left + nearest.width / 2, y: nearest.bottom };
    const candidatePoint = { x: candidate.left + candidate.width / 2, y: candidate.bottom };
    return distance(candidatePoint, cardCenter) < distance(nearestPoint, cardCenter)
      ? candidate
      : nearest;
  });
}

export function resolveConnectorGeometry(
  cardRect: RectLike,
  mentionRects: RectLike[],
): ConnectorGeometry | null {
  const mentionRect = selectNearestMentionRect(cardRect, mentionRects);
  if (!mentionRect) return null;
  if (
    cardRect.left < mentionRect.right &&
    cardRect.right > mentionRect.left &&
    cardRect.top < mentionRect.bottom &&
    cardRect.bottom > mentionRect.top
  ) {
    return null;
  }

  const cardCenter = {
    x: cardRect.left + cardRect.width / 2,
    y: cardRect.top + cardRect.height / 2,
  };
  const mention = {
    x: cardCenter.x < mentionRect.left ? mentionRect.left : mentionRect.right,
    y: mentionRect.bottom,
  };
  const card = nearestPointOnCard(cardRect, mention);
  if (distance(card, mention) < MIN_CONNECTOR_DISTANCE) return null;
  return { card, mention };
}

export function connectorPath(start: Point, end: Point): { d: string; controlDistance: number } {
  const span = distance(start, end);
  const controlDistance = Math.min(
    MAX_CONTROL_DISTANCE,
    Math.max(MIN_CONTROL_DISTANCE, span * 0.34),
    span < 90 ? 28 : Number.POSITIVE_INFINITY,
  );
  const direction = end.x >= start.x ? 1 : -1;
  const c1 = { x: start.x + direction * controlDistance, y: start.y };
  const c2 = { x: end.x - direction * controlDistance, y: end.y };
  return {
    d: `M ${start.x} ${start.y} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${end.x} ${end.y}`,
    controlDistance,
  };
}

/** FNV-1a, reduced to Rough.js's positive 31-bit seed range. */
export function stableConnectorSeed(id: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < id.length; index += 1) {
    hash ^= id.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0) % 0x7ffffffe + 1;
}
