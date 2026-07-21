"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { digestOf, fetchArxiv, uploadPdf } from "../lib/api";
import type { Manifest } from "../lib/manifest";

export default function Home() {
  const router = useRouter();
  const [arxivId, setArxivId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const open = async (work: Promise<Manifest>) => {
    setBusy(true);
    setError(null);
    try {
      router.push(`/read/${digestOf(await work)}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      setBusy(false);
    }
  };

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center gap-8 p-8">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Marginalia</h1>
        <p className="mt-2 text-neutral-600 dark:text-neutral-400">
          A paper reader that keeps figures next to the sentence that references them.
          Click any &ldquo;Figure 1&rdquo; and it opens in place, and stays there while you
          keep reading.
        </p>
      </div>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (arxivId.trim()) void open(fetchArxiv(arxivId.trim()));
        }}
        className="flex gap-2"
      >
        <input
          value={arxivId}
          onChange={(event) => setArxivId(event.target.value)}
          placeholder="arXiv id or URL, e.g. 1706.03762"
          className="flex-1 rounded border border-neutral-300 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900"
        />
        <button
          type="submit"
          disabled={busy || !arxivId.trim()}
          className="rounded bg-sky-600 px-4 py-2 text-white disabled:opacity-40"
        >
          Open
        </button>
      </form>

      <label className="cursor-pointer rounded border border-dashed border-neutral-400 p-8 text-center hover:bg-neutral-100 dark:border-neutral-600 dark:hover:bg-neutral-900">
        <input
          type="file"
          accept="application/pdf"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void open(uploadPdf(file));
          }}
        />
        <span className="text-sm text-neutral-600 dark:text-neutral-400">
          …or choose a PDF to upload
        </span>
      </label>

      {busy && (
        <p className="text-sm opacity-60">
          Extracting… the first read of a paper takes a moment; after that it is instant.
        </p>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}
    </main>
  );
}
