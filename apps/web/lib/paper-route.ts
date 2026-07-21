export type ReaderDocumentTarget =
  | { kind: "digest"; digest: string }
  | { kind: "arxiv"; arxivId: string }
  | { kind: "invalid" };

const DIGEST_PATTERN = /^[a-f0-9]{64}$/i;
const ARXIV_PATTERN = /^\d{4}\.\d{4,5}(?:v\d+)?$/i;

/** Accept canonical content hashes and convenient modern arXiv ids at the Reader route. */
export function readerDocumentTarget(value: string): ReaderDocumentTarget {
  const trimmed = value.trim();
  const digest = trimmed.replace(/^sha256:/i, "");
  if (DIGEST_PATTERN.test(digest)) return { kind: "digest", digest: digest.toLowerCase() };
  if (ARXIV_PATTERN.test(trimmed)) return { kind: "arxiv", arxivId: trimmed };
  return { kind: "invalid" };
}
