"use client";

import { useEffect, useMemo, useState } from "react";
import { loadManifest } from "../../lib/api";
import { paperRefOf, type PaperRef, type SourceEvidence } from "../../lib/evidence/source";
import {
  addNoteToCollection,
  addPaperToCollection,
  createCollection,
  renameCollection,
} from "../../lib/workspace/collections";
import { IndexedDbWorkspaceRepository } from "../../lib/workspace/indexed-db";
import type { ResearchCollection } from "../../lib/workspace/types";
import { collectionHasPaper, collectionRows } from "../../lib/workspace/view-model";

interface CollectionCardProps {
  collection: ResearchCollection;
  availablePaperIds: ReadonlySet<string>;
  candidate: PaperRef | null;
  onSave(collection: ResearchCollection): Promise<void>;
  onDelete(id: string): Promise<void>;
}

function CollectionCard({
  collection,
  availablePaperIds,
  candidate,
  onSave,
  onDelete,
}: CollectionCardProps) {
  const [name, setName] = useState(collection.name);
  const [note, setNote] = useState("");
  const [sourcePaperId, setSourcePaperId] = useState(collection.papers[0]?.paperId ?? "");
  const [sourcePage, setSourcePage] = useState("1");
  const rows = collectionRows([collection], availablePaperIds)[0].papers;

  return (
    <article className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
      <form
        className="flex flex-wrap gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          void onSave(renameCollection(collection, name));
        }}
      >
        <label className="sr-only" htmlFor={`name-${collection.id}`}>
          Collection name
        </label>
        <input
          id={`name-${collection.id}`}
          value={name}
          onChange={(event) => setName(event.target.value)}
          className="min-w-0 flex-1 rounded border border-neutral-300 px-3 py-2 font-medium dark:border-neutral-700 dark:bg-neutral-950"
        />
        <button className="rounded border px-3 py-2 text-sm hover:bg-neutral-100 dark:hover:bg-neutral-800">
          Rename
        </button>
        <button
          type="button"
          className="rounded border border-red-300 px-3 py-2 text-sm text-red-700 hover:bg-red-50 dark:border-red-900 dark:text-red-300 dark:hover:bg-red-950"
          onClick={() => {
            if (window.confirm(`Delete “${collection.name}”? This cannot be undone.`)) {
              void onDelete(collection.id);
            }
          }}
        >
          Delete
        </button>
      </form>

      {candidate && !collectionHasPaper(collection, candidate.paperId) && (
        <button
          type="button"
          className="mt-4 rounded bg-sky-600 px-3 py-2 text-sm text-white hover:bg-sky-500"
          onClick={() => void onSave(addPaperToCollection(collection, candidate))}
        >
          Add “{candidate.title || "Untitled paper"}”
        </button>
      )}

      <section className="mt-5" aria-labelledby={`papers-${collection.id}`}>
        <h2 id={`papers-${collection.id}`} className="text-xs font-semibold uppercase tracking-wide opacity-60">
          Papers
        </h2>
        {rows.length === 0 ? (
          <p className="mt-2 text-sm opacity-60">No papers yet.</p>
        ) : (
          <ul className="mt-2 space-y-2">
            {rows.map(({ paper, available }) => (
              <li key={paper.paperId} className="rounded bg-neutral-50 p-3 text-sm dark:bg-neutral-950">
                <div className="font-medium">{paper.title || "Untitled paper"}</div>
                {available ? (
                  <div className="mt-1 flex gap-3">
                    <a className="text-sky-700 hover:underline dark:text-sky-300" href={`/read/${paper.paperId}`}>
                      Read
                    </a>
                    <a className="text-sky-700 hover:underline dark:text-sky-300" href={`/explore/${paper.paperId}`}>
                      Explore
                    </a>
                  </div>
                ) : (
                  <p className="mt-1 text-amber-700 dark:text-amber-300">Unavailable locally</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <nav className="mt-5 flex gap-2 border-t border-neutral-200 pt-4 text-sm dark:border-neutral-800" aria-label={`${collection.name} workspace tools`}>
        <a href={`/workspace/collections/${collection.id}/board`} className="rounded border px-3 py-2 hover:bg-neutral-100 dark:hover:bg-neutral-800">Open pinboard</a>
        <a href={`/workspace/collections/${collection.id}/compare`} className="rounded border px-3 py-2 hover:bg-neutral-100 dark:hover:bg-neutral-800">Compare evidence</a>
        <a href={`/workspace/collections/${collection.id}/research`} className="rounded border px-3 py-2 hover:bg-neutral-100 dark:hover:bg-neutral-800">Research views</a>
      </nav>

      <section className="mt-5" aria-labelledby={`notes-${collection.id}`}>
        <h2 id={`notes-${collection.id}`} className="text-xs font-semibold uppercase tracking-wide opacity-60">
          Notes
        </h2>
        <form
          className="mt-2 grid gap-2 sm:grid-cols-[1fr_auto_auto]"
          onSubmit={(event) => {
            event.preventDefault();
            const source: SourceEvidence | undefined = sourcePaperId
              ? {
                  paperId: sourcePaperId,
                  page: Math.max(0, Number.parseInt(sourcePage, 10) - 1 || 0),
                  kind: "passage",
                }
              : undefined;
            const updated = addNoteToCollection(collection, note, source);
            if (updated !== collection) {
              setNote("");
              void onSave(updated);
            }
          }}
        >
          <label className="sr-only" htmlFor={`note-${collection.id}`}>New note</label>
          <input
            id={`note-${collection.id}`}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Add a note"
            className="rounded border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-950"
          />
          <label className="sr-only" htmlFor={`source-${collection.id}`}>Source paper</label>
          <select
            id={`source-${collection.id}`}
            value={sourcePaperId}
            onChange={(event) => setSourcePaperId(event.target.value)}
            className="rounded border border-neutral-300 px-2 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-950"
          >
            <option value="">No source</option>
            {collection.papers.map((paper) => (
              <option key={paper.paperId} value={paper.paperId}>{paper.title}</option>
            ))}
          </select>
          <div className="flex gap-2">
            <label className="sr-only" htmlFor={`page-${collection.id}`}>Source page</label>
            <input
              id={`page-${collection.id}`}
              type="number"
              min="1"
              value={sourcePage}
              onChange={(event) => setSourcePage(event.target.value)}
              title="Source page"
              className="w-20 rounded border border-neutral-300 px-2 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-950"
            />
            <button className="rounded border px-3 py-2 text-sm hover:bg-neutral-100 dark:hover:bg-neutral-800">Add</button>
          </div>
        </form>
        <ul className="mt-3 space-y-2">
          {collection.notes.map((item) => (
            <li key={item.id} className="border-l-2 border-sky-500 pl-3 text-sm">
              <p>{item.text}</p>
              {item.source && (
                <a
                  href={`/read/${item.source.paperId}#page=${item.source.page}`}
                  className="mt-1 inline-block text-xs text-sky-700 hover:underline dark:text-sky-300"
                >
                  Show source, page {item.source.page + 1} →
                </a>
              )}
            </li>
          ))}
        </ul>
      </section>
    </article>
  );
}

export default function WorkspaceShell({ digest }: { digest?: string }) {
  const repository = useMemo(() => new IndexedDbWorkspaceRepository(), []);
  const [collections, setCollections] = useState<ResearchCollection[]>([]);
  const [candidate, setCandidate] = useState<PaperRef | null>(null);
  const [availablePaperIds, setAvailablePaperIds] = useState<Set<string>>(new Set());
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const stored = await repository.listCollections();
        const ids = new Set(stored.flatMap((collection) => collection.papers.map(({ paperId }) => paperId)));
        if (digest) ids.add(digest);
        const resolved = await Promise.allSettled([...ids].map((paperId) => loadManifest(paperId)));
        if (cancelled) return;
        const available = new Set<string>();
        for (const result of resolved) {
          if (result.status === "fulfilled") available.add(paperRefOf(result.value).paperId);
        }
        setCollections(stored);
        setAvailablePaperIds(available);
        if (digest) {
          const match = resolved[[...ids].indexOf(digest)];
          if (match?.status === "fulfilled") setCandidate(paperRefOf(match.value));
        }
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : String(cause));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [digest, repository]);

  const save = async (collection: ResearchCollection) => {
    try {
      await repository.saveCollection(collection);
      setCollections((current) => [collection, ...current.filter(({ id }) => id !== collection.id)]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  };

  const remove = async (id: string) => {
    try {
      await repository.deleteCollection(id);
      setCollections((current) => current.filter((collection) => collection.id !== id));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  };

  return (
    <main className="min-h-screen bg-neutral-100 p-4 text-neutral-950 dark:bg-neutral-950 dark:text-neutral-100 sm:p-8">
      <div className="mx-auto max-w-4xl">
        <header className="flex flex-wrap items-center gap-3">
          {digest && <a href={`/explore/${digest}`} className="text-sm text-sky-700 hover:underline dark:text-sky-300">← Explore paper</a>}
          <div>
            <h1 className="text-2xl font-semibold">Research workspace</h1>
            <p className="mt-1 text-sm opacity-65">Collections and evidence stay in this browser.</p>
          </div>
        </header>

        <form
          className="mt-6 flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (!name.trim()) return;
            const collection = createCollection(name);
            setName("");
            void save(candidate ? addPaperToCollection(collection, candidate) : collection);
          }}
        >
          <label className="sr-only" htmlFor="new-collection">New collection name</label>
          <input
            id="new-collection"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="New collection name"
            className="min-w-0 flex-1 rounded border border-neutral-300 bg-white px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900"
          />
          <button disabled={!name.trim()} className="rounded bg-sky-600 px-4 py-2 text-white disabled:opacity-40">Create</button>
        </form>

        {error && <p role="alert" className="mt-4 rounded bg-red-50 p-3 text-sm text-red-800 dark:bg-red-950 dark:text-red-200">{error}</p>}
        {loading ? (
          <p className="mt-8 opacity-60">Loading workspace…</p>
        ) : collections.length === 0 ? (
          <p className="mt-8 rounded border border-dashed border-neutral-400 p-8 text-center opacity-65">Create a collection to organize papers and source-linked notes.</p>
        ) : (
          <div className="mt-6 grid gap-4">
            {collectionRows(collections, availablePaperIds).map(({ collection }) => (
              <CollectionCard
                key={collection.id}
                collection={collection}
                availablePaperIds={availablePaperIds}
                candidate={candidate}
                onSave={save}
                onDelete={remove}
              />
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
