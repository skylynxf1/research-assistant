# Marginalia — Figure-First Paper Reader

> Working title. A PDF reader for research papers that keeps figures, tables, and equations
> visible next to the text that references them. It does not summarize.

**Status:** pre-implementation
**Audience:** engineering handoff (human contributors + coding agents)
**Last updated:** 2026-07-20

---

## 1. Problem

Reading a research paper in a standard PDF viewer forces constant context loss. A sentence on
page 3 says "as shown in Figure 1," and Figure 1 is on page 7. The reader scrolls, looks,
scrolls back, and has lost their place in the sentence. The same figure may be referenced from
three separate locations in the paper, each requiring the same round trip.

This is worse for:
- Dense ML/systems papers with many cross-references
- Readers who are non-native English speakers or slower readers
- Papers where a single architecture diagram is central to three different sections

The fix is not "read the paper for me." The fix is: **never make the reader lose their place.**

---

## 2. Positioning and non-goals

### What this is
A **navigation** tool. It resolves cross-references in place so the reader's eye never leaves
the paragraph they are reading.

### What this is explicitly not
- **Not a summarizer.** No "TL;DR of this paper." No auto-generated abstract replacement.
- **Not a chatbot.** No "ask questions about this paper" input box in v1.
- **Not a literature discovery tool.** We are not recommending related work.

### Why the non-goals are load-bearing
Our target user is someone who *chooses* to read papers in full. This population is the least
tolerant of LLM error — one wrong generated claim in the margin of a paper they know well and
they turn the feature off permanently and churn. Every feature that generates prose is a
liability against this audience. Every feature that moves existing content to a better place
is pure upside.

**Design rule:** if a feature invents text, it is off by default and clearly labeled.
If a feature relocates text that is already in the paper, it can be on by default.

### Prior art (know it before you build)
| Tool | What it does | Gap we exploit |
|---|---|---|
| Semantic Reader (AI2) | Inline citation cards, auto-highlights, section nav. Free, 200k+ MAU. | Citation-focused; figure handling is not the core. |
| alphaXiv | arXiv reader with comment layer + AI assistant. Free. | AI-assistant-centric; requires arXiv. |
| Zotero / Paperpile | Reference managers with PDF readers. | Figure preview has been a top user request for years and is still unbuilt. Zotero devs cite the reason: most PDFs have no internal links, so you must analyze the PDF and match figures to mentions. That analysis is our core IP. |
| ReadCube | Figure/reference preview for some publishers. | Publisher-restricted, not general PDFs. |
| arXiv HTML | LaTeXML-rendered HTML for new submissions. | arXiv-only, no backfill guarantee, no docking UX. |

We are not first. We are first to make **figures** the product rather than a checkbox.

---

## 3. Target user and success metrics

**Primary user:** ML/CS grad students and industry researchers who read 3+ papers/week in full.
**Initial test cohort:** Algoverse researchers (warm access, ~10–20 people).

### Metrics that decide whether this is a product
1. **Open-first rate** — of papers read in a session, what fraction were opened in our tool
   *first* vs. opened in a normal PDF viewer and switched over after getting stuck.
   Product if >50%. Feature if <20%.
2. **Docks per session** — number of figure pins per reading session. If median <3, the pain
   is smaller than we believe and we should learn that in week one.
3. **Week-2 retention** on the no-AI build.

These are measured on a build with **zero AI features**. If the navigation layer alone does
not stick, an analysis layer will not rescue it.

---

## 4. Architecture

```
┌─────────────┐    upload / arXiv ID     ┌──────────────────┐
│  Web client │ ───────────────────────► │   API (FastAPI)  │
│  Next.js    │                          └────────┬─────────┘
│  + pdf.js   │ ◄─── document manifest ───────────┘
└─────────────┘                                   │ enqueue
       ▲                                          ▼
       │                              ┌──────────────────────┐
       │  figure crops (PNG)          │  Extraction worker   │
       └──────────────────────────────│  (Python, async)     │
                                      └──────────┬───────────┘
                                                 │
                          ┌──────────────────────┼──────────────────┐
                          ▼                      ▼                  ▼
                   figure regions          text layer +        mention index
                   + captions              coordinates         + linking
                          │                      │                  │
                          └──────────────┬───────┴──────────────────┘
                                         ▼
                              Postgres (manifest JSON)
                              Blob store (PDF + crops)
```

