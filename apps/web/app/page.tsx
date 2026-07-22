import IngestForms from "../components/IngestForms";

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

      <IngestForms initialError={error} />
    </main>
  );
}
