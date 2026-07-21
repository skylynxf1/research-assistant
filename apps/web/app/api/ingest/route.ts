import { NextResponse } from "next/server";

import { API_BASE } from "../../../lib/api";

const DIGEST_PATTERN = /^sha256:([a-f0-9]{64})$/;

function homeWithError(request: Request, message: string) {
  const destination = new URL("/", request.url);
  destination.searchParams.set("error", message);
  return NextResponse.redirect(destination, 303);
}

export async function POST(request: Request) {
  try {
    const submitted = await request.formData();
    const forwarded = new FormData();
    const file = submitted.get("file");
    const arxivId = submitted.get("arxiv_id");

    if (file instanceof File && file.size > 0) {
      forwarded.set("file", file);
    } else if (typeof arxivId === "string" && arxivId.trim()) {
      forwarded.set("arxiv_id", arxivId.trim());
    } else {
      return homeWithError(request, "Choose a PDF or enter an arXiv id.");
    }

    const response = await fetch(`${API_BASE}/api/papers`, {
      method: "POST",
      body: forwarded,
      cache: "no-store",
    });
    if (!response.ok) {
      const body = await response.json().catch(() => null);
      throw new Error(body?.detail ?? `Extraction failed (${response.status}).`);
    }

    const manifest = (await response.json()) as { doc_id?: unknown };
    const match = typeof manifest.doc_id === "string" && manifest.doc_id.match(DIGEST_PATTERN);
    if (!match) throw new Error("The extraction service returned an invalid paper id.");

    return NextResponse.redirect(new URL(`/read/${match[1]}`, request.url), 303);
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "Could not open that paper.";
    return homeWithError(request, message);
  }
}
