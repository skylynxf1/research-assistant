"use client";

import dynamic from "next/dynamic";
import { useParams } from "next/navigation";

const ReflowReader = dynamic(() => import("../../../components/accessibility/ReflowReader"), {
  ssr: false,
  loading: () => <p className="p-8 opacity-60">Building reader view…</p>,
});

export default function ReflowPage() {
  const params = useParams<{ digest: string }>();
  const digest = typeof params.digest === "string" ? params.digest : "";
  return <ReflowReader digest={digest} />;
}
