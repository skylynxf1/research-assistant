# Semantic Reflow Design

## Purpose

Provide a source-faithful reading view for papers whose pdf.js geometry supports a
deterministic reading order. It reorganizes the paper's existing text; it never summarizes,
rewrites, or fills gaps.

## Chosen approach

The client already owns pdf.js text items and mention/citation detection. Reflow extends
that same analysis pass to retain page items, then derives lines, columns, paragraphs, and
manifest-backed headings in TypeScript. This avoids a second extraction pipeline and keeps
the Python/TypeScript boundary unchanged.

Pages are divided into vertical zones around full-width lines. Within each zone, left-column
lines precede right-column lines; single-column zones stay top-to-bottom. Narrow lines that
cross the midpoint, overlapping column geometry, or implausible ordering mark the document
uncertain. An uncertain document does not render a plausible-looking reflow: it presents a
clear fallback link to the original PDF.

Manifest sections remain authoritative for heading labels and levels. Paragraphs retain
their zero-based source page. Figure/table/algorithm/equation actions resolve only from
existing client mentions with a non-null `assetId`. Citation actions resolve only from
existing client citation matches and openable manifest references. Every heading,
paragraph, asset action, and citation group keeps a jump to `/read/<digest>#page=<page>`.

## UI

`/reflow/<digest>` is a client-only route beside, not inside, `Reader.tsx`. The page uses a
narrow reading measure and strong semantic landmarks. Headings are native `h2`–`h6` nodes;
paragraphs are `p`; source actions are named links/buttons. An Explore-header link is the
entry point until the coordinated reader slot exists.

## Failure behavior

- uncertain ordering: explanation plus original-PDF link, no reflow body;
- unmatched figure mention: plain source text, no dead action;
- unresolved citation: citation text stays visible, no open button;
- missing section match: preserve the manifest heading in manifest order at its source page;
- API/pdf failure: explicit error with a return link.

## Boundaries

No schema changes, server changes, LLM calls, generated prose, `Reader.tsx` edits, or
Developer A imports. Typography controls and read-aloud consume this model in Phase 9.
