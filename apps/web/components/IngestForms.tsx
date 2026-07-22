"use client";

import { type FormEvent, useState } from "react";

import { digestOf, fetchArxiv, uploadPdf } from "../lib/api";

type Props = {
  initialError?: string;
};

export default function IngestForms({ initialError }: Props) {
  const [busy, setBusy] = useState<"arxiv" | "upload" | null>(null);
  const [error, setError] = useState<string | null>(initialError ?? null);

  const run = async (kind: "arxiv" | "upload", operation: () => ReturnType<typeof fetchArxiv>) => {
    setBusy(kind);
    setError(null);
    try {
      const manifest = await operation();
      window.location.assign(`/read/${digestOf(manifest)}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not open that paper.");
      setBusy(null);
    }
  };

  const submitArxiv = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const value = new FormData(event.currentTarget).get("arxiv_id");
    if (typeof value !== "string" || !value.trim()) return;
    void run("arxiv", () => fetchArxiv(value.trim()));
  };

  const submitPdf = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const value = new FormData(event.currentTarget).get("file");
    if (!(value instanceof File) || value.size === 0) return;
    void run("upload", () => uploadPdf(value));
  };

  return (
    <div className="grid gap-6">
      <form onSubmit={submitArxiv} className="flex gap-2">
        <input
          name="arxiv_id"
          required
          disabled={busy !== null}
          placeholder="arXiv id or URL"
          className="flex-1 rounded border border-neutral-300 px-3 py-2 disabled:opacity-60 dark:border-neutral-700 dark:bg-neutral-900"
        />
        <button disabled={busy !== null} type="submit" className="rounded bg-sky-600 px-4 py-2 text-white disabled:opacity-60">
          {busy === "arxiv" ? "Opening…" : "Open"}
        </button>
      </form>

      <form onSubmit={submitPdf} className="flex flex-col gap-3">
        <label className="cursor-pointer rounded border border-dashed border-neutral-400 p-8 text-center hover:bg-neutral-100 dark:border-neutral-600 dark:hover:bg-neutral-900">
          <input disabled={busy !== null} type="file" name="file" accept="application/pdf" required className="block w-full text-sm" />
          <span className="mt-3 block text-sm text-neutral-600 dark:text-neutral-400">
            Choose a PDF to upload directly to the extraction service
          </span>
        </label>
        <button disabled={busy !== null} type="submit" className="rounded bg-sky-600 px-4 py-2 text-white disabled:opacity-60">
          {busy === "upload" ? "Extracting…" : "Upload PDF"}
        </button>
      </form>

      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
