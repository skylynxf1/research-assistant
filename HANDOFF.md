# Marginalia â€” developer handoff

Written for a second developer joining the project. It covers what exists, how to run it,
what has been verified, and where the real gaps are.

**Read `AGENTS.md` first** (10 minutes). It is the project map: architecture, conventions,
dangerous areas, and a list of non-obvious library behaviours that each cost real
debugging time. This document is the status report; that one is the map.

Two other documents own decisions:

- `PROJECT_SPEC_1.md` â€” the product spec (M0â†’M5). Owns *why*.
- `SHIP_PLAN.md` â€” the approved 30-hour plan. Owns *what we actually built*, and
  documents three deliberate deviations from the spec. Do not "fix" code back toward the
  spec without checking the plan.

---

## Dev A expansion checkpoints

### DEV A PHASE CHECKPOINT

Phase: 2 - Learning / challenge foundation
Dev A commit: `db1fdc54a77e981d29be07b56b58917bcfb225d9`
Branch: `phase-1-a`
Tests: 76 web tests passed; 151 Python tests passed.
Build: TypeScript typecheck and production web build passed.
Known limitations: the in-app browser was unavailable in this session, so the real-paper visual walkthrough remains a follow-up verification. Evidence Hunt is otherwise covered by deterministic source-resolution, evaluator, renderer, return-state, and keyboard-entry tests.

---

## What this is, in one paragraph

A PDF reader for arXiv AI/ML papers. A sentence on page 3 says "as shown in Figure 1";
Figure 1 is on page 7. Clicking the mention opens the figure in place, in a card that
**stays** while you keep scrolling, and shows every other page that references it.

**It does not summarize, and there are zero LLM calls in the codebase.** That is a
product decision, not an omission â€” see spec Â§2. The target reader is the least
LLM-error-tolerant audience there is; one wrong generated claim and they uninstall. A
feature that *relocates* text already in the paper is safe; a feature that *invents* text
is off by default and labelled. Justify any new LLM call against Â§2 before adding it.

---

## Status: all 8 phases of `SHIP_PLAN.md` are built

| Phase | What it delivers | State |
|---|---|---|
| 0 | Manifest schema, generated TS types, scaffolds | done |
| 1 | Extraction core + CLI (**spec M0**) | done |
| 2 | Reference parsing + arXiv resolution | done |
| 3 | HTTP API over the blob store | done |
| 4â€“5 | pdf.js reader, hotspots, overlay cards (**the core UX**) | done |
| 6 | Side-by-side cited papers | done |
| 7 | Keyboard, zoom, dark mode, auto-dock | done |
| 8 | Accuracy harness | done |

**186 tests pass** â€” 151 Python, 35 TypeScript. Everything was written test-first.
Typecheck and production build are clean.

---

## Running it

Prerequisites: `uv`, Node 20+. **Keep the repo out of OneDrive** â€” sync locks files
mid-install and breaks both `uv` and `node_modules`. See `AGENTS.md`.

```bash
# 1. API (terminal 1)
cd apps/api
uv sync
uv run uvicorn main:app --port 8000

# 2. Reader (terminal 2)
cd apps/web
npm install
npm run dev            # picks the next free port if 3000 is taken
```

Open the reader, paste `1706.03762`, and read. First extraction of a paper takes a couple
of seconds; every later open of the same PDF is instant (content-hash cache, spec D1).

### Other entry points

```bash
cd apps/api  && uv run python -m extract paper.pdf > manifest.json   # extraction CLI
cd apps/api  && uv run pytest                                        # Python tests
cd apps/web  && npm test                                             # TS tests
cd apps/web  && npm run gen:schema                                   # regenerate TS types
```

### Running the eval harness

`fixtures/papers/` is gitignored, so fetch the PDFs first. Be polite to arXiv â€” identify
the client and pause between requests, or you will get blocked:

```bash
mkdir -p fixtures/papers && cd fixtures/papers
for id in 1706.03762 1512.03385 1810.04805; do
  curl -sL -A "Marginalia/0.1 (local research reader; you@example.com)" -o "$id.pdf" \
    "https://arxiv.org/pdf/$id"
  sleep 3
done

cd apps/api && uv run python -m extract ../../fixtures/papers/1706.03762.pdf \
  --data-dir ../../data --arxiv-id 1706.03762 > /dev/null   # populate data/ first
uv run python -m eval.figures
cd ../web && npm run eval:mentions
```

---

## The one thing to understand before editing

**The language boundary.** It is deliberate and it is the thing most likely to be
accidentally violated.

