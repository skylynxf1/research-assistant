# Pinboard and Comparison Implementation Plan

**Goal:** Persist a source-referenced research board and user-selected evidence comparisons.

## Task 1: Version-2 workspace mutations

Update workspace types and repository normalization; add tests for version-1 migration,
node moves, evidence deduplication, user-only edges, dangling-edge rejection, and saved
comparison drafts. Commit and push the pure/persistence layer.

## Task 2: Pinboard route

Create pinboard view-model tests, `WorkspacePinboard.tsx`, and
`/workspace/collections/[collectionId]/board`. Resolve sources without dropping missing
pointers; support add, move/drag, remove, and explicit node connections; persist every change.

## Task 3: Comparison route

Create evidence-candidate view-model tests, `EvidenceComparison.tsx`, and
`/workspace/collections/[collectionId]/compare`. Require user selection, render source items
side-by-side, save pointer-only drafts, and add board/compare links to collection cards.

Run full web/Python/build gates, update handoff, push, merge, and clean the worktree.
