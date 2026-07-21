type HomeProps = {
  searchParams: Promise<{ error?: string }>;
};

export default async function Home({ searchParams }: HomeProps) {
  const { error } = await searchParams;

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

      <form action="/api/ingest" method="post" className="flex gap-2">
        <input
          name="arxiv_id"
          required
          placeholder="arXiv id or URL, e.g. 1706.03762"
          className="flex-1 rounded border border-neutral-300 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900"
        />
        <button type="submit" className="rounded bg-sky-600 px-4 py-2 text-white">
          Open
        </button>
      </form>

      <form
        action="/api/ingest"
        method="post"
        encType="multipart/form-data"
        className="flex flex-col gap-3"
      >
        <label className="cursor-pointer rounded border border-dashed border-neutral-400 p-8 text-center hover:bg-neutral-100 dark:border-neutral-600 dark:hover:bg-neutral-900">
          <input type="file" name="file" accept="application/pdf" required className="block w-full text-sm" />
          <span className="mt-3 block text-sm text-neutral-600 dark:text-neutral-400">
            Choose a PDF to upload
          </span>
        </label>
        <button type="submit" className="rounded bg-sky-600 px-4 py-2 text-white">
          Upload PDF
        </button>
      </form>

      {error && <p className="text-sm text-red-600">{error}</p>}
    </main>
  );
}
