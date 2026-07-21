# Citation Graph and Cross-Paper Provider Design

## Scope

The initial graph contains one loaded paper and only references that are both found in its
body text and explicitly openable in the manifest. Selecting a cited node ingests that
paper, runs the existing analysis once, and expands exactly one more hop. Nothing recursively
crawls in the background.

## Model

`CitationGraphModel` wraps the existing shared `ResearchGraph`. Paper nodes use a stable
arXiv key when available and carry `paperId` only after the content has actually loaded.
Every citation edge is literal (`type: "cites"`, never generated), and has a separate
`CitationTrail` containing the resolved reference, literal sentence context, page, and all
other literal occurrences in that citing paper. Unresolved or unobserved references create
neither nodes nor edges.

Sentence context is relocated source text derived from the existing pdf.js page items. It
is never generated prose. Each occurrence carries a source jump.

## Provider contract

`CrossPaperContextProvider` is a UI-independent synchronous read interface matching section
11. An indexed implementation is populated from loaded analyses and collection records. It
returns only loaded `PaperRef`s, literal graph neighbours, collection papers, and evidence
already present in manifests/text. Lexical evidence queries are deterministic and bounded.

## UI

Citation Graph becomes an Explore tab. Nodes are fixed-size (no false importance encoding),
edges are solid and labelled citation, and the selected node exposes its citation trail.
Openable unloaded nodes have an explicit “Load and expand” action. All source contexts link
back to the original PDF page.

## Boundaries

No background crawl, bibliometric claims, generated relations, LLM calls, server/schema
changes, `Reader.tsx` changes, or Developer A UI imports.
