import { EMULATED_MODULE_PATH } from "@/lib/test-modules";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BenchmarkRunStatus } from "@/app/components/benchmark-run-status";
import { getGoogleUser } from "@/lib/auth";
import { PUBLIC_BENCHMARK_COLUMNS, type BenchmarkJob } from "@/lib/benchmark-progress";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Benchmark progress", description: "Follow your benchmark from launch to results." };

export default async function BenchmarkRunPage({ params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;
  const user = await getGoogleUser();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(jobId)) notFound();

  const supabase = await createClient();
  const { data, error } = await supabase.from("benchmark_jobs").select(PUBLIC_BENCHMARK_COLUMNS).eq("id", jobId).maybeSingle();
  if (error) throw new Error("Unable to load benchmark status. Please try again.");
  if (!data) notFound();

  return (
    <main className="min-h-[var(--page-height)] bg-muted text-foreground dark:bg-background">
      <div className="mx-auto max-w-3xl space-y-6 px-4 py-12">
        <Link href={`${EMULATED_MODULE_PATH}/benchmarks`} className="inline-flex text-sm text-muted-foreground hover:text-foreground">&larr; Benchmarks</Link>
        <div><h1 className="text-2xl font-bold">Benchmark progress</h1><p className="mt-1 text-sm text-muted-foreground">Follow this run from launch to results.</p></div>
        <BenchmarkRunStatus key={jobId} initialJob={data as BenchmarkJob} canManage={Boolean(user)} />
      </div>
    </main>
  );
}
