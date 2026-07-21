# Workspace Collections Design

## Goal

Provide one canonical, browser-local workspace store and a usable collections surface for
grouping cached papers, evidence references, notes, comparisons, and future pinboard state.

## Decision

Use versioned IndexedDB behind a `WorkspaceRepository` interface. This follows the approved
Developer B handoff decision, avoids shared changes to `apps/api/main.py`, and supports
structured state without scattering it across localStorage and filesystem JSON. A small
in-memory implementation supports deterministic unit tests and non-browser consumers; the
browser UI uses only IndexedDB.

The rejected alternatives are filesystem JSON, which would create shared API conflicts and
browser round trips, and localStorage, which has weak transaction and structured-query
semantics for the later pinboard and comparison phases.

## Canonical model

`ResearchCollection` is versioned and stores:

- stable id, name, created/updated timestamps;
- `PaperRef[]` keyed by content hash;
- `SourceEvidence[]` pins, never detached source copies;
- source-aware notes;
- comparison drafts containing evidence references;
- board nodes containing source references and coordinates.

The model reserves only fields already required by sections B8–B10. It does not add learning
progress because that is Developer A state and no shared progress contract exists yet.

`WorkspaceRepository` exposes list, get, save, and delete operations. Callers replace a
whole collection atomically; UI components never call IndexedDB directly. Collection and
paper insertion functions are pure and deduplicate by stable ids.

## Missing-paper behavior

A collection preserves a `PaperRef` when its cached manifest is deleted. Resolution returns
available and missing groups. The UI labels missing papers “Unavailable locally” and renders
no open link. It never silently removes user organization because the paper can be ingested
again under the same content hash only if the bytes are identical.

## User interface

`/workspace` lists collections and supports create, rename, note creation, and deletion.
`/workspace/<digest>` additionally loads the current cached paper and offers “Add this
paper” on every collection. Explore receives one ordinary Workspace link to this route; the
existing reader remains untouched.

Collection cards show paper availability, pinned-evidence count, comparison count, board
count, notes, and explicit empty states. Destructive collection deletion uses a confirmation
step. All controls are native keyboard-accessible elements with visible focus treatment.

## Data flow

The UI creates one repository instance after mount, loads collections, and independently
resolves stored paper ids through the existing manifest API. Mutations are written first and
then reflected in component state from the saved result. Failed writes or manifest checks
produce local inline status; transient failures are never cached by the repository.

## Testing

Tests cover:

- a pinned `SourceEvidence` surviving a real IndexedDB round trip;
- collection list ordering and atomic replacement;
- paper deduplication by content hash;
- missing papers partitioned without throwing or being removed;
- deletion removing only the targeted collection;
- pure note and collection mutation behavior.

The phase gate is all web tests, TypeScript, production build, Python regression tests, and a
live browser round trip that reloads the page and confirms the collection remains.

## Boundaries

No manifest/schema changes, server persistence, localStorage, LLM calls, `Reader.tsx` edits,
or Developer A imports. Pinboard canvas and comparison UI remain Phase 7, but their persisted
reference fields are defined now so Phase 7 does not introduce a second store.
