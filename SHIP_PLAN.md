# Marginalia — 30-Hour Ship Plan

## Context

`PROJECT_SPEC_1.md` describes a figure-first PDF reader for research papers (M0→M5). The
goal is to have a working product by **tomorrow night (2026-07-21)**, running locally, on a
corpus of arXiv AI papers.

The full spec is not a 30-hour build — M4 is a self-hosted OpenAlex snapshot and M5 is gated
on metrics that don't exist yet. This plan ships **M0 + M1 + the parts of M2/M3 the user
explicitly asked for**, with two deliberate deviations from the spec agreed in planning:

- **Overlay, not dock rail.** Clicking a figure mention pops a draggable, translucent card
  over the PDF (spec §8's three-column layout is replaced). The reader keeps reading; the
  figure floats next to the sentence that referenced it.
- **Citations open the cited paper side-by-side.** Clicking `[12]` splits the view and loads
  that paper's PDF in a second pane. This promotes spec §7a reference extraction + arXiv
  resolution onto the critical path.

Decisions confirmed with the user: local-only (no deploy), infrastructure cut to essentials.

### Explicitly out of scope

M4 (OpenAlex catalog), M5 (any LLM/analysis layer), OCR/scanned PDFs, accounts, non-arXiv
optimization, non-English papers. **Zero LLM calls in this build** — consistent with spec §2.

---

## Two architectural deviations from the spec (read these)

### 1. Mention detection moves to the client — Stage 5 is deleted

Spec §6 Stage 5 requires a byte-identical text-normalization rule shared between a Python
server and a pdf.js client, with golden fixtures to stop drift. The spec itself offers the
escape hatch ("*skip offsets entirely, let the client run the same regex locally. Prefer this
if Stage 5 takes more than two days*"). At a 30-hour budget, take the escape hatch **on day
zero**, not after burning two days.

**Split by language, cleanly:**

| Side | Owns |
|---|---|
| Python | figure/table regions, PNG crops, captions, sections, reference parsing, arXiv resolution |
| TypeScript | mention detection, citation-marker detection, hotspots, reverse index |

The client already holds `textContent.items` from pdf.js. It runs the regex over those items
directly and maps matches to `(item_index, offset)` — no normalized-string contract, no
shared spec file, no drift class. The manifest therefore has **no `mentions[]` array**; the
client builds it at load time in a few ms.

Consequence: mention accuracy eval (§11) runs in Node, not Python. Figure-region eval stays
in Python.

### 2. Caption-anchored heuristic is the primary figure backend, not the fallback

Spec §6 Stage 2 orders backends PDFFigures2 → Docling → heuristic. Neither of the first two
is viable here:

- **PDFFigures2 requires a JVM.** `java` is not installed on this machine (verified). Adding
  a JVM sidecar to a 30-hour budget is not defensible.
- **Docling** pulls multi-GB torch layout models with slow first-run inference.

So: build spec §6 Stage 2 option 3 (**caption-anchored heuristic**) as the primary, using
PyMuPDF's vector-drawing and image-block data — which handles TikZ-drawn figures, the case
the spec calls out in D2. Record `extraction.figure_backend: "caption-heuristic"` as the spec
requires. Docling stays behind a `--backend docling` flag as a stretch item.

Also fixes a spec hole I flagged: "*first success wins*" is undefined for a layout detector
that always returns something. Define the gate explicitly — a backend result is rejected if
<50% of detected captions get a non-degenerate region (area >1% of page, not overlapping body
text by >30%).

---

## Stack (spec §9, cut to essentials)

| Layer | Choice | Deviation from §9 |
|---|---|---|
| Client | Next.js App Router + TS + Tailwind + `pdfjs-dist` | as spec |
| API | FastAPI, single process, inline extraction + SSE progress | no separate worker |
| Storage | Filesystem, `data/<sha256>/` | **no Postgres, no Redis, no S3** |
| PDF tooling | PyMuPDF only | no PDFFigures2 (no JVM), Docling optional |
| Python | uv-managed, **pin 3.12** | see risk below |

No database. The spec's own D3 says the manifest is a static JSON artifact and the client is
a dumb renderer over it — at one-user scale a DB stores files worse than the filesystem does.
`data/<sha256>/{paper.pdf, manifest.json, crops/*.png}` is the whole persistence layer, and it
preserves D1 content-hash caching exactly.

**Risk:** PyMuPDF may not ship wheels for Python 3.14.2 (the system version). Mitigation:
`uv python pin 3.12` at scaffold time — costs 60 seconds, removes the risk entirely. Verify
with a `fitz` import before writing any extraction code.

---

## Repo layout

Follows spec §9's monorepo shape, minus the shared normalization spec (deleted with Stage 5):

```
/apps/web            Next.js reader
/apps/api            FastAPI + extraction package
  extract/           ingest, figures, crops, refs, arxiv
/packages/schema     manifest.schema.json + generated TS types
/fixtures            golden papers + hand-labeled ground truth
/eval                accuracy harness (§11)
/data                gitignored blob store
```

---

## Manifest schema

Spec §5, with `mentions[]` removed (client-side now) and `references[]` extended for
side-by-side loading:

```jsonc
{
  "doc_id": "sha256:a3f1...",
  "source": { "type": "arxiv" | "upload", "arxiv_id": "1706.03762v7" },
  "title": "...", "page_count": 15,
  "pages": [{ "index": 0, "width_pt": 612.0, "height_pt": 792.0 }],
  "assets": [{
    "asset_id": "fig-1", "kind": "figure" | "table" | "algorithm",
    "label": "Figure 1", "number": "1", "page": 5,
    "bbox": [0.12, 0.08, 0.88, 0.42],        // normalized, TOP-LEFT origin
    "caption": "...", "caption_bbox": [...],
    "image_url": "/blob/<hash>/crops/fig-1.png", "image_width": 1680
  }],
  "references": [{
    "ref_id": "ref-12", "marker": "12",       // or "Vaswani et al., 2017"
    "raw": "[12] A. Vaswani et al. Attention is all you need. NeurIPS 2017.",
    "title": "Attention is all you need", "authors": [...], "year": 2017,
    "arxiv_id": "1706.03762",                 // null if unresolved
    "openable": true
  }],
  "sections": [{ "title": "3 Method", "page": 3, "level": 1 }],
  "extraction": { "version": "1.0.0", "figure_backend": "caption-heuristic", "warnings": [] }
}
```

**Subfigures** (spec §12.2, open question — decided here because it blocks the schema):
`3a` is a **distinct asset with `parent_id: "fig-3"`**. Clicking a mention of 3a docks the 3a
crop. If subregion detection fails, fall back to the parent's crop rather than rendering
nothing — precision-first per §11.

**Coordinate contract (spec §5).** PDF native origin is bottom-left; pdf.js viewport is
top-left. Manifest stores normalized top-left `[0,1]`. Convert exactly once, in
`extract/geometry.py`. Per spec §14, **write the test before the conversion**: a fixture with
a figure on the top half of a page must assert `bbox[1] < 0.5`.

---

## Build order

Ordered so there is a demoable product at every checkpoint. If time runs out, the cut line is
Phase 8 first, then Phase 7.

| # | Phase | Est. | Deliverable |
|---|---|---|---|
| 0 | Scaffold | 1.5h | uv project (py3.12, `fitz` imports), Next.js app, JSON schema + generated TS types |
| 1 | Extraction core | 5h | `python -m extract paper.pdf > manifest.json` — figures, crops, captions, sections. **Spec M0 done.** |
| 2 | References + arXiv | 2h | reference splitting, field parsing, arXiv ID resolution |
| 3 | API | 2h | `POST /api/papers` (upload + arXiv ID), SSE progress, `/blob/*` static serving |
| 4 | Reader shell | 5h | pdf.js continuous scroll, virtualized ±1 page, text layer on, outline nav |
| 5 | Overlay cards | 4h | client mention detection, hotspots, draggable translucent cards, reverse links. **The core UX.** |
| 6 | Side-by-side | 3h | citation markers, split pane, cited-paper fetch + render |
| 7 | Polish | 2h | keyboard (§8), zoom overlay, dark mode, auto-dock |
| 8 | Eval harness | 2h | `/eval` + 10 labeled fixtures |
| — | Buffer | 3.5h | it will be needed |

### Phase notes

**Phase 1 — figure detection.** Caption anchors via
`^\s*(Figure|Fig\.|Table|Algorithm)\s+(\d+[a-zA-Z]?|S\d+|A\.\d+)` over PyMuPDF text blocks.
Region = union of vector drawings (`page.get_drawings()`) and image rects
(`page.get_image_rects()`) in the whitespace-bounded band above the caption (below, for
tables), clipped to the detected column. Crops rendered at 300 DPI with 2% padding; caption
**not** included in the image (spec §6 Stage 3). Thumbnail at 2x downscale.

**Phase 2 — arXiv resolution.** Two-tier: (1) regex the reference string for an explicit
`arXiv:XXXX.XXXXX` — very common in AI papers, near-zero cost; (2) fall back to arXiv API
title search, accept only on high title similarity. Cache every lookup by content hash. Be
polite to the API per spec §6 Stage 1 (identify the client, rate-limit). Unresolved refs
render as plain text with no open affordance — never a dead button.

**Phase 4 — pdf.js gotchas.** Import `pdfjs-dist` via `dynamic(..., { ssr: false })`; set
`workerSrc` explicitly; copy the worker into `public/`. Virtualize to visible page ±1 (spec
§8) — a 40-page paper must not allocate 40 canvases.

**Phase 5 — the core UX.** Mention regex from spec §6 Stage 4, run client-side. Must handle
the four cases the spec calls out: ranges ("Figures 2–4" → three mentions), **self-reference
exclusion** (the caption "Figure 1: Overview" is not a mention — suppress matches inside a
known `caption_bbox`), hyphenation across line breaks, and ligature normalization
(`ﬁ`→`fi`). Hotspots are subtle underlines, not highlights (they'd fight the reader's own
annotations). **Click to open, never hover** — spec §8.

Cards are draggable, translucent, collision-avoiding, and **persist while scrolling** — the
spec's central argument is that a popup vanishing on mouse-out reproduces the exact problem
being solved. Each card shows reverse links (`p.3 p.7 p.9`, current one marked), which spec
§8 calls a headline feature, not a detail.

**Phase 6 — split view.** Pane 2 renders the cited PDF read-only (no extraction) on first
open; if that paper is already extracted and cached, it becomes fully interactive for free.
Esc or a close button collapses back to single-pane.

**Phase 7 — dark mode.** Invert the page canvas but **not** the figure crops (spec §8 —
inverting a white-background plot destroys it).

---

## Verification

Run at each checkpoint, not at the end.

**Phase 1 gate — spec M0's own bar.** Run extraction on 10 hand-picked arXiv AI papers
(Attention Is All You Need, ResNet, BERT, ViT, plus a two-column-heavy and a
subfigure-heavy one). Open every crop and confirm a human agrees with it. Do not start
Phase 4 until this passes — spec §14: *"do not scaffold the frontend before the extraction
pipeline produces a manifest you have manually verified."*

**Unit tests (write first, per spec §14):**
- coordinate conversion — top-half figure asserts `bbox[1] < 0.5`
- caption self-reference exclusion
- range expansion — "Figures 2–4" yields exactly three mentions
- hyphenation join — "Fig-\nure 3" is detected

**Phase 5 manual check:** open Attention Is All You Need, click a Figure 1 mention on p.3,
confirm the card shows the right crop, scroll two pages, confirm the card is still there, and
confirm its reverse links jump the canvas to each other mention.

**Phase 6 manual check:** click a citation with an explicit arXiv ID, confirm the correct
paper loads in pane 2.

**Eval (spec §11), 10 papers not 30** — 30 hand-labeled papers is more labeling than the
budget allows. Label mentions on all 10 (cheap, text-only) and figure bboxes on 5, weighted
toward awkward cases. Report against the spec's targets: mention precision ≥99%, recall ≥95%,
IoU>0.8 on ≥90%, wall time <30s for 15pp. **Precision over recall everywhere** — when
confidence is low, render nothing.

**End-to-end:** `uv run fastapi dev` + `npm run dev`, paste an arXiv ID, read a paper start to
finish without opening another PDF viewer.

---

## What this plan does not deliver

Stated plainly so tomorrow night is not a surprise: no deployment, no accounts, no OpenAlex,
no LLM features, no OCR, no persistence of pins across sessions, no Chrome extension, and an
eval set a third the size the spec asks for. Spec §3's product metrics are not instrumented —
PostHog is a post-ship task, and the "open-first rate" metric needs a survey rather than
telemetry regardless (you can't observe what someone did in Preview.app).
