# Marginalia — Expansion Architecture, Feature System, and Two-Developer Handoff

> **Purpose:** This document is the implementation handoff for expanding Marginalia from a figure-first arXiv PDF reader into a connected research exploration, accessibility, learning, and gamified research workspace.
>
> **Audience:** Two developers working in parallel, plus coding agents/Codex/Claude that need a precise description of ownership, architecture, interfaces, sequencing, and invariants.
>
> **Read first:** `AGENTS.md`, then `PROJECT_SPEC_1.md`, then `SHIP_PLAN.md`, then this file.
>
> **Important:** This file extends the existing product. It does **not** replace the existing architecture, extraction contract, precision-first behavior, or working reader.

---

# 0. Executive summary

Marginalia currently solves one painful research-reading problem extremely well: when a paper says “as shown in Figure 1,” the reader can open Figure 1 in place without losing their reading position. Citations can open cited papers side-by-side. The system is deterministic, source-grounded, and intentionally contains zero LLM calls in the current core.

The next version broadens Marginalia into four connected product surfaces:

1. **Research Reader** — the existing PDF experience, improved with reflow, accessibility, selection actions, contextual navigation, and persistent reading tools.
2. **Research Explorer** — cross-paper citation graphs, figure atlases, paper maps, research lineage, timelines, collections, comparison, and visual research workspaces.
3. **Learning Layer** — concepts, difficulty regions, prerequisites, “I don’t understand this,” local visualizations, and concept threads.
4. **Game Layer** — user-triggered interactive learning activities generated from source evidence: figure puzzles, evidence hunts, predictions, concept matching, paper quests, boss checks, and cross-paper challenges.

The product principle tying all four together is:

> **Do not replace research with a summary. Reorganize, connect, expose, and interact with the original evidence.**

A second key principle:

> **Any generated interpretation must be optional, explicitly initiated by the user, clearly labeled, and traceable back to source evidence.**

---

# 1. Non-negotiable invariants from the existing build

These rules already exist for good reasons. New work must preserve them.

## 1.1 Preserve the language boundary

### Python owns

- PDF ingestion
- figure/table/algorithm region extraction
- PNG crops
- captions
- sections
- references
- arXiv resolution
- PDF geometry normalization
- static manifest generation

### TypeScript owns

- figure/table mention detection in `pdf.js` text content
- citation marker detection
- hotspot generation
- reverse mention index
- browser reader interactions
- selection interactions
- learning/game state
- cross-paper client-side navigation and visualization unless a server aggregate is truly required

**Do not add `mentions[]` to the server manifest.**

Mention detection remains client-side because the browser already owns `pdf.js` text items and because maintaining byte-identical text normalization in Python and TypeScript would create permanent drift risk.

## 1.2 Coordinates convert exactly once

Coordinate normalization remains centralized in `apps/api/extract/geometry.py`.

- Input may come from PyMuPDF geometry.
- Manifest coordinates are normalized top-left `[0,1]`.
- The web layer consumes normalized coordinates.
- No feature should apply a “helpful” second flip/conversion.

Any new feature involving:

- highlight bounding boxes
- clickable diagram regions
- figure hotspots
- evidence markers
- game targets
- annotation pins

must consume the same canonical coordinate model.

## 1.3 Precision over recall

When confidence is low, render nothing rather than creating a misleading interaction.

Examples:

- Unmatched mention -> no hotspot.
- Unresolved citation -> plain text, no open button.
- Uncertain figure-region link -> no game target.
- Low-confidence generated claim/evidence relationship -> do not create a scored challenge.
- Ambiguous “correct answer” -> downgrade to non-scored exploration or do not generate.

## 1.4 Schema changes remain schema-first

Any shared persisted structure must begin in:

`packages/schema/manifest.schema.json`

Then regenerate TypeScript types.

Never hand-edit generated types.

However, **do not put ephemeral reader/game state into the static extraction manifest unless it is intrinsic to the paper.**

The manifest should describe the document, not the user session.

## 1.5 Existing reader behavior cannot regress

Before merging any major branch, the following must still work:

1. Open `1706.03762`.
2. Click a Figure 1 mention.
3. Correct figure crop opens.
4. Card remains while scrolling.
5. Reverse links navigate to other mentions.
6. Citation opens cited paper in pane 2.
7. Dark mode does not invert figure crops.
8. Keyboard controls still work.
9. Existing tests remain green.

---

# 2. Product modes

The expanded product should expose three primary reading modes, plus separate exploration/workspace views.

## 2.1 Read mode

Default Marginalia.

Goal: serious research reading with minimal interruption.

Includes:

- PDF reader
- existing figure/table overlays
- reverse mentions
- citation navigation
- side-by-side cited papers
- keyboard navigation
- pins/notes
- selection menu
- accessibility controls

Does **not** automatically interrupt with games.

## 2.2 Learn mode

Goal: make difficult research easier to understand while preserving the source.

Adds:

- difficulty indicators
- concept markers
- “I don’t understand this”
- prerequisite maps
- concept threads
- optional explanations
- local visualizations
- suggested learning activities
- section checkpoints

Games are offered, never forced.

## 2.3 Quest mode

Goal: active learning through the paper.

Adds:

- progression checkpoints
- generated challenges
- concept mastery state
- section gates where appropriate
- Paper Quest path
- end-of-paper Paper Check

The user still reads the original paper. Quest mode layers interactions on top of it rather than replacing the paper with a lesson.

