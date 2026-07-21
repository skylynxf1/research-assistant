/**
 * Manifest types.
 *
 * Re-exported from the generated file so application code imports one stable path. The
 * generated types come from packages/schema/manifest.schema.json via `npm run gen:schema`
 * and must never be hand-edited: the schema is the contract between Python and this app.
 */

export type {
  Asset,
  BBox,
  Extraction,
  Manifest,
  Page,
  Reference,
  Section,
  Source,
} from "../../../packages/schema/manifest";
