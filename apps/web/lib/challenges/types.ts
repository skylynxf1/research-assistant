import type { SourceEvidence } from "../evidence/source";

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

export interface ChallengeChoice {
  id: string;
  label: string;
}

export interface MultipleChoicePayload {
  kind: "multiple-choice";
  choices: ChallengeChoice[];
  multiple?: boolean;
}

export interface ConceptMatchPayload {
  kind: "concept-match";
  concepts: ChallengeChoice[];
  definitions: ChallengeChoice[];
}

export interface OrderingPayload {
  kind: "ordering";
  items: ChallengeChoice[];
}

export type ChallengePayload = MultipleChoicePayload | ConceptMatchPayload | OrderingPayload;

export type ChallengeAnswer =
  | { kind: "choice"; choiceIds: string[] }
  | { kind: "pairs"; pairs: Record<string, string> }
  | { kind: "order"; itemIds: string[] };

export interface ChallengeHint {
  id: string;
  text: string;
}

export interface ChallengeScoring {
  maxPoints: number;
  partialCredit: boolean;
}

export interface GenerationMetadata {
  generated: true;
  model?: string;
  createdAt: string;
  groundedEvidenceIds: string[];
  confidence?: number;
}

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

export interface ChallengeScore {
  correct: boolean;
  points: number;
  maxPoints: number;
}