| Side | Owns |
|---|---|
| Python | figure/table regions, PNG crops, captions, sections, references, arXiv resolution |
| TypeScript | mention detection, citation markers, hotspots, reverse index |

The manifest has **no `mentions[]` array**. The client already holds pdf.js
`textContent.items`, so it runs the regex over those directly and builds the reverse
index in-browser at load time. A server-side mention index would require a byte-identical
text-normalization rule in both languages, and keeping two implementations in two
languages in sync is a permanent bug source. **Do not add server-side mention detection.**

Consequence: mention accuracy is evaluated in Node, figure-region accuracy in Python.

The other rule worth internalising: **coordinates are converted exactly once**, in
`extract/geometry.py`. PyMuPDF already returns top-left-origin rects, so the usual path is
a scale and *not* a flip. Any coordinate bug in this project will be a failure to convert
exactly once, and a double conversion renders plausibly while being wrong.

---

## Where things live

```
apps/api/extract/      the pipeline: ingest, captions, figures, tabular, crops,
                       sections, references, arxiv, geometry, manifest, __main__
apps/api/main.py       FastAPI: upload/arXiv ingest, manifest, blob store
apps/api/eval/         figure coverage + timing harness
apps/web/lib/          mentions.ts, citations.ts (the client-side IP), pdf.ts, api.ts
apps/web/components/   Reader, PdfPageView, OverlayCard
packages/schema/       manifest.schema.json â€” the Python/TS contract; TS types generated
eval/                  mentions.mts (Node harness) + README with current numbers
fixtures/labels/       hand-labelled ground truth (tracked; the PDFs are not)
data/                  gitignored blob store, data/<sha256>/
```

No database. `data/<sha256>/{paper.pdf, manifest.json, crops/*.png}` is the entire
persistence layer. Spec Â§9 asks for Postgres, Redis, arq and S3; the plan cuts all four
and explains why.

---

## What has actually been verified

Run against three real papers, with the crops opened and inspected by eye:

| Paper | Figures | Tables | References |
|---|---|---|---|
| Attention Is All You Need | 5 / 5 | 4 / 4 | 40 |
| Deep Residual Learning | 7 / 7 | 14 / 14 | 52 |
| BERT | 3 / 5 | 6 / 8 | 57 |

The four BERT misses are **dropped with a warning and render no affordance**. That is the
intended behaviour, not a silent failure: precision over recall everywhere, and never a
dead hotspot.

Eval numbers: caption coverage 39/43 (90.7%); extraction wall time 2.4s per 15 pages
against a 30s target.

---

## Known gaps, in the order I would fix them

1. **Figure-region IoU is unmeasured.** No hand-labelled bounding boxes exist, so
   `eval/figures.py` prints `UNMEASURED` rather than inventing a number. Regions have only
   been checked by eye, which is what the plan's phase 1 gate asks for but does not
   survive a refactor. **This is the highest-value next task** â€” it is the only gap that
   could hide a real regression today. `eval/README.md` documents the label format.
2. **Mention precision/recall rest on two labelled pages of one paper** (both 100%). That
   is a smoke test with a percentage attached, not the golden set spec Â§11 asks for.
   Label mentions by reading the page text, never by reading the tool's output, or the
   harness measures agreement with itself.
3. **BERT's two missing figures and two missing tables** â€” a recall problem worth a look
   once IoU labels exist to prove a fix does not cost precision.
4. **Caption-attachment accuracy** is unmeasured.
5. **Pins do not persist across sessions**, and spec Â§3's product metrics are not
   instrumented. Both are out of scope in the plan; Â§3 needs a survey rather than
   telemetry anyway, since you cannot observe what someone did in another PDF viewer.

---

## Conventions worth knowing before your first PR

- **Test first.** Every module here was built that way, including the coordinate
  conversion, which spec Â§14 calls out by name.
- **Precision over recall, everywhere.** When confidence is low, render nothing. An
  unmatched mention stays in the data with a null asset and gets no hotspot; an unresolved
  reference renders as plain text with no open button.
- **Schema changes start in `packages/schema/manifest.schema.json`**, then regenerate the
  TS types. Never edit the generated file, and never change one side only.
- **Synthetic PDFs are not fixtures for block-grouping behaviour.** PyMuPDF groups
  hand-built pages differently from LaTeX output. Two tests here passed against synthetic
  PDFs while the real paper still failed. Test that class of logic on raw geometry.
- **This repo names no AI vendor** â€” not in filenames, contents, or commit messages. Agent
  guidance goes in `AGENTS.md`; harness-specific files stay untracked via
  `.git/info/exclude`.
- Commit history is written to be read: each phase commit explains the reasoning, and
  `01335e3` in particular documents four defects that only real papers exposed.
