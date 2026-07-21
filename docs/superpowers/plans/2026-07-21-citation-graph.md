# Citation Graph and Provider Implementation Plan

**Goal:** Add a lazy one-hop citation network, literal citation trails, and the shared
cross-paper context contract.

## Task 1: Literal graph and trails

Create `lib/explore/citation-graph.ts` and tests. Prove that only observed, openable resolved
references create edges; contexts retain pages; node sizes are not data; and expansion adds
one loaded paper’s outgoing hop without duplication. Implement on `ResearchGraph`.

## Task 2: Cross-paper provider

Create `lib/explore/cross-paper-provider.ts` and tests. Implement `getPaper`,
`getConnectedPapers`, `getCollectionPapers`, and bounded `findEvidence` over loaded analyses
and collection records, returning source references only.

## Task 3: Lazy graph UI

Create `components/explore/CitationGraph.tsx`; add the tab to `ExploreShell`. Render fixed-size
nodes and solid literal edges, load cited papers only on explicit action, and show source-linked
trail occurrences. Run all web/Python/build gates, update the handoff, push, merge, and clean.
