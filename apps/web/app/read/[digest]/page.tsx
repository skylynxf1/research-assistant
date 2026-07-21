"use client";

import dynamic from "next/dynamic";
import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { digestOf, fetchArxiv } from "../../../lib/api";
import { readerDocumentTarget } from "../../../lib/paper-route";

/*
 * pdf.js touches DOM APIs (DOMMatrix, canvas) as soon as it is imported, so the reader
 * must never be rendered on the server - marking it "use client" is not enough, since
 * client components are still server-rendered for the initial HTML.
 */
const Reader = dynamic(() => import("../../../components/Reader"), {
  ssr: false,
  loading: () => <p className="p-8 opacity-60">Loading reader…</p>,
});

function ArxivReaderRedirect({ arxivId }: { arxivId: string }) {
  const started = useRef(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    let active = true;
    void fetchArxiv(arxivId)
      .then((manifest) => {
        if (active) window.location.replace(`/read/${digestOf(manifest)}`);
      })
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : "Could not resolve this arXiv paper.");
      });
    return () => { active = false; };
  }, [arxivId]);

  if (error) return <p className="p-8 text-sm text-red-700 dark:text-red-300">Could not open this paper: {error}</p>;
  return <p className="p-8 opacity-60">Resolving arXiv:{arxivId}…</p>;
}

export default function ReadPage() {
  const params = useParams<{ digest: string }>();
  const value = typeof params.digest === "string" ? decodeURIComponent(params.digest) : "";
  const target = readerDocumentTarget(value);
  if (target.kind === "digest") return <Reader digest={target.digest} />;
  if (target.kind === "arxiv") return <ArxivReaderRedirect arxivId={target.arxivId} />;
  return <p className="p-8 text-sm text-red-700 dark:text-red-300">Could not open this paper: malformed document id</p>;
}
