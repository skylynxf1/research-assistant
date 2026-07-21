import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { passageEvidence } from "../../lib/evidence/source";
import { createEvidenceResolver } from "../../lib/evidence/resource";
import type { Manifest } from "../../lib/manifest";
import { getPaperLearningIndex, type PaperLearningPage } from "../../lib/learning/paper-index";
import { challengeEvidence, type ChallengeSpec } from "../../lib/challenges/contracts";
import ChallengeRendererShell from "./ChallengeRendererShell";

const manifest = {
  doc_id: "sha256:renderer-paper",
  source: { type: "upload", arxiv_id: null },
  title: "Renderer paper",
  page_count: 1,
  pages: [{ index: 0, width_pt: 600, height_pt: 800 }],
  assets: [],
  references: [],
  sections: [{ title: "Method", page: 0, level: 1 }],
  extraction: { version: "1", figure_backend: "caption-heuristic", warnings: [] },
} as Manifest;

const pages: PaperLearningPage[] = [{
  items: [{ str: "Attention mixes values.", hasEOL: true, rect: [0.1, 0.2, 0.8, 0.24] }],
  mentions: [],
  citations: [],
}];

function validChallenge(): ChallengeSpec {
  const index = getPaperLearningIndex(manifest, pages);
  const passage = index.passages[0];
  const evidence = challengeEvidence(
    passageEvidence(index.paperId, passage.page, passage.text, { bbox: passage.bbox, sectionId: passage.sectionId }),
    "The paper defines the relationship in this passage.",
    { kind: "passage", resourceId: passage.id },
  );
  return {
    id: "challenge-1",
    type: "multiple-choice",
    mode: "scored",
    paperIds: [index.paperId],
    concepts: ["attention"],
    evidence: [evidence],
    prompt: "What does attention mix?",
    difficulty: "easy",
    payload: { kind: "multiple-choice", choices: [{ id: "values", label: "Values" }, { id: "pages", label: "Pages" }] },
    answer: {
      kind: "choice",
      correctChoiceIds: ["values"],
      relationships: [{ id: "choice:values", evidenceIds: [evidence.id], reason: evidence.reason }],
    },
    hints: [],
    scoring: { maxPoints: 1, partialCredit: false },
  };
}

const resolver = createEvidenceResolver([getPaperLearningIndex(manifest, pages)]);

describe("ChallengeRendererShell", () => {
  it("renders a valid source-grounded challenge with resolved evidence metadata", () => {
    const markup = renderToStaticMarkup(
      <ChallengeRendererShell
        challenge={validChallenge()}
        resolver={resolver}
        onNavigateEvidence={() => undefined}
      />,
    );

    expect(markup).toContain("What does attention mix?");
    expect(markup).toContain("Values");
    expect(markup).toContain("Passage / p. 1 / Method");
    expect(markup).toContain("The paper defines the relationship");
  });

  it("renders nothing when fail-closed validation rejects the scored challenge", () => {
    const challenge = validChallenge();
    if (challenge.mode !== "scored") throw new Error("Expected a scored fixture.");
    challenge.evidence = [];
    expect(
      renderToStaticMarkup(
        <ChallengeRendererShell challenge={challenge} resolver={resolver} onNavigateEvidence={() => undefined} />,
      ),
    ).toBe("");
  });
});