## 2.4 Explore / Workspace

Separate surfaces for multi-paper work:

- citation graph
- paper map
- figure atlas
- cross-paper comparison
- research lineage
- timelines
- constellation view
- collections
- pinboard
- concept exploration across papers

---

# 3. Two-developer ownership model

Do **not** divide work as “Dev A games / Dev B everything else.” That creates cross-dependencies on nearly every game.

Use this split instead.

## Developer A — Learning & Interaction

**Owns turning research content into an interactive learning experience.**

Primary ownership:

- text selection/highlight intelligence
- shared `ResearchContext` creation from a reader selection
- selection action menu
- learning object model
- concept extraction/identification layer
- concept threads within a paper
- difficulty/complexity detection
- difficulty heatmap
- “I don’t understand this” flow
- prerequisite graph
- local/micro visualizations
- Learn mode
- Quest mode
- challenge engine
- challenge rendering shell
- game types
- mastery/progress state
- evidence links from challenges back to PDF
- interactive figure understanding
- figure-region question targets
- section checkpoints
- paper-end Paper Check
- cross-paper game logic after Dev B exposes cross-paper contexts

## Developer B — Exploration, Workspace & Reader Accessibility

**Owns turning papers into a connected visual research workspace.**

Primary ownership:

- cross-paper citation navigation expansion
- citation graph
- Figure Atlas
- Paper Map
- research collections/spaces
- cross-paper search
- figure/table comparison
- research lineage
- figure timeline
- paper timeline
- constellation view
- research pinboard
- persistent pins/workspace persistence
- dataset/benchmark browser
- author/method networks
- cross-paper context provider
- reader reflow
- font/spacing/contrast accessibility
- screen-reader semantic representation
- read-aloud/TTS integration if added
- general accessibility settings
- workspace-level persistence

## Shared ownership — contracts only

Both developers may contribute, but changes require coordination:

- `ResearchContext`
- `SourceEvidence`
- `PaperRef`
- `PassageRef`
- `ConceptRef`
- cross-paper query API
- persistence abstraction
- feature flags
- global reader routing

The shared layer should be small. Avoid “shared utilities” becoming a dumping ground.

---

# 4. System architecture

```text
                                  ┌────────────────────────────┐
                                  │          PDF / arXiv       │
                                  └──────────────┬─────────────┘
                                                 │
                                                 ▼
                              ┌───────────────────────────────────┐
                              │ Existing Python extraction layer  │
                              │ figures / tables / captions /     │
                              │ sections / refs / geometry        │
                              └─────────────────┬─────────────────┘
                                                │
                                      static manifest + blobs
                                                │
                                                ▼
                     ┌───────────────────────────────────────────────────┐
                     │              Browser / pdf.js reader              │
                     │ text items / mentions / citations / hotspots      │
                     └───────────────┬───────────────────┬───────────────┘
                                     │                   │
                                     │                   │
                                     ▼                   ▼
                      ┌─────────────────────┐   ┌────────────────────────┐
                      │ Research Context    │   │ Exploration Context    │
                      │ selection-local     │   │ paper / collection     │
                      └─────────┬───────────┘   └───────────┬────────────┘
                                │                           │
                  ┌─────────────┴────────────┐              │
                  │                          │              │
                  ▼                          ▼              ▼
        ┌───────────────────┐      ┌────────────────┐  ┌──────────────────┐
        │ Learning Objects  │      │ Learning Engine│  │ Exploration Engine│
        └─────────┬─────────┘      └───────┬────────┘  └─────────┬────────┘
                  │                        │                     │
                  ▼                        ▼                     ▼
       ┌─────────────────────┐   ┌──────────────────┐  ┌───────────────────┐
       │ Challenge Generator │   │ Learn / Quest UI │  │ Graphs / Atlas /  │
       └──────────┬──────────┘   └──────────────────┘  │ Workspace / Compare│
                  │                                     └───────────────────┘
                  ▼
       ┌─────────────────────┐
       │ Challenge Renderer  │
       │ MCQ / match / build │
       │ evidence / predict  │
       └─────────────────────┘
```

---

# 5. Shared canonical data contracts

These structures should prevent both developers from reaching directly into one another's components.

## 5.1 `ResearchContext`

The universal “what is happening around this user interaction?” object.

```ts
export interface ResearchContext {
  paper: PaperRef;

  selection?: SelectionContext;
  section?: SectionRef;

  surroundingPassages: PassageRef[];
  concepts: ConceptRef[];
  nearbyAssets: AssetRef[];
  citations: CitationRef[];
  mentions: MentionRef[];

  sourceWindow: SourceWindow;
}
```

### SelectionContext

```ts
export interface SelectionContext {
  text: string;
  page: number;
  itemRanges: TextItemRange[];
  bbox?: NormalizedBBox;
}
```

### SourceWindow

A bounded chunk of source material around the selection.

```ts
export interface SourceWindow {
  before: PassageRef[];
  selected?: PassageRef;
  after: PassageRef[];
}
```

**Do not send an entire paper to a generation model for every selection.**

Use the smallest sufficient grounded window.

## 5.2 `SourceEvidence`

Every generated challenge or generated explanation should be able to point to evidence.

```ts
export interface SourceEvidence {
  paperId: string;
  page: number;
  kind: "passage" | "figure" | "table" | "equation" | "caption" | "citation";

  text?: string;
  assetId?: string;
  bbox?: NormalizedBBox;

  sectionId?: string;
}
```

This is critical.

