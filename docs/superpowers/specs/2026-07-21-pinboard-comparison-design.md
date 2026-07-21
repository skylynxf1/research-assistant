# Pinboard and Evidence Comparison Design

## Persistence evolution

Collections advance to data version 2 by adding `boardEdges`. The IndexedDB database remains
the one canonical store. Repository reads migrate version-1 objects in memory and save them
as version 2 on the next mutation; no second store or destructive database reset is needed.

## Pinboard

`/workspace/collections/<id>/board` is a bounded large canvas for the local product. Nodes
store an optional `SourceEvidence`, note, and x/y coordinates. Users add evidence pointers,
move nodes with drag or keyboard controls, and connect two existing nodes. Every connection
is explicitly `user-connected`; the feature creates no inferred/generated edges.

Cards render labels by resolving their source pointers from cached manifests. If a source
paper is missing, the pointer remains and the card is marked unavailable with no dead link.

## Comparison

`/workspace/collections/<id>/compare` lists evidence already selected into the collection:
pinned evidence, board-node sources, and source-aware notes. Users choose two or more items
and save a comparison draft containing only those evidence pointers. The comparison surface
places source assets/text side-by-side and always links to source pages. It does not generate
differences, conclusions, or normalized metrics.

## Boundaries

No localStorage, server/schema changes, LLM calls, claim generation, automatic edges,
`Reader.tsx` changes, or Developer A imports.
