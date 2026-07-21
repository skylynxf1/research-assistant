import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import Home from "./page";

describe("Home", () => {
  it("renders working native forms for arXiv ids and PDF uploads", async () => {
    const page = await Home({ searchParams: Promise.resolve({}) });
    const markup = renderToStaticMarkup(page);

    expect(markup).toContain('action="/api/ingest"');
    expect(markup).toContain('name="arxiv_id"');
    expect(markup).toContain('name="file"');
    expect(markup).toContain('encType="multipart/form-data"');
    expect(markup).toContain("Upload PDF");
  });

  it("shows an ingestion error returned through the redirect", async () => {
    const page = await Home({
      searchParams: Promise.resolve({ error: "Could not open that paper." }),
    });

    expect(renderToStaticMarkup(page)).toContain("Could not open that paper.");
  });
});
