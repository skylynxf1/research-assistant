# Paper Map Design

## Goal

Add a deterministic structural view of one paper at `/explore/<digest>`. The view exposes
the paper's section hierarchy, assets, and citations without generating or inferring
content.

## User experience

`ExploreShell` gains a `Paper Map` tab beside `Figures`. The map renders a collapsible,
keyboard-accessible outline rooted at the paper title. Manifest headings retain their
hierarchy through `section.level`.

Each section shows:

- assets assigned to it by source page;
- distinct citations whose markers occur on its pages;
- source page links carrying the existing future-compatible `#page=` fragment;
- counts that help readers scan without replacing the source text.

An asset before the first detected heading is placed under `Unsectioned`. Citation markers
before the first heading follow the same rule. Empty sections remain visible because they
are real paper structure. Resolved references may open the cited paper through the existing
reader route; unresolved references remain plain text with no dead affordance.

## Architecture

`apps/web/lib/explore/paper-map.ts` is a pure model builder. It consumes the manifest, the
existing per-page mention index, and a new per-page citation index. It reuses
`sectionForPage` for page-to-section assignment and builds heading nesting with a stack over
manifest order. It never mutates the manifest and never invents a node.

`apps/web/lib/explore/analysis.ts` extends the cached analysis pass to run the existing
`findCitations` detector over the same pdf.js text items already loaded for mentions. This
adds no server round trip and preserves the TypeScript ownership boundary.

`apps/web/components/explore/PaperMap.tsx` renders the model with semantic headings,
`<details>` disclosure controls, lists, and ordinary links. It contains no extraction or
assignment logic. `ExploreShell.tsx` adds the tab and selects this component without
touching `Reader.tsx`.

## Data and failure behavior

Section identity remains manifest-order based (`sec-0`, `sec-1`, ...). Assets point to real
manifest assets. Citation nodes point to real manifest references and are deduplicated
within each section while retaining document order.

If the outline is absent, the map shows one `Unsectioned` group for page-bound assets and
citations. If no structural content exists, it displays an honest empty state. Missing
crops do not matter because the Paper Map links to source objects rather than rendering
images. Unresolved citations render as text only.

## Testing

Pure model tests cover:

- stable nested section hierarchy from heading levels;
- assignment via the last section beginning at or before the source page;
- honest `Unsectioned` handling;
- section-local, deduplicated citation placement;
- preservation of real manifest assets and references;
- unresolved references remaining non-openable;
- stable behavior with no sections or no structural content.

The phase gate is the full web test suite, TypeScript typecheck, Python regression suite,
and a production web build. The existing reader manual regression remains required before
merge when the local servers and fixture PDF are available.

## Scope boundaries

No schema changes, dependencies, LLM calls, server-side mentions, extraction changes, or
`Reader.tsx` edits. Citation graphs, collections, persistence, reflow, and reader fragment
handling remain later phases.
