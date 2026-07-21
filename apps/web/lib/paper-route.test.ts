import { describe, expect, it } from "vitest";
import { readerDocumentTarget } from "./paper-route";

describe("reader document routing", () => {
  it("accepts canonical and prefixed digests", () => {
    const digest = "A".repeat(64);
    expect(readerDocumentTarget(digest)).toEqual({ kind: "digest", digest: digest.toLowerCase() });
    expect(readerDocumentTarget(`sha256:${digest}`)).toEqual({ kind: "digest", digest: digest.toLowerCase() });
  });

  it("resolves modern arXiv ids instead of sending them to the digest endpoint", () => {
    expect(readerDocumentTarget("1706.03762")).toEqual({ kind: "arxiv", arxivId: "1706.03762" });
    expect(readerDocumentTarget("1706.03762v7")).toEqual({ kind: "arxiv", arxivId: "1706.03762v7" });
  });

  it("fails closed for malformed ids", () => {
    expect(readerDocumentTarget("not-a-paper")).toEqual({ kind: "invalid" });
  });
});
