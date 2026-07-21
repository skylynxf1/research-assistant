# Semantic Reflow Implementation Plan

**Goal:** Build a deterministic semantic reader view with stable section order, native
headings, linked source objects, citation actions, and an honest original-PDF fallback.

**Architecture:** Retain page text items in `PaperAnalysis`, transform them through a pure
reflow model, and render the model on a client-only route. Geometry confidence gates the
entire semantic body.

---

## Task 1: Geometry-to-document model

**Files:** create `lib/accessibility/reflow.ts` and `reflow.test.ts`; modify
`lib/explore/analysis.ts`.

1. Write failing tests for two-column order, stable manifest section order, semantic heading
   levels, paragraph source pages, linked resolved mentions, and uncertain midpoint geometry.
2. Implement line grouping, column/zonal ordering, paragraph grouping, heading insertion,
   and source-action association without copying or inventing content.
3. Retain `pageItems` from the existing analysis scan. Run focused tests and TypeScript.
4. Commit and push `Build the deterministic reflow model`.

## Task 2: Reflow route and accessible renderer

**Files:** create `components/accessibility/ReflowReader.tsx` and
`app/reflow/[digest]/page.tsx`; modify `components/explore/ExploreShell.tsx`.

1. Render native heading hierarchy and paragraphs with source links. Render only resolved
   asset actions and open only genuinely openable citations through the existing arXiv ingest.
2. Render uncertain documents as a source-PDF fallback, never a partial semantic body.
3. Add an ordinary Reflow link from exploration without modifying `Reader.tsx`.
4. Run full web tests, TypeScript, production build, Python tests, and browser verification.
5. Update the handoff, push the branch, merge to `main`, verify the merge, push `main`, and
   clean the worktree.
