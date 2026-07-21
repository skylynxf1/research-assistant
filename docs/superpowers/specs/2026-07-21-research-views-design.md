# Research Views and Collection Index Design

## Shared inputs

All Phase 8 views consume the same loaded `PaperAnalysis[]`, versioned collection, and
literal `ResearchGraph`. No view invents a parallel graph or semantic relationship.

## Lineage, timeline, constellation

Lineage is a user-selected subgraph. Literal citation edges remain solid; the model can
carry `generated-related` edges but labels them generated and the renderer must dash them.
Phase 1 creates none. Chronology uses explicit reference years or the year encoded in a
modern arXiv id; unknown years remain unknown and sort last. Figure timelines show original
manifest assets and source links. Constellation nodes are fixed size, so they encode no
bibliometric importance; citation edges are the only automatic lines and the selected
collection is the explicit cluster.

## Collection index

A pure in-memory index is rebuilt from papers the user has already loaded into a collection.
It covers title, section titles, page text, captions, references, and asset labels. Search is
case-insensitive lexical matching with bounded results and `SourceEvidence` provenance.
The benchmark browser is the same index constrained to user-entered dataset/benchmark terms
and source tables/captions/passages. It displays original text/assets and never normalizes or
compares metrics.

## UI and failure behavior

`/workspace/collections/<id>/research` hosts Search, Benchmarks, Lineage, Timeline, and
Constellation. Missing local papers remain listed as unavailable and are omitted from derived
views; they are never silently deleted. Every result and timeline item links to source.

No LLMs, generated prose, automatic concept lineage, bibliometric claims, server/schema
changes, `Reader.tsx` changes, or Developer A imports.
