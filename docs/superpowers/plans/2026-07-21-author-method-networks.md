# Author and Method Networks Implementation Plan

1. Extend graph types additively with `method`, `coauthored`, and `describes-method`.
2. Add failing tests and implement `buildAuthorMethodNetwork(analyses)` with observed-reference
   author provenance, exact coauthor edges, and paper-local explicit method headings.
3. Add a Networks tab to `CollectionResearch`, rendering literal author and method links with
   source jumps and a clear non-inference explanation.
4. Run all gates, update the final handoff/audit, push, merge, clean, and verify `main`.
