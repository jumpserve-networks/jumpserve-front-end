import { REAL_WORLD_MODULE_PATH } from "@/lib/test-modules";
import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Congestion Control Real World Tests" };
export default async function RealWorldPage() {
  return <main className="mx-auto max-w-6xl px-4 py-8"><h1 className="text-2xl font-semibold">Congestion Control Real World Tests</h1>
    <p className="mt-2 text-sm text-muted-foreground">Cloud benchmark execution has been retired. Run new experiments locally with Claude or Codex. Historical measurements remain available here.</p>
    <Link href={`${REAL_WORLD_MODULE_PATH}/test-results`} className="mt-6 inline-block text-sm underline underline-offset-4">Browse test results</Link>
  </main>;
}
