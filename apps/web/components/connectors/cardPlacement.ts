import type { RectLike } from "./geometry";

const CARD_WIDTH = 320;
const ESTIMATED_CARD_HEIGHT = 300;
/** Keep above geometry's 40px suppression threshold so the leader remains visible. */
const GAP = 56;
const VIEWPORT_MARGIN = 16;
const VERTICAL_LEAD = 40;

export function placeCardNearMention(
  mention: RectLike,
  viewport: { width: number; height: number },
): { x: number; y: number } {
  const fitsRight = mention.right + GAP + CARD_WIDTH <= viewport.width - VIEWPORT_MARGIN;
  const preferredX = fitsRight ? mention.right + GAP : mention.left - GAP - CARD_WIDTH;
  const maxX = Math.max(VIEWPORT_MARGIN, viewport.width - CARD_WIDTH - VIEWPORT_MARGIN);
  const maxY = Math.max(VIEWPORT_MARGIN, viewport.height - ESTIMATED_CARD_HEIGHT - VIEWPORT_MARGIN);

  return {
    x: Math.min(maxX, Math.max(VIEWPORT_MARGIN, preferredX)),
    y: Math.min(maxY, Math.max(VIEWPORT_MARGIN, mention.top - VERTICAL_LEAD)),
  };
}

export function placementForPromotion(
  card: { hard: boolean; x: number; y: number },
  nextHard: boolean,
  mentionPlacement: { x: number; y: number } | null,
): { x: number; y: number } {
  return !card.hard && nextHard && mentionPlacement
    ? mentionPlacement
    : { x: card.x, y: card.y };
}
