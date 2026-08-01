/**
 * Stable identity for a single mention of an asset.
 *
 * A figure is referenced from several places, so `assetId` alone cannot address one
 * hotspot. Page plus per-page mention index does, and it stays stable across re-renders
 * because both come from the manifest-derived analysis rather than DOM order.
 *
 * `PdfPageView` stamps this onto each hotspot as `data-mention-id`, and the onboarding
 * tour anchors itself to the paper's first mention by comparing against it. Both sides
 * must build the string the same way, so it lives here rather than being interpolated
 * at each call site.
 */
export function mentionAnchorId(assetId: string, page: number, mentionIndex: number): string {
  return `${assetId}:p${page}:m${mentionIndex}`;
}
