# Developer B Expansion Completion Audit

Audited against `MARGINALIA_EXPANSION_ARCHITECTURE_AND_DEV_SPLIT (1).md` Developer B
primary ownership and detailed sections B1–B12 / 10 / 11 / 12.

| Requirement | Implementation |
|---|---|
| Cross-paper citation navigation | Lazy open/ingest/expand in `CitationGraph`; literal source trails |
| Citation graph / trail | Shared `ResearchGraph`, observed openable edges only, sentence/page provenance |
| Figure Atlas | Explore Figures tab, original crops/captions/reverse mentions/source links |
| Paper Map | Manifest section hierarchy, assets, observed citations, source links |
| Collections / persistence | Versioned `WorkspaceRepository` over one IndexedDB store; v1→v2 migration |
| Cross-paper search | Collection lexical index over all six specified source fields |
| Figure/table/passages comparison | User-selected `SourceEvidence` side-by-side; no generated claims |
| Research lineage | User-selected subgraph; literal/generated edge semantics retained |
| Paper / figure timelines | Deterministic arXiv chronology, unknown dates explicit, original figures |
| Constellation | Shared graph, literal citation edges, fixed node radius with no importance claim |
| Research pinboard | Persisted source nodes, positions, keyboard/drag movement, user-only edges |
| Dataset / benchmark browser | User-term lexical browsing of original mentions/tables/captions; no metric normalization |
| Author / method networks | Observed-reference coauthors; paper-local explicit method headings only |
| Cross-paper context provider | UI-independent paper/neighbour/collection/evidence contract |
| Reader reflow | Geometry-gated semantic headings/paragraphs; uncertain order falls back to PDF |
| Typography / contrast / motion | Independent visible controls in semantic reader |
| Screen-reader semantics | Native hierarchy, captions, figure/source labels, pages, live status |
| Read aloud | Feature-detected Speech Synthesis over reflow paragraphs only |
| General keyboard accessibility | Native controls, J/K paragraph navigation, non-drag board movement |

## Verification snapshot

- Web: 141 Vitest tests
- API/extraction: 151 Pytest tests
- TypeScript: `tsc --noEmit`
- Next.js: production build
- Live browser: IndexedDB create/reload/delete and unavailable-paper behavior; base reader
  figure/citation/dark-mode regression from the earlier phase verification

The only intentionally untouched item is the shared global reader routing slot in
`Reader.tsx`. Section 18 marks it as coordination-sensitive, and Developer A owns concurrent
reader changes. Developer B surfaces are complete and directly routable without that shared
edit.