### Key architectural decisions

**D1. Content-hash caching.** Every PDF is keyed by SHA-256 of its bytes. The extraction
pipeline runs once per unique document, ever. The hundredth reader of "Attention Is All You
Need" gets an instant load and costs us nothing. This single decision makes the unit economics
work.

**D2. Pixels from PDF, links from PDF text layer.** We considered building from arXiv LaTeX
source, since `\ref{fig:x}` → `\label{fig:x}` is an exact, deterministic link. Rejected as the
primary path: a large share of ML papers draw figures inline with TikZ/pgfplots, so getting an
*image* out of source requires a full LaTeX compile per paper. Instead:
- Figure images: crop from the rendered PDF (already rasterized, always available)
- Mention links: regex over the pdf.js text layer (figure numbering in a rendered PDF is
  deterministic and unambiguous)
- LaTeX source: **optional accuracy booster** for arXiv papers only — disambiguates subfigures
  (3a vs 3b) and catches `\autoref`-style mentions that render unusually

Consequence: v0 works on **any** PDF, not just arXiv, and contains zero AI.

**D3. The extraction output is a static JSON manifest.** The client is a dumb renderer over
this manifest. No server round trips during reading. This keeps the reading experience instant
and makes offline/local-first viable later.

**D4. Metadata lookup is a pluggable interface with a null implementation.** See §7.

---

## 5. Data model

```jsonc
// Document manifest — the single artifact the extraction pipeline produces
{
  "doc_id": "sha256:a3f1...",
  "source": { "type": "upload" | "arxiv", "arxiv_id": "2401.12345v2" | null },
  "title": "...",                    // from PDF metadata or first-page heuristic
  "page_count": 14,
  "pages": [
    { "index": 0, "width_pt": 612.0, "height_pt": 792.0 }
  ],
  "assets": [
    {
      "asset_id": "fig-1",
      "kind": "figure" | "table" | "equation" | "algorithm",
      "label": "Figure 1",           // normalized display label
      "number": "1",                 // "1", "2a", "S3"
      "page": 6,                     // 0-based
      "bbox": [0.12, 0.08, 0.88, 0.42],  // normalized [x0,y0,x1,y1], origin TOP-LEFT
      "caption": "Overview of the proposed architecture...",
      "caption_bbox": [0.12, 0.43, 0.88, 0.47],
      "image_url": "/blob/sha256-a3f1.../fig-1.png",
      "image_width": 1680,           // rendered at 300 DPI
      "mention_ids": ["m-004", "m-017", "m-031"]
    }
  ],
  "mentions": [
    {
      "mention_id": "m-004",
      "asset_id": "fig-1",
      "page": 2,
      "text": "Figure 1",            // exact surface form as it appears
      "char_start": 4821,            // offset into that page's normalized text
      "char_end": 4829,
      "confidence": 1.0
    }
  ],
  "sections": [                       // optional, for outline nav
    { "title": "3 Method", "page": 3, "level": 1 }
  ],
  "references": [],                   // populated in v2, see §7
  "extraction": {
    "version": "1.0.0",
    "figure_backend": "pdffigures2" | "docling" | "caption-heuristic",
    "warnings": ["page 9: figure region overlaps body text"]
  }
}
```

### Coordinate system contract — read this twice
- PDF native coordinates have origin at **bottom-left**, y increasing upward.
- pdf.js viewport coordinates have origin at **top-left**, y increasing downward.
- **The manifest stores normalized top-left-origin coordinates in [0,1].** Convert once, at
  extraction time. Any coordinate bug in this project will be a failure to do this conversion
  exactly once. Write a unit test with a known fixture asserting a figure on the top half of
  the page has `bbox[1] < 0.5`.

