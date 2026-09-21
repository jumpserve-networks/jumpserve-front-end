import type { Metadata } from "next";
import { Suspense } from "react";
import { RealWorldReports } from "@/app/components/real-world-reports";
import { requireGoogleUser } from "@/lib/auth";

export const metadata: Metadata = { title: "Real-world test results" };
export default async function ReportsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(await searchParams)) if (typeof value === "string") query.set(key, value);
  await requireGoogleUser(`/real-world-reports${query.size ? `?${query}` : ""}`);
  return <main className="research-report-page mx-auto max-w-7xl px-4 py-8">
    <h1 className="text-2xl font-semibold">Real-world test results</h1>
    <p className="mt-2 max-w-3xl text-sm text-muted-foreground">Explore EC2 measurements shared among signed-in researchers. Inspect individual tests, compare matched configurations, and export the evidence.</p>
    <Suspense fallback={<p className="mt-6 text-sm" role="status">Loading test results…</p>}><RealWorldReports /></Suspense>
  </main>;
}