No challenge should be scored unless its expected answer is grounded by one or more `SourceEvidence` objects.

## 5.3 Learning objects

```ts
export type LearningObject =
  | ConceptObject
  | ClaimObject
  | EvidenceObject
  | FigureObject
  | TableObject
  | EquationObject
  | DefinitionObject
  | ExperimentObject;
```

Minimum base structure:

```ts
export interface LearningObjectBase {
  id: string;
  kind: LearningObjectKind;
  paperId: string;
  label: string;
  evidence: SourceEvidence[];
  confidence: number;
}
```

### Concept

```ts
export interface ConceptObject extends LearningObjectBase {
  kind: "concept";
  aliases: string[];
  prerequisites: string[];
  occurrences: PassageRef[];
}
```

### Claim

```ts
export interface ClaimObject extends LearningObjectBase {
  kind: "claim";
  claimText: string;
  supportingEvidenceIds: string[];
}
```

### Experiment

```ts
export interface ExperimentObject extends LearningObjectBase {
  kind: "experiment";
  hypothesis?: string;
  methodEvidence: SourceEvidence[];
  resultEvidence: SourceEvidence[];
}
```

## 5.4 Challenge spec

All games should consume one common challenge contract.

```ts
export type ChallengeType =
  | "multiple-choice"
  | "concept-match"
  | "ordering"
  | "figure-build"
  | "figure-detective"
  | "evidence-hunt"
  | "prediction"
  | "claim-evidence"
  | "timeline"
  | "paper-vs-paper";

export interface ChallengeSpec {
  id: string;
  type: ChallengeType;

  paperIds: string[];
  concepts: string[];
  source: SourceEvidence[];

  prompt: string;
  difficulty: "easy" | "medium" | "hard";

  payload: ChallengePayload;
  answer: ChallengeAnswer;
  hints: ChallengeHint[];

  scoring: ChallengeScoring;
  generation?: GenerationMetadata;
}
```

### Important

Rendering components should **not** need to know how a challenge was generated.

```text
Learning Objects
       ↓
Challenge Generator
       ↓
ChallengeSpec
       ↓
Renderer
```

This makes deterministic challenges and optional LLM-generated challenges interchangeable.

---

# 6. LLM boundary and generation policy

The existing product intentionally has zero LLM calls. Preserve this as the default behavior.

Any generation layer is an **optional extension**, not part of core extraction correctness.

## Allowed user-triggered uses

- turn selected text into a challenge
- explain selected text
- generate a micro visualization description/structure
- identify likely prerequisites
- create a section checkpoint
- compare user-selected passages from multiple papers
- produce challenge distractors from source context

## Not allowed silently

Do not automatically:

- summarize entire papers on open
- rewrite author conclusions
- generate uncited “key takeaways”
- assert research consensus
- infer causality beyond the paper
- create scored answers without source grounding

## Required generated-content metadata

```ts
export interface GenerationMetadata {
  generated: true;
  model?: string;
  createdAt: string;
  groundedEvidenceIds: string[];
  confidence?: number;
}
```

The UI should label generated material as generated.

Every answer/explanation should expose:

**Show evidence →**

---

# 7. Developer A detailed feature specification — Learning & Interaction

---

## A1. Selection / Highlight Intelligence

### Purpose

Create one universal interaction layer around selected research text.

### User flow

1. User selects text in the `pdf.js` text layer.
2. Browser collects exact selected text and item ranges.
3. Resolve page and normalized bbox if available.
4. Find containing section.
5. Collect nearby figures/tables/citations.
6. Build `ResearchContext`.
7. Show contextual action menu.

### Menu

Recommended default:

- Pin
- Trace
- Explain
- Visualize
- Play
- More

Optional “More” actions:

- Compare
- Add note
- Copy citation
- Show prerequisites

### Architecture

Suggested modules:

```text
apps/web/lib/selection/
  selection.ts
  context.ts
  bbox.ts
  nearby.ts

apps/web/components/selection/
  SelectionMenu.tsx
  SelectionActionPanel.tsx
```

### Do not

- rebuild text extraction server-side
- invent a second coordinate system
- mutate existing mention detection
- block ordinary browser text selection

---

## A2. “I Don’t Understand This”

### Purpose

Single entry point for difficulty/help interactions.

### User flow

Highlight or click a paragraph -> `I don't get this`.

Options:

- Explain simply
- Break into parts
- Show prerequisites
- Visualize
- Trace through paper
- Learn interactively

### Architecture

This is an orchestration feature. It should call shared services rather than duplicate logic.

```text
UnderstandPanel
   ├── ExplanationService
   ├── PrerequisiteService
   ├── VisualizationService
   ├── ConceptThreadService
   └── ChallengeService
```

---

## A3. Concept identification and Learning Objects

### Purpose

Games should operate on structured learning objects, not random text snippets.

### Phase 1 implementation

Start conservatively:

- selected terms
- defined terms
- repeated noun phrases
- figure labels
- section headings
- text patterns such as “we define,” “we call,” “is defined as”

Optional generation can enrich aliases/prerequisites.

### Persistence

Initially session-local or derived/cacheable.

Do **not** expand the extraction manifest prematurely.

If caching becomes necessary, add a separate derived-analysis artifact:

```text
data/<sha256>/analysis/learning.json
```

not core `manifest.json`.

---

## A4. Concept Threads

### Purpose

Show how one idea appears through a paper.

### Example

