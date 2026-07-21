import { afterEach, describe, expect, it, vi } from "vitest";

import { POST } from "./route";

describe("POST /api/ingest", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("forwards an arXiv id to the extraction API and redirects to the reader", async () => {
    const digest = "a".repeat(64);
    const upstream = vi.fn().mockResolvedValue(
      Response.json({ doc_id: `sha256:${digest}` }),
    );
    vi.stubGlobal("fetch", upstream);

    const form = new FormData();
    form.set("arxiv_id", "1706.03762");
    const request = new Request("http://localhost/api/ingest", {
      method: "POST",
      body: form,
    });

    const response = await POST(request);

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(`http://localhost/read/${digest}`);
    expect(upstream).toHaveBeenCalledWith(
      expect.stringMatching(/\/api\/papers$/),
      expect.objectContaining({ method: "POST" }),
    );
    const forwarded = upstream.mock.calls[0]?.[1]?.body as FormData;
    expect(forwarded.get("arxiv_id")).toBe("1706.03762");
  });

  it("forwards a selected PDF to the extraction API", async () => {
    const digest = "b".repeat(64);
    const upstream = vi.fn().mockResolvedValue(
      Response.json({ doc_id: `sha256:${digest}` }),
    );
    vi.stubGlobal("fetch", upstream);

    const form = new FormData();
    form.set("file", new File(["%PDF-test"], "paper.pdf", { type: "application/pdf" }));
    const request = new Request("http://localhost/api/ingest", {
      method: "POST",
      body: form,
    });

    const response = await POST(request);

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(`http://localhost/read/${digest}`);
    const forwarded = upstream.mock.calls[0]?.[1]?.body as FormData;
    expect((forwarded.get("file") as File).name).toBe("paper.pdf");
  });

  it("redirects back with a useful error when extraction fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json({ detail: "That arXiv paper was not found." }, { status: 404 }),
      ),
    );
    const form = new FormData();
    form.set("arxiv_id", "missing");

    const response = await POST(
      new Request("http://localhost/api/ingest", { method: "POST", body: form }),
    );

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "http://localhost/?error=That+arXiv+paper+was+not+found.",
    );
  });
});
