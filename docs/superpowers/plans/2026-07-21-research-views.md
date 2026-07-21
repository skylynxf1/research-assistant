# Research Views Implementation Plan

**Goal:** Complete deterministic macro research views and collection-scoped discovery.

## Task 1: Shared research view models

Create `lib/explore/research-views.ts` and tests for selected lineage, literal/generated edge
distinction, stable chronology with unknown dates, original figure timeline entries, and
fixed-size constellation nodes built from `ResearchGraph`.

## Task 2: Collection lexical index

Create `lib/explore/collection-index.ts` and tests covering all six specified fields,
case-insensitive bounded queries, source provenance, benchmark constraints, and missing-paper
omission without mutation.

## Task 3: Unified collection research route

Create `components/workspace/CollectionResearch.tsx` and
`/workspace/collections/[collectionId]/research`; add a collection-card link. Load only
collection papers, render five accessible views, retain unavailable refs, and link every
result/asset to source.

Run full web/Python/build gates, update handoff, push, merge, and clean.