```text
Self-attention
  ↓
Introduction mention
  ↓
Section 3.2 definition
  ↓
Figure 2
  ↓
Section 5 experiment
  ↓
Conclusion
```

### Deterministic baseline

1. Use selected concept phrase.
2. Normalize ligatures/hyphenation using existing client conventions.
3. Search pdf.js text items across the paper.
4. Group occurrences by section.
5. Attach nearby assets/citations.

### Optional semantic expansion

Add aliases/similar concept mentions only when explicitly enabled.

### Game reuse

The same `ConceptThread` powers Concept Quest.

---

## A5. Complexity / Difficulty Detection

### Purpose

Estimate where a paper is cognitively dense so Learn/Quest mode can offer help.

### Important

This is a reading aid, **not an objective rating of research quality**.

### Initial deterministic signals

Per paragraph/section:

- sentence length
- unusually high symbol/equation density
- citation density
- introduced-term density
- parenthetical density
- rare/repeated technical-term density
- number of referenced prerequisite concepts
- number of figure/table dependencies

Normalize these into a relative difficulty score **within the paper**.

### Output

```ts
export interface LearningRegion {
  id: string;
  sectionId: string;
  pageStart: number;
  pageEnd: number;
  difficulty: number; // 0..1
  reasons: DifficultySignal[];
  concepts: ConceptRef[];
  assets: AssetRef[];
}
```

### UI

Heatmap in Learn/Quest rail:

```text
Introduction        ●
Related Work        ●●
Architecture        ●●●
Attention           ●●●
Experiments         ●●
Conclusion          ●
```

Do not show fake scientific precision such as “83.72% difficult.”

---

## A6. Prerequisite Graph

### Purpose

Help a user understand what concepts may be needed before a difficult concept.

### Example

```text
Vectors
  ↓
Dot product
  ↓
Attention
  ↓
Scaled dot-product attention
  ↓
Multi-head attention
```

### Architecture

```ts
export interface PrerequisiteGraph {
  rootConceptId: string;
  nodes: PrerequisiteNode[];
  edges: PrerequisiteEdge[];
  generated: boolean;
  source: SourceEvidence[];
}
```

### Important

Not every prerequisite relation exists explicitly in a paper. Therefore:

- deterministic in-paper dependencies can be treated as source-derived
- external/general-knowledge prerequisite suggestions must be labeled as generated/suggested

### Game reuse

Prerequisite Run uses the same graph.

---

## A7. Micro Visualizations / “Visualize This”

### Purpose

Create a small local visualization of a selected concept or process.

Examples:

```text
Tokens
 ↓
Q / K / V
 ↓
Attention scores
 ↓
Weighted values
```

### Scope

Developer A owns **micro** visualizations attached to a selection/concept.

Developer B owns **macro** visualizations of papers and research collections.

### Implementation

Prefer a controlled diagram DSL over arbitrary generated HTML.

Example:

```ts
interface MiniDiagram {
  nodes: DiagramNode[];
  edges: DiagramEdge[];
  source: SourceEvidence[];
}
```

Renderer controls style.

Generated systems return data, not raw executable UI.

### Game reuse

The same MiniDiagram can become:

- ordering challenge
- build-the-diagram challenge
- missing-node challenge

---

## A8. Learn Mode

### Adds to Read mode

- difficulty rail
- concept affordances
- contextual learning suggestions
- “I don't understand this”
- optional section checkpoint
- prerequisite/visualize/trace controls

### Must remain non-invasive

No modal should automatically interrupt ordinary scrolling.

---

## A9. Quest Mode

### Purpose

Turn a paper into an active learning path while still requiring reading.

### Structure

```text
Introduction
   ↓ checkpoint
Problem
   ↓ challenge
Method
   ↓ build/trace challenge
Experiments
   ↓ prediction/evidence challenge
Conclusion
   ↓ paper check
```

### Quest generation rules

Prefer 1–2 meaningful checkpoints per major section over constant interruptions.

Do not generate games for every paragraph.

### Quest state

```ts
interface QuestProgress {
  paperId: string;
  completedChallengeIds: string[];
  conceptMastery: Record<string, MasteryState>;
  currentSectionId?: string;
}
```

---

# 8. Developer A — Game catalog and implementation details

## G1. Quick Quiz

Use for:

- definitions
- explicit factual relationships
- architecture components

Requirements:

- answer traceable to evidence
- distractors cannot contradict source ambiguity

## G2. Concept Match

Match concepts to source-grounded definitions/functions.

Good for papers with multiple named components.

## G3. Build the Figure / Build the Diagram

User reconstructs architecture/process from pieces.

### Phase 1

Use MiniDiagram or manually extracted figure-associated components.

### Later

Add controlled figure segmentation if reliable.

Never guess spatial regions of a figure and score them as truth if confidence is low.

## G4. Figure Detective

Hide caption/context and ask targeted questions about a figure/table.

Possible challenge types:

- identify best-performing series/model
- locate a referenced component
- infer simple visible trend
- connect figure to an explicit textual claim

### Safety against hallucination

Questions must be grounded in source caption/context or deterministic table extraction.

## G5. Evidence Hunt

Prompt asks user to locate evidence in the actual paper.

Example:

“Where do the authors explain why multiple attention heads are used?”

User navigates/highlights text.

Scoring can compare:

- expected passage IDs
- section/page overlap
- selected text similarity

Allow partial credit or “close” when appropriate.

## G6. Predict Before Reveal

Use immediately before an experiment/result only when method and result regions can be identified.

