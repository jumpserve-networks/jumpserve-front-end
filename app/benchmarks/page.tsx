import type { Metadata } from "next";
import { BenchmarkTabs } from "@/app/components/benchmark-tabs";
import { requireGoogleUser } from "@/lib/auth";
import Link from "next/link";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Run Benchmark",
  description: "Configure and launch TCP congestion control benchmarks.",
};

export default async function BenchmarksPage() {
  const user = await requireGoogleUser("/benchmarks");

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <div className="mx-auto max-w-3xl px-4 py-12">
        <Link
          href="/"
          className="mb-6 inline-flex items-center gap-1 text-sm text-slate-500 transition hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
        >
          &larr; Home
        </Link>

        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
          Benchmarks
        </h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Configure and launch TCP congestion control benchmarks on fresh EC2
          instances.
        </p>

        <BenchmarkTabs userEmail={user.email} />
      </div>
    </div>
  );
}
