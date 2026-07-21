# Annotation connectors

`ConnectorLayer` is one fixed, viewport-sized SVG below the cards and above the PDF. It is
decorative (`aria-hidden` and `pointer-events: none`), so it cannot interfere with reading,
selection, or hotspot clicks.

## Geometry model

Cards and mention hotspots expose stable data attributes. `useConnectorGeometry` batches
all DOM reads, chooses the visible mention instance, and then computes a cubic Bézier from
the nearest card edge to the nearest mention rectangle's underline baseline. Wrapped text
can return several rectangles from `getClientRects()`; geometry chooses the line nearest
the card. Connectors under 40 px or overlapping their own card are hidden.

The hook owns a single requestAnimationFrame that runs only after invalidation. Scroll,
resize, card resize, card drag, and virtualized page mount/unmount mark it dirty. Detached
nodes and offscreen mentions simply produce no connector. If the original mention is gone,
the first visible mention for that asset becomes the temporary anchor.

## Stable ink

Rough.js consumes pseudo-random values while producing a stroke. Calling it without a seed
makes the line's jitter change on every scroll or drag frame, which looks like shimmering.
Every connector therefore hashes its stable mention ID with FNV-1a and passes that positive
integer as `options.seed`. Never replace this with a fresh random seed.

Visual constants and the `inked`/`clean` switch live in `styles/connectorStyle.ts`. The
stroke reads `--connector-ink` and falls back to inherited text color, so dark mode does not
need geometry-specific styling.