Flow:

1. show pre-result context
2. ask prediction
3. reveal actual source result
4. compare

This is not about “correct research intuition” as a global truth; it compares the user prediction to what this paper reports.

## G7. Claim vs Evidence

Given a source-grounded claim, choose which figure/table/passage supports it.

Strong fit for research literacy.

## G8. Paper Quest

Curated sequence of challenges from multiple game types.

Avoid random repetition.

## G9. Paper Check / Boss Battle

End-of-paper assessment.

Suggested categories:

- architecture/method
- terminology
- evidence interpretation
- results
- concept relationships

Return category-level feedback, not a fake universal “research IQ.”

## G10. Paper vs Paper

Cross-paper game once Dev B exposes two-paper contexts.

Examples:

- belongs to Paper A / Paper B / Both
- architecture difference
- benchmark/result comparison

## G11. Timeline Challenge

Uses Dev B lineage/timeline data.

User orders papers/events chronologically.

## G12. Evolution Challenge

Uses actual figures/method nodes across papers.

Ask user to reconstruct an evolution sequence.

---

# 9. Developer B detailed feature specification — Exploration & Workspace

---

## B1. Figure Atlas

### Purpose

Allow visual skimming of a paper through its extracted assets.

### Layout

Group by:

- figure
- table
- algorithm
- section

Each asset shows:

- crop
- label
- caption
- source page
- reverse mentions count

### Clicking

Open source context and optionally pin/compare.

### Boundary

Developer B owns browsing/gallery/compare.

Developer A owns learning interactions *inside* a figure.

---

## B2. Paper Map

### Purpose

Visual structural representation of one paper.

Example:

```text
Paper
├── Introduction
├── Method
│   ├── Figure 1
│   ├── Figure 2
│   └── references
├── Experiments
│   ├── Table 1
│   └── Table 2
└── Conclusion
```

### Deterministic sources

- manifest sections
- assets
- client mention reverse index
- citations

No AI required.

---

## B3. Citation Graph

### Purpose

Move beyond citation links to a navigable research network.

Node: paper.

Edge: citation.

### Initial scope

Current paper + directly openable cited papers.

### Expansion

Recursively load graph as user explores.

Avoid loading an enormous academic graph by default.

---

## B4. Citation Trail

For a citation, expose:

- citing sentence
- cited paper metadata
- where citation appears elsewhere in current paper
- cited-paper source view
- relevant selected figure/section when deterministically available

Do not pretend to know “the reason this citation is used” unless explicitly generated and labeled.

---

## B5. Research Lineage

### Purpose

Visualize development of a method/idea across papers.

### Phase 1

User manually selects papers/concepts.

Use:

- publication dates
- citation edges
- selected figures

### Later

Optional generated concept linkage.

Generated lineage edges must be visually distinguished from literal citation edges.

---

## B6. Paper / Figure Timeline

Chronological research view.

Each point may display:

- paper title
- year
- actual extracted figure
- source link

Do not substitute generated diagrams when the goal is to compare original research figures.

---

## B7. Constellation View

### Purpose

Visually explore papers as nodes/stars.

### Encodings

Possible deterministic encodings:

- edge = citation
- size = local graph degree
- cluster = selected collection or detected metadata group

Do not imply bibliometric importance from node size unless explicitly defined.

---

## B8. Research Collections / Spaces

### Purpose

Group papers for a research topic/project.

Collection contains:

- paper refs
- pinned evidence
- notes
- comparisons
- board positions
- optional learning progress

### Persistence

This is the point where the original “no database” model may need a local structured persistence layer.

For current local-only scope, acceptable options:

```text
data/workspaces/<workspace-id>.json
```

or IndexedDB for browser-first state.

Choose one canonical source of truth.

Do not scatter persistence across localStorage and filesystem simultaneously.

---

## B9. Research Pinboard

Infinite or large canvas for manually organizing:

- figures
- tables
- passages
- equations
- citations
- papers
- user notes

Connections are user-created unless clearly labeled as generated.

### Node reference

Store source reference, not copied detached content only.

```ts
interface BoardNode {
  id: string;
  source?: SourceEvidence;
  note?: string;
  x: number;
  y: number;
}
```

---

## B10. Cross-paper comparison

Support side-by-side comparison of:

- figures
- tables
- passages
- methods

Phase 1 should be user-selected evidence, not automated claim generation.

---

## B11. Dataset / Benchmark Browser

### Goal

Surface original tables/mentions relating to common datasets or benchmarks.

### Phase 1

Use text matching against collection content.

Example:

```text
ImageNet
  ├── ResNet — Table 3
  ├── ViT — Table 2
  └── DeiT — Table 1
```

Avoid prematurely normalizing metrics unless extraction quality is verified.

---

## B12. Cross-paper search

Search within user-loaded collection over:

- paper title
- section title
- extracted text
- captions
- references
- asset labels

Initial search can be lexical.

Semantic search can be added later as optional derived analysis.

---

# 10. Accessibility architecture — primarily Developer B

Accessibility is a first-class product surface, not a settings afterthought.

## 10.1 Reflow / Reader View

Transform two-column PDF text into a semantic reading layout.

Show:

- section hierarchy
- paragraphs
- inline figure references
- buttons to open actual assets
- citation affordances

Always preserve a jump back to original PDF location.

## 10.2 Typography controls

- independent font sizing
- line spacing
- paragraph spacing
- reading width
- contrast
- reduced motion
- optional dyslexia-friendly font selection