---

## 6. Extraction pipeline

Runs as an async job. Target: <30s for a 15-page paper.

### Stage 1 — Ingest
- Accept file upload or arXiv ID/URL. For arXiv, fetch the PDF from the standard export
  endpoint and respect their rate limits (be polite; identify the client).
- Compute SHA-256. If manifest exists, return immediately.
- Validate: is there a text layer? If `page.get_text()` returns near-empty across all pages,
  this is a scanned PDF → mark `needs_ocr: true` and fail gracefully with a clear message.
  **OCR is out of scope for v1.**

### Stage 2 — Figure region detection
Try backends in order, first success wins:

1. **PDFFigures2** (AI2, Scala). Purpose-built for CS/ML papers, outputs figure and table
   regions with captions as JSON. Highest precision on our core corpus. Run it as a
   subprocess or a small sidecar service.
2. **Docling** (Python). Layout model, broader document coverage, easier to deploy. Good
   fallback for non-CS papers.
3. **Caption-anchored heuristic** (ours, always available). Find text lines matching
   `^\s*(Figure|Fig\.|Table|Algorithm)\s+(\d+[a-z]?)` and treat them as caption anchors. The
   asset region is the whitespace-bounded block immediately above (figures) or below (tables)
   the caption, clipped to the column. Crude but never fails to produce something.

Record which backend produced the result in `extraction.figure_backend`.

### Stage 3 — Crop rendering
- Render the page at 300 DPI with PyMuPDF, crop to `bbox` with ~2% padding, save PNG.
- Also save a 2x-downscaled thumbnail for the dock rail.
- Do **not** crop the caption into the image — the caption is stored as text so it can be
  selected, searched, and re-typeset in the dock panel.

### Stage 4 — Mention detection
Over each page's text layer:

```python
MENTION_RE = re.compile(
    r"\b(?:"
    r"(?P<fig>Fig(?:ure|s?\.|s)?)"
    r"|(?P<tab>Tab(?:le|\.)?)"
    r"|(?P<eq>Eq(?:uation|n?\.)?)"
    r"|(?P<alg>Alg(?:orithm|\.)?)"
    r")\s*\.?\s*(?P<num>\d+)(?P<sub>[a-z])?\b",
    re.IGNORECASE,
)
```

Handle these cases explicitly — each one is a bug report waiting to happen:
- **Ranges:** "Figures 2–4" produces three mentions. "Figures 2 and 3" produces two.
- **Self-reference exclusion:** the caption "Figure 1: Overview..." is not a mention of
  Figure 1. Suppress any match whose bbox intersects a known `caption_bbox`.
- **Hyphenation across line breaks:** "Fig-\nure 3". Normalize the text layer by joining
  hyphen-newline pairs *before* running the regex, and keep an offset map back to the raw
  layer.
- **Ligatures and unicode:** normalize `ﬁ` → `fi` before matching.
- **Appendix figures:** "Figure S3" or "Figure A.1" — extend the number pattern.

### Stage 5 — Text-layer offset mapping (the gnarly part)
pdf.js splits page text into `<span>` elements at arbitrary boundaries — a single word can be
split across spans, and spaces are often absent between spans. To turn a regex match into a
highlightable DOM range:

1. On the server, build a **normalized page string** by concatenating text items with a
   deterministic joining rule (insert a space when the horizontal gap between items exceeds
   0.25× the font size). Store character offsets against *this* string.
2. On the client, rebuild the identical normalized string from the pdf.js text content using
   the *same* joining rule, plus an index map `char_offset → (item_index, offset_in_item)`.
3. Use `document.createRange()` with `setStart`/`setEnd` on the text nodes to wrap the mention.

