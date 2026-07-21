/* GENERATED from manifest.schema.json by 'npm run gen:schema'. Do not edit by hand. */

/**
 * Normalized [x0, y0, x1, y1] in [0,1] with origin at the TOP-LEFT of the page. PDF native coordinates are bottom-left origin; the conversion happens exactly once, in extract/geometry.py.
 *
 * @minItems 4
 * @maxItems 4
 */
export type BBox = [number, number, number, number];

/**
 * The single artifact the Marginalia extraction pipeline produces for one PDF. The client is a dumb renderer over this document (spec D3). Note there is deliberately no `mentions` array: mention detection is client-side (plan deviation 1).
 */
export interface Manifest {
  /**
   * Content hash of the PDF bytes (spec D1). Format: sha256:<64 hex chars>.
   */
  doc_id: string;
  source: Source;
  /**
   * From PDF metadata or a first-page heuristic. Empty string when unknown.
   */
  title: string;
  page_count: number;
  pages: Page[];
  assets: Asset[];
  references: Reference[];
  sections: Section[];
  extraction: Extraction;
}
export interface Source {
  type: "upload" | "arxiv";
  /**
   * e.g. 1706.03762v7. Null for uploads.
   */
  arxiv_id: string | null;
}
export interface Page {
  /**
   * 0-based.
   */
  index: number;
  width_pt: number;
  height_pt: number;
}
/**
 * A figure, table, or algorithm extracted from the paper.
 */
export interface Asset {
  /**
   * Stable id, e.g. fig-1, tab-2, fig-3a.
   */
  asset_id: string;
  kind: "figure" | "table" | "algorithm" | "equation";
  /**
   * Normalized display label, e.g. 'Figure 1'.
   */
  label: string;
  /**
   * Surface number: '1', '2a', 'S3', 'A.1'. String because appendix numbering is not integral.
   */
  number: string;
  /**
   * 0-based.
   */
  page: number;
  bbox: BBox;
  caption: string;
  /**
   * Used client-side to suppress caption self-reference mentions. Null only if the caption position is unknown.
   */
  caption_bbox: BBox | null;
  /**
   * Path to the rendered crop, e.g. /blob/<hash>/crops/fig-1.png.
   */
  image_url: string;
  /**
   * Pixel width of the crop, rendered at 300 DPI.
   */
  image_width: number;
  /**
   * Set on subfigures: fig-3a has parent_id fig-3 (plan decision on spec open question 12.2).
   */
  parent_id: string | null;
}
export interface Reference {
  ref_id: string;
  /**
   * Inline marker that points here: '12' for numeric styles, 'Vaswani et al., 2017' for author-year.
   */
  marker: string;
  /**
   * The full reference string as it appears in the bibliography.
   */
  raw: string;
  title: string | null;
  authors: string[];
  year: number | null;
  /**
   * Null when unresolved. Never render an open affordance in that case.
   */
  arxiv_id: string | null;
  /**
   * True only when the cited paper can actually be fetched and rendered side-by-side. Precision-first: never render a dead button.
   */
  openable: boolean;
}
export interface Section {
  title: string;
  /**
   * 0-based.
   */
  page: number;
  level: number;
}
export interface Extraction {
  version: string;
  figure_backend: "caption-heuristic" | "docling" | "pdffigures2";
  warnings: string[];
}
