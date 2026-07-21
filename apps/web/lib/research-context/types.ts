import type {
  AssetRef as SharedAssetRef,
  ConceptRef as SharedConceptRef,
  NormalizedBBox,
  PaperRef as SharedPaperRef,
  PassageRef as SharedPassageRef,
  SectionRef as SharedSectionRef,
} from "../evidence/source";

export type { NormalizedBBox } from "../evidence/source";

/** Learning-local metadata extends the shared paper identity; it does not replace it. */
export interface PaperRef extends SharedPaperRef {
  sourceType: "upload" | "arxiv";
}

export interface TextItemRange {
  itemIndex: number;
  startOffset: number;
  endOffset: number;
}

export interface SelectionContext {
  text: string;
  page: number;
  itemRanges: TextItemRange[];
  bbox?: NormalizedBBox;
}

export interface SectionRef extends SharedSectionRef {}

export interface PassageRef extends SharedPassageRef {
  id: string;
  itemRanges: TextItemRange[];
}

/** Learning needs geometry/caption context in addition to the shared asset pointer. */
export interface AssetRef extends SharedAssetRef {
  bbox: NormalizedBBox;
  caption: string;
}

export interface CitationRef {
  refIds: string[];
  text: string;
  page: number;
  bbox?: NormalizedBBox;
  openable: boolean;
}

export interface MentionRef {
  assetId?: string;
  kind: string;
  number: string;
  text: string;
  page: number;
  bbox?: NormalizedBBox;
}

export interface ConceptRef extends SharedConceptRef {
  paperId: string;
}

export interface SourceWindow {
  before: PassageRef[];
  selected?: PassageRef;
  after: PassageRef[];
}

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

export type SourceEvidence = import("../evidence/source").SourceEvidence;