**The joining rule must be byte-identical between server and client.** Put it in a single
shared spec file with a golden test fixture (a page's text items → expected normalized string)
that both implementations are tested against. Do not let these drift.

Alternative if this proves too brittle: skip offsets entirely, ship the normalized page text
to the client, and let the client run the same regex locally. Costs a little CPU, eliminates
a whole class of desync bugs. **Prefer this if Stage 5 takes more than two days.**

### Stage 6 — Linking and reverse index
- Map each mention to its asset by `(kind, number)`.
- Unmatched mention (paper cites "Figure 6" but we only found 5 figures) → keep it in the
  manifest with `asset_id: null` and log a warning. Never render a dead hotspot.
- Populate `asset.mention_ids` sorted by page then position. **This reverse index is a
  first-class feature**, not a byproduct — see §8.

---

## 7. Reference layer (v2)

We are building this ourselves rather than calling a third-party paper API. Two separable
pieces:

### 7a. What we own — reference extraction (build this)
1. **Locate the References section.** Heading match on the text layer, take to EOF. Watch for
   appendices *after* references — stop at the next section-level heading.
2. **Split into entries.** Geometric, not semantic. Numbered styles (`[1]`, `1.`) split on the
   marker. Author-year styles use hanging indent: an entry's first line starts at a lower
   x-position than its continuation lines. x-coordinates come free from the text layer.
3. **Parse fields** (authors, title, year, venue). A CRF (AnyStyle is the good standalone
   option) works. A cheap LLM now beats CRF on messy entries: one call, whole reference
   section in, JSON array out, fractions of a cent, cached forever by content hash. This is
   an acceptable use of an LLM because the output is structured data we validate, not prose
   we show as fact.
4. **Link inline markers to entries.** Numeric is trivial. Author-year needs surname + year
   matching with `2020a`/`2020b` disambiguation.

This works on non-indexed PDFs — internal reports, theses, old scans — which is a genuine
advantage over anyone calling a paper API.

### 7b. What we cannot build from scratch — the catalog
Steps 1–4 give a reference *string*. They do not give the cited paper's abstract, citation
count, or a link. That requires a catalog of the global literature, which we are not building.

**Use OpenAlex.** The data is CC0, the full snapshot is free to bulk download and updated
monthly, so we can self-host and own the stack completely — which is the outcome we actually
want. Their hosted API is the easier start: free key, 100k credits/day, singleton lookups
cost 1 credit each.

⚠️ **Note for whoever wires this up:** OpenAlex now requires API keys. The old `mailto` polite
pool was dropped in February 2026 in favor of credit-based limits. Get a key, and cache every
lookup by DOI/arXiv ID regardless of which path you take.

### 7c. The interface
```python
class MetadataResolver(Protocol):
    def resolve(self, ref: ParsedReference) -> ResolvedPaper | None: ...

class NullResolver:   # default; ships in v1
    def resolve(self, ref): return None
```
With `NullResolver`, reference strings render as plain text — still useful, since the reader
sees the citation inline instead of scrolling to the bibliography. Swapping in a self-hosted
OpenAlex index later is a config change, not a rewrite.

---

## 8. Frontend specification

### Layout
```
┌────────┬──────────────────────────────┬─────────────────┐
│Outline │                              │   DOCK RAIL     │
│        │        PDF canvas            │                 │
│ 1 Intro│    (pdf.js, continuous       │  ┌───────────┐  │
│ 2 Rel. │     scroll, text layer on)   │  │ Figure 1  │  │
│ 3 Meth │                              │  │  [image]  │  │
│  3.1   │   ...as shown in Figure 1,   │  │  caption  │  │
│  3.2   │      ~~~~~~~~~~ ← hotspot    │  │ p.3 p.7 ● │  │
│ 4 Exp  │                              │  └───────────┘  │
└────────┴──────────────────────────────┴─────────────────┘
```

### Core interactions

**Hotspots.** Every resolved mention gets a subtle underline (not a highlight — highlights
fight with the reader's own annotations). Hover shows a light affordance. **Click, not hover,
opens the dock** — hover is fiddly, fires accidentally while reading, and is dead on touch
devices.

**Docking, not popups.** This is the central design decision. Clicking a mention pins the
asset to the dock rail, where it **stays** while the user keeps scrolling. A transient popup
that vanishes on mouse-out reproduces the exact problem we are solving. Multiple assets can be
pinned simultaneously and stack vertically; the rail scrolls independently.

**Reverse links.** Each pinned asset shows the pages it is referenced from: `p.3 p.7 p.9`,
with the current one marked. Clicking one scrolls the main canvas to that mention. Nobody else
does this, it is nearly free once the mention index exists, and it is the feature that makes a
figure legible when it is discussed in three separate places. **Treat it as a headline
feature, not a detail.**

**Auto-dock (default on, toggleable).** As the user scrolls, if the paragraph entering the
viewport center contains a mention, soft-pin that asset. Soft pins are replaced by the next
soft pin; hard pins (explicit clicks) persist until dismissed. This is what makes the tool
feel like it is reading along with you.

**Zoom on the crop.** Click a pinned image to expand it to a full-width overlay. Figures are
often illegible at rail width; this must be one click, dismissable with Esc.

### Keyboard
| Key | Action |
|---|---|
| `f` | Pin the next unpinned mention below the viewport top |
| `1`–`9` | Focus / expand the Nth pinned asset |
| `Esc` | Close overlay, else unpin the focused asset |
| `[` / `]` | Jump to previous / next mention of the focused asset |
| `\` | Toggle dock rail |

### Rendering constraints
- pdf.js with the **text layer enabled** (required for hotspots) and the annotation layer off.
- Continuous scroll, virtualized: render the visible page ±1. A 40-page paper must not
  allocate 40 canvases.
- Dark mode must invert the page canvas but **not** the figure crops (inverting a plot with a
  white background makes it unreadable; inverting a photo destroys it).
- Target: 60fps scroll on a 30-page paper on a 2020-era laptop.

---

## 9. Tech stack

| Layer | Choice | Rationale |
|---|---|---|
| Client | Next.js (App Router) + TypeScript + Tailwind | Fast, well-trodden, good for coding agents |
| PDF render | `pdfjs-dist` directly, not `react-pdf` | We need low-level text-layer access that wrappers hide |
| API | FastAPI (Python) | Same language as the extraction pipeline |
| Worker | Python + `arq` or Celery + Redis | Async extraction jobs |
| PDF tooling | PyMuPDF (render/crop/text), PDFFigures2 (regions), Docling (fallback) | See §6 |
| DB | Postgres (manifests as JSONB) | Manifest is a document; JSONB is the right shape |
| Blob | Local disk in dev, S3-compatible in prod | Crops + original PDFs |
| Analytics | PostHog or similar, self-hosted | We need §3 metrics from day one |

**Monorepo layout:**
```
/apps/web          Next.js client
/apps/api          FastAPI + worker
/packages/schema   Manifest JSON schema + shared normalization spec (§5 Stage 5)
/fixtures          Golden test papers + hand-labeled ground truth
/eval              Accuracy harness (§11)
```

---

## 10. Milestones

### M0 — Extraction spike (no UI)
CLI: `python -m extract paper.pdf > manifest.json`. Figure regions, crops, mentions, links.
**Done when:** running it on 10 hand-picked ML papers produces manifests a human agrees with.

### M1 — Reader v0 ⭐ **This is the thing we put in front of testers**
pdf.js viewer, hotspots, click-to-dock, reverse links, keyboard nav, outline. Upload + arXiv
ID. No accounts, no AI, no references.
**Done when:** the Algoverse cohort can read a paper end-to-end without touching another PDF
viewer, and §3 metrics are instrumented.

### M2 — Robustness
Auto-dock, expand overlay, dark mode, equations and algorithms as assets, extraction backend
fallback chain, graceful degradation on bad PDFs. Persistence of pins across sessions.

### M3 — Reference layer
§7a in full, with `NullResolver`. Inline citation text on click.

### M4 — Catalog integration
Self-hosted OpenAlex snapshot or API resolver behind the §7c interface. Citation cards with
abstract + link.

### M5 — Optional analysis layer (only if M1 metrics justify it)
Per-section notes from a cheap model. **Off by default. Visually distinct from paper content
— different background, explicit "generated" label. Never inline with the author's prose.**
Batch per section, never per paragraph (one call returning 12 notes, not 12 calls). Cache by
document hash so it is paid for once per paper, ever.

---

## 11. Accuracy targets and eval harness

Build `/eval` at M0, not later. Reading tools die from one wrong popup.

**Golden set:** 30 papers, hand-labeled. Composition: 20 ML/CS (arXiv, two-column and
single-column), 5 with heavy subfigure use (3a/3b/3c), 3 with appendix figures, 2 deliberately
awkward (rotated tables, figures spanning columns).

| Metric | Target | Why |
|---|---|---|
| Mention detection precision | ≥ 99% | A hotspot that opens the wrong figure is worse than no hotspot. Precision over recall, always. |
| Mention detection recall | ≥ 95% | A missed mention is invisible; the user just scrolls as before. |
| Figure region IoU > 0.8 | ≥ 90% | A crop that cuts off an axis label is useless. |
| Caption attached correctly | ≥ 95% | |
| Extraction wall time, 15pp | < 30s | |

**Precision is the priority everywhere.** When confidence is low, render nothing. A tool that
silently does less is trusted; a tool that is confidently wrong is uninstalled.

---

## 12. Open questions

1. **Delivery form.** Web app (own the experience, but users must upload) vs. Chrome extension
   that activates on arxiv.org (zero friction, no upload, but constrained UI). The extension
   wedge worked for alphaXiv. **Recommend: build the web app first since the extraction
   pipeline is shared, but validate the extension path before M2.**
2. **Subfigure granularity.** Is "Figure 3a" a distinct asset or a region within Figure 3?
   Leaning: distinct asset with a parent pointer, so a mention of 3a docks the crop of just 3a.
3. **Scanned PDFs.** Out of scope for v1. Revisit only if testers hit it.
4. **Pricing.** $20/mo is ChatGPT Plus money for a single-purpose reader competing with free
   alternatives (Semantic Reader, alphaXiv). Expect that to be a hard ceiling. $5–8/mo, or
   free core with paid library/sync, is more defensible. **Do not decide this before M1
   metrics.**
5. **Non-English papers.** Mention regex is English-only. Fine for v1; note as a known limit.

---

## 13. Risks

| Risk | Mitigation |
|---|---|
| It is a feature, not a product — good tools like this exist and have not won | §3 open-first metric answers this in weeks, not months. Measure early and be willing to believe the answer. |
| Figure extraction quality varies too much across venues | Backend fallback chain + eval harness + precision-first rendering. Degrade to a plain PDF viewer rather than show garbage. |
| Reading tools have poor retention generally | Auto-dock is the retention bet: it makes value passive rather than requiring the user to remember to click. |
| A well-funded incumbent ships figure docking in a sprint | True, and unfixable by secrecy. The defense is being the tool researchers already have open. Ship, get the cohort using it, iterate on real friction. |
| Scope creep into "just add a chat box" | It is in §2 as a non-goal for a reason. Revisit only with evidence, never with a vibe. |

---

## 14. Notes for the implementer

- **Start at M0.** Do not scaffold the frontend before the extraction pipeline produces a
  manifest you have manually verified against real papers.
- **The manifest schema (§5) is the contract.** Write the JSON schema in `/packages/schema`
  first and generate types for both sides from it.
- **Write the coordinate-conversion test before the coordinate conversion.** See §5.
- **Do not add features not in this document.** If something seems obviously missing, raise it
  as an open question rather than building it. The non-goals in §2 are deliberate and have
  cost us more thought than the features.
- **Every LLM call in this codebase must be justified against §2.** Currently exactly one is
  sanctioned: reference-string parsing to structured data (§7a step 3), because the output is
  validated structured data, not prose shown to the reader as fact.