## 10.3 Keyboard

All new controls must be keyboard accessible.

Do not create drag-only interactions without keyboard alternatives.

## 10.4 Screen readers

Expose:

- semantic headings
- captions
- figure labels
- source page
- button names with meaning

## 10.5 Read-aloud

Possible navigation model:

- next/previous paragraph
- open referenced figure
- read caption
- open citation
- return to previous position

Read-aloud should consume reflow text, not attempt to infer reading order from canvas pixels.

---

# 11. Cross-team integration contracts

The most important rule:

> **Developer A consumes research data through contracts; Developer B consumes learning selections through contracts. Neither imports the other's UI implementation.**

## Dev B must expose for Dev A

```ts
interface CrossPaperContextProvider {
  getPaper(paperId: string): PaperRef | null;
  getConnectedPapers(paperId: string): PaperRef[];
  getCollectionPapers(collectionId: string): PaperRef[];
  findEvidence(query: EvidenceQuery): SourceEvidence[];
}
```

This powers:

- Paper vs Paper
- timeline games
- evolution games
- cross-paper concept quests

## Dev A must expose for Dev B

```ts
interface LearningContextProvider {
  getConcepts(paperId: string): ConceptRef[];
  getConceptThread(paperId: string, conceptId: string): ConceptThread;
  getDifficultyRegions(paperId: string): LearningRegion[];
}
```

This allows Research Map/Workspace to display learning overlays without importing game components.

---

# 12. Persistence model

Current paper persistence remains:

```text
data/<sha256>/
  paper.pdf
  manifest.json
  crops/
```

Do not destabilize this.

Add separate namespaces for derived/user state.

Suggested:

```text
data/<sha256>/analysis/
  learning.json
  optional-generated.json

data/workspaces/
  <workspace-id>.json

data/progress/
  <paper-or-user-session-id>.json
```

For a local-only single-user build, this remains sufficient.

If accounts/cloud sync are later introduced, persistence can be abstracted behind repositories.

### Repository interfaces

```ts
interface WorkspaceRepository { ... }
interface ProgressRepository { ... }
interface AnalysisRepository { ... }
```

UI should not directly read/write random JSON paths.

---

# 13. Suggested folder architecture

```text
apps/web/
  components/
    reader/
    selection/
    learn/
    games/
      shell/
      multiple-choice/
      concept-match/
      evidence-hunt/
      figure-build/
      figure-detective/
      prediction/
      claim-evidence/
    explore/
      figure-atlas/
      paper-map/
      citation-graph/
      lineage/
      timeline/
      constellation/
    workspace/
      collections/
      pinboard/
      compare/
    accessibility/
      reflow/
      controls/
      read-aloud/

  lib/
    selection/
    research-context/
    learning/
      objects.ts
      concepts.ts
      difficulty.ts
      prerequisites.ts
      threads.ts
    challenges/
      types.ts
      generator.ts
      validator.ts
      scoring.ts
    explore/
      graph.ts
      lineage.ts
      collections.ts
    evidence/
      source.ts
      navigation.ts
    persistence/
      workspace.ts
      progress.ts
      analysis.ts
```

Keep existing modules where they are unless moving them is necessary. Avoid a giant refactor only to achieve this exact folder tree.

---

# 14. Challenge generation pipeline

```text
User selection OR section checkpoint
             ↓
      ResearchContext
             ↓
      Learning Objects
             ↓
Challenge candidate selection
             ↓
 deterministic builder OR optional generator
             ↓
       ChallengeSpec
             ↓
      validation layer
             ↓
         renderer
             ↓
        user answer
             ↓
          scoring
             ↓
      evidence + feedback
```

## Validation layer is mandatory

Before displaying a generated scored challenge:

- required evidence exists
- expected answer exists
- evidence points to valid paper/page
- challenge payload is structurally valid
- choices are distinct
- answer is not duplicated in multiple choices
- confidence exceeds threshold

If validation fails:

- regenerate once, or
- fall back to a deterministic simpler game, or
- render no challenge

Never ship broken interactions just because a model returned JSON.

---

# 15. Difficulty-to-game routing

Do not randomly select games.

Suggested routing:

| Source situation | Preferred interaction |
|---|---|
| Definition-heavy paragraph | Quick Quiz / Concept Match |
| Multiple named components | Concept Match |
| Architecture/process explanation | Build Diagram |
| Figure with explicit caption/context | Figure Detective |
| Experiment setup before result | Predict Before Reveal |
| Explicit claim + referenced asset | Claim vs Evidence |
| User asks “where do they say…” | Evidence Hunt |
| Repeated concept across sections | Concept Quest |
| Multiple related papers | Paper vs Paper |
| Research chronology | Timeline Challenge |
| Architecture evolution | Evolution Challenge |

---

# 16. Visual graph architecture

Developer B should avoid creating separate bespoke graph data models for every visualization.

Use a general graph layer.

```ts
interface ResearchGraph {
  nodes: ResearchGraphNode[];
  edges: ResearchGraphEdge[];
}

interface ResearchGraphNode {
  id: string;
  type: "paper" | "section" | "concept" | "figure" | "table" | "author" | "dataset";
  label: string;
  source?: SourceEvidence;
  metadata: Record<string, unknown>;
}

interface ResearchGraphEdge {
  source: string;
  target: string;
  type:
    | "cites"
    | "contains"
    | "mentions"
    | "uses"
    | "user-connected"
    | "generated-related";
  generated?: boolean;
}
```

