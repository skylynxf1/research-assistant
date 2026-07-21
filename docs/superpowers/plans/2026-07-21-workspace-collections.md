# Workspace Collections Implementation Plan

> Execute this plan test-first on `workspace/collections`. The user has pre-authorized the recommended choices and continuous execution.

**Goal:** Add browser-local research collections with one canonical, versioned IndexedDB store, source-linked notes/evidence, graceful missing-paper handling, and a usable workspace route.

**Architecture:** Pure collection mutations live in `lib/workspace/collections.ts`; persistence is accessed only through `WorkspaceRepository`, implemented by IndexedDB and an in-memory test/demonstration adapter. React owns only route/UI state and never talks directly to IndexedDB. Papers and evidence are stored as stable references, never copied extracted content.

**Tech stack:** Next.js App Router, React 19, TypeScript, IndexedDB, Vitest, `fake-indexeddb` for standards-compatible persistence tests.

---

## Task 1: Collection contract and pure mutations

**Files:**
- Create: `apps/web/lib/workspace/types.ts`
- Create: `apps/web/lib/workspace/collections.ts`
- Test: `apps/web/lib/workspace/collections.test.ts`

1. Write failing tests for creating a versioned collection, deduplicating papers by `paperId`, attaching a source-linked note, renaming without mutating the input, and partitioning cached versus missing paper references without deleting either.
2. Run `npm test -- lib/workspace/collections.test.ts` and confirm module-not-found/failing tests.
3. Define `ResearchCollection`, `WorkspaceNote`, `WorkspaceComparison`, `BoardNode`, and the asynchronous `WorkspaceRepository` interface. All durable evidence fields use `SourceEvidence`; papers use `PaperRef`.
4. Implement small immutable mutations: `createCollection`, `renameCollection`, `addPaperToCollection`, `addNoteToCollection`, and `partitionCollectionPapers`.
5. Re-run the focused tests and commit: `Build the collection domain model`.

## Task 2: IndexedDB repository

**Files:**
- Create: `apps/web/lib/workspace/indexed-db.ts`
- Create: `apps/web/lib/workspace/memory.ts`
- Create: `apps/web/lib/workspace/indexed-db.test.ts`
- Modify: `apps/web/package.json`
- Modify: `apps/web/package-lock.json`

1. Add `fake-indexeddb` as a dev dependency so tests exercise the real IndexedDB API rather than a hand-written mock.
2. Write failing round-trip tests proving collections list newest-first, a pinned `SourceEvidence` object survives exactly, save is an upsert, delete removes only the target, and database failures reject instead of silently falling back to another store.
3. Implement a versioned database with one `collections` object store keyed by `id`, plus `IndexedDbWorkspaceRepository`. Keep `IDBDatabase` lifecycle and request/transaction error conversion internal.
4. Implement `MemoryWorkspaceRepository` against the same interface for deterministic consumers/tests; it is not browser persistence and is never selected as a silent fallback.
5. Run the focused tests and commit: `Persist workspaces in IndexedDB`.

## Task 3: Workspace route and collection UI

**Files:**
- Create: `apps/web/components/workspace/WorkspaceShell.tsx`
- Create: `apps/web/app/workspace/page.tsx`
- Create: `apps/web/app/workspace/[digest]/page.tsx`
- Modify: `apps/web/components/explore/ExploreShell.tsx`
- Create: `apps/web/lib/workspace/view-model.ts`
- Test: `apps/web/lib/workspace/view-model.test.ts`

1. Write failing view-model tests for stable collection ordering, candidate-paper membership, and rendering missing cached papers as unavailable rather than dropping them.
2. Implement the view model, then the client-only workspace shell. It must list/create/rename/delete collections, optionally add the route paper, add source-aware notes, and confirm destructive deletion. Repository construction happens once; initial load happens in an effect.
3. Resolve stored papers with `loadManifest` using `Promise.allSettled`; retained failures appear as “Unavailable locally” with no dead link. Available papers link to `/read/<paperId>` and `/explore/<paperId>`.
4. Add `/workspace` and `/workspace/[digest]` pages using `dynamic(..., { ssr: false })`, because IndexedDB is browser-only. Add a normal Workspace link from the exploration header without touching `Reader.tsx`.
5. Run focused tests, TypeScript, and the full web suite. Commit: `Add the research collections workspace`.

## Task 4: Verification and phase integration

1. Run `npm test`, `npx tsc --noEmit`, and `npm run build` from `apps/web`.
2. Run `uv run pytest` from `apps/api` to catch shared-contract regressions.
3. Start the API and web app, create a collection, add a paper and source-linked note, reload, verify persistence, then delete and verify the missing-paper state has no clickable affordance.
4. Update `HANDOFF_DEV_B.md` with Phase 4 status, decisions, test counts, and Phase 5 next.
5. Push `workspace/collections`, merge it into `main`, rerun the relevant smoke tests on the merge, and push `main`.

