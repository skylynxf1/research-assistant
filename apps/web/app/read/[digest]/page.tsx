"use client";

import dynamic from "next/dynamic";
import { useParams } from "next/navigation";

/*
 * pdf.js touches DOM APIs (DOMMatrix, canvas) as soon as it is imported, so the reader
 * must never be rendered on the server - marking it "use client" is not enough, since
 * client components are still server-rendered for the initial HTML.
 */
const Reader = dynamic(() => import("../../../components/Reader"), {
  ssr: false,
  loading: () => <p className="p-8 opacity-60">Loading reader…</p>,
});

export default function ReadPage() {
  const params = useParams<{ digest: string }>();
  const digest = typeof params.digest === "string" ? params.digest : "";
  return <Reader digest={digest} />;
}