### Critical

Literal and inferred relationships must not look identical.

Examples:

- solid line = literal citation
- dashed line = generated/semantic relation
- manual line = user-created connection

Do not visually imply that an inferred relationship is a citation.

---

# 17. Build sequencing to minimize merge conflicts

## Stage 0 — Shared contracts first

Both devs agree on:

- `SourceEvidence`
- `ResearchContext`
- `LearningObject`
- `ChallengeSpec`
- `ResearchGraph`
- persistence interfaces

Keep this stage small.

## Stage 1 — Independent foundations

### Developer A

- selection context
- selection menu
- evidence navigation
- deterministic concept threads
- challenge renderer shell

### Developer B

- Figure Atlas
- Paper Map
- collection model
- reflow prototype

## Stage 2 — Learning + exploration engines

### Developer A

- learning objects
- difficulty regions
- prerequisite graph
- challenge generation

### Developer B

- citation graph
- pinboard
- comparison
- cross-paper provider

## Stage 3 — Modes / advanced views

### Developer A

- Learn mode
- Quest mode
- major games

### Developer B

- lineage
- timeline
- constellation
- research workspace

## Stage 4 — Cross-paper learning integration

Use Dev B's provider for:

- Paper vs Paper
- timeline game
- evolution challenge

## Stage 5 — accessibility, polish, persistence hardening

---

# 18. Git / PR ownership conventions

Recommended branch naming:

```text
learn/selection-context
learn/challenge-engine
learn/quest-mode
explore/figure-atlas
explore/citation-graph
workspace/pinboard
accessibility/reflow
```

## Avoid concurrent edits to

- `Reader.tsx`
- global route shell
- shared schema/types
- existing mention detection

If a feature needs Reader integration, prefer a small hook/slot:

```tsx
<ReaderSelectionLayer />
<ReaderLearningLayer />
<ReaderOverlayLayer />
```

instead of each developer continuously modifying the core reader.

---

# 19. Testing requirements

Existing test-first convention remains.

## Developer A required tests

### Selection

- selected text returns correct page
- correct section resolved
- nearby asset found
- coordinates not double converted

### Concepts

- repeated exact concept creates ordered thread
- ligature normalization works
- hyphenated term works

### Difficulty

- deterministic scoring stable for fixture
- score remains bounded

### Challenge validation

- missing source evidence rejects scored challenge
- duplicate answer choices reject challenge
- invalid page rejects challenge
- evidence navigation opens expected page

### Games

Each game must test:

- rendering valid spec
- correct answer behavior
- incorrect answer behavior
- show-evidence path
- keyboard interaction

## Developer B required tests

### Atlas

- every displayed asset maps to manifest asset
- missing crop does not create broken card

### Graph

- citation edge only created from actual resolved reference
- generated relationships marked generated

### Workspace

- pin source reference survives persistence roundtrip
- deleted paper handled gracefully

### Reflow

- section order stable
- headings represented semantically
- figure references remain linked

---

# 20. Eval strategy

The current extraction and mention evals remain authoritative for their domains.

New eval categories:

## Learning layer

- challenge grounding rate
- invalid challenge rejection rate
- evidence navigation correctness
- deterministic concept-thread precision

## Accessibility

- keyboard-complete flows
- semantic heading checks
- focus-order checks

## Exploration

- graph edge correctness
- source-reference integrity
- workspace persistence roundtrip

Do not invent percentages where no labels exist. Report unmeasured metrics as `UNMEASURED`.

---

# 21. Performance constraints

Research PDFs can be long. Avoid rebuilding whole-paper state on every mouse selection.

## Cache

- pdf.js text content per loaded page
- section lookup indices
- mention reverse index
- normalized term occurrence index
- asset-by-page map
- citation-by-page map

## Lazy-load

- graph neighbors
- cross-paper PDFs
- constellation nodes
- generated challenges
- reflow pages if necessary

## Do not

- request model generation while user merely scrolls
- generate every challenge at paper open
- render every paper in a citation graph as a live PDF

---

# 22. Failure behavior

Marginalia should fail quietly and honestly.

Examples:

### Generation unavailable

Show deterministic reader normally.

### Challenge invalid

Do not display it.

### Cross-paper ref unresolved

Plain citation text.

### Figure unavailable

No figure-dependent game.

### Semantic prerequisite uncertain

Label “suggested prerequisite,” not “required prerequisite.”

### Reflow ordering uncertain

Offer original PDF rather than silently presenting obviously broken reading order.

---

# 23. Feature matrix and ownership

