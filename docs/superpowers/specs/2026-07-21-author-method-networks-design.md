# Author and Method Networks Design

The expansion ownership list names author/method networks but provides no separate detailed
feature section. The precision-first Phase 1 interpretation is intentionally narrow.

Author nodes come only from author strings on references actually observed in a loaded
paper’s body. Coauthor edges connect exact normalized author strings that occur on the same
literal reference. The system does not reconcile identities, infer affiliations, or claim
influence. Each node/edge retains citation evidence back to the citing page.

Method nodes come only from manifest section headings containing an explicit method word
(`method`, `methodology`, `approach`, `architecture`, or `model`). Each method node remains
paper-local and connects to its paper with `describes-method`; equal generic headings across
papers are not merged into a false semantic relationship. The source is the heading page.

Both are additive node/edge kinds in the shared `ResearchGraph`. The collection Research
route gets a sixth Networks tab. No generated relations, name/entity inference, LLMs,
server/schema changes, `Reader.tsx` edits, or Developer A imports.
