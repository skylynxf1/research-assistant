/** Thin client over the FastAPI service. Local-only, so no auth and no retries. */

import type { Manifest } from "./manifest";

export const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "http://127.0.0.1:8000";

export class ApiError extends Error {}

async function unwrap(response: Response): Promise<Manifest> {
  if (!response.ok) {
    const detail = await response
      .json()
      .then((body) => body?.detail)
      .catch(() => null);
    throw new ApiError(detail ?? `request failed (${response.status})`);
  }
  return response.json();
}

/** Upload a PDF. Returns immediately for a paper that has been extracted before. */
export async function uploadPdf(file: File): Promise<Manifest> {
  const form = new FormData();
  form.append("file", file);
  return unwrap(await fetch(`${API_BASE}/api/papers`, { method: "POST", body: form }));
}

/** Ingest by arXiv id, URL, or "arXiv:xxxx" string; the server normalizes it. */
export async function fetchArxiv(arxivId: string): Promise<Manifest> {
  const form = new FormData();
  form.append("arxiv_id", arxivId);
  return unwrap(await fetch(`${API_BASE}/api/papers`, { method: "POST", body: form }));
}

export async function loadManifest(digest: string): Promise<Manifest> {
  return unwrap(await fetch(`${API_BASE}/api/papers/${digest}`));
}

export const blobUrl = (path: string) => `${API_BASE}${path}`;
export const pdfUrl = (digest: string) => `${API_BASE}/blob/${digest}/paper.pdf`;
export const digestOf = (manifest: Manifest) => manifest.doc_id.replace("sha256:", "");