| Feature | Owner | Shared dependency |
|---|---|---|
| Existing figure overlay | Existing/core | none |
| Citation side-by-side | Existing/core + Dev B expansion | refs |
| Selection menu | Dev A | ResearchContext |
| Highlight intelligence | Dev A | pdf.js text |
| “I don’t understand this” | Dev A | learning services |
| Concept Threads | Dev A | text index |
| Difficulty Heatmap | Dev A | sections/text |
| Prerequisite Graph | Dev A | LearningObject |
| Micro Visualize | Dev A | SourceEvidence |
| Learn Mode | Dev A | reader slots |
| Quest Mode | Dev A | challenge engine |
| Quick Quiz | Dev A | ChallengeSpec |
| Concept Match | Dev A | ChallengeSpec |
| Build Figure/Diagram | Dev A | assets/MiniDiagram |
| Figure Detective | Dev A | assets/evidence |
| Evidence Hunt | Dev A | passage navigation |
| Predict Result | Dev A | experiment object |
| Claim vs Evidence | Dev A | claim/evidence objects |
| Paper Check | Dev A | progress |
| Paper vs Paper game | Dev A | Dev B cross-paper provider |
| Timeline game | Dev A | Dev B timeline data |
| Figure Atlas | Dev B | manifest assets |
| Paper Map | Dev B | sections/assets/mentions |
| Citation Graph | Dev B | references |
| Citation Trail | Dev B | refs + reader context |
| Research Lineage | Dev B | graph |
| Paper Timeline | Dev B | metadata |
| Figure Timeline | Dev B | assets + metadata |
| Constellation View | Dev B | graph |
| Collections | Dev B | persistence |
| Pinboard | Dev B | SourceEvidence |
| Cross-paper comparison | Dev B | evidence refs |
| Dataset browser | Dev B | collection index |
| Reflow | Dev B | PDF text/sections |
| Typography accessibility | Dev B | reader |
| Screen-reader structure | Dev B | reflow |
| Read aloud | Dev B | reflow |

---

# 24. What NOT to build / anti-patterns

## Do not create a second extraction pipeline

No duplicate PDF parser for the learning system.

Consume existing extraction + pdf.js text.

## Do not add server-side mentions

Keep the existing language boundary.

## Do not make LLM output authoritative

Generated content supplements source navigation.

## Do not hide source evidence

Every scored generated interaction needs evidence access.

## Do not gamify with meaningless currency first

Avoid prioritizing:

- coins
- leaderboards
- daily streak pressure
- generic XP

before the learning mechanics work.

Mastery should represent interaction with actual concepts, not arbitrary time spent.

## Do not block serious users

Read mode remains clean.

## Do not turn the app into an AI summarizer

The differentiator is interacting with primary research.

## Do not refactor working extraction for aesthetic reasons

Existing extraction has real-paper verification history. Change it only with tests and eval evidence.

## Do not silently infer graph semantics

Citation != semantic similarity != chronology != user-created relation.

Encode edge type explicitly.

---

# 25. Recommended product navigation

Possible top-level structure:

```text
Marginalia

[Read] [Explore] [Workspace]

Read modes:
  Read | Learn | Quest

Explore:
  Paper Map
  Figures
  Citations
  Timeline
  Lineage
  Constellation

Workspace:
  Collections
  Pinboard
  Compare
  Search
```

Avoid putting every feature directly into the PDF toolbar.

---

# 26. Example end-to-end flow

## Scenario: difficult Transformer paragraph

1. User reads in **Read** mode.
2. Highlights “scaled dot-product attention.”
3. Selection layer builds `ResearchContext`.
4. Menu shows `Pin | Trace | Explain | Visualize | Play`.
5. User clicks **Trace**.
6. Dev A concept thread finds occurrences across paper.
7. User opens **Visualize**.
8. MiniDiagram shows Q/K/V -> scores -> weighted values.
9. User clicks **Play**.
10. Challenge router sees architecture/process context.
11. Generates Build Diagram challenge.
12. ChallengeSpec validates evidence.
13. User completes challenge.
14. Feedback includes **Show evidence**.
15. Clicking evidence jumps to original page/paragraph.
16. User later adds Figure 2 to a pinboard.
17. Dev B workspace persists it.
18. User opens a second Transformer-related paper.
19. Dev B cross-paper provider exposes both papers.
20. Dev A can now generate Paper vs Paper challenge.

This is the intended collaboration model between both systems.

---

# 27. Definition of done for the expansion foundation

Before calling the new architecture stable:

## Shared

- canonical contracts exist
- evidence navigation works
- no extraction regressions
- old tests remain green

## Developer A foundation

- selection -> ResearchContext works
- action menu works
- deterministic Concept Thread works
- at least 3 ChallengeSpec renderers work
- every challenge has evidence navigation
- Learn mode can be enabled/disabled

## Developer B foundation

- Figure Atlas works
- Paper Map works
- basic citation graph works
- collection persistence works
- reflow prototype preserves source jumps

## Integration

- Dev A can request cross-paper context without importing Dev B UI
- Dev B can display learning concepts without importing game UI

---

# 28. Final mental model for coding agents

When implementing any feature, ask:

### 1. Is this paper-intrinsic extraction?

If yes -> Python/extraction.

### 2. Is this based on visible pdf.js text interaction?

If yes -> TypeScript/client.

### 3. Is this a learning interpretation of existing evidence?

If yes -> Developer A learning layer.

### 4. Is this organizing/navigating multiple research objects?

If yes -> Developer B exploration/workspace layer.

### 5. Is this generated?

If yes -> optional, labeled, evidence-grounded, validated.

### 6. Is confidence low?

Render less, not more.

### 7. Does this require changing existing extraction/mention logic?

Stop and verify against `AGENTS.md`, `PROJECT_SPEC_1.md`, `SHIP_PLAN.md`, tests, and evals before touching it.

---

# 29. Core product thesis

Marginalia should not become “ChatGPT beside a PDF.”

It should become a research environment where the paper remains the authority and the interface makes that paper dramatically easier to navigate, compare, understand, and learn from.

The best summary of the expanded product is:

> **Marginalia turns static research papers into connected, explorable, accessible, and interactive knowledge — without losing the source.**

And for the learning/game layer:

> **Don’t just read the paper. Play with the ideas — and always be able to jump back to the evidence.**
