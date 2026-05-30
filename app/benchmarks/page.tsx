import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { BenchmarkTabs } from "@/app/components/benchmark-tabs";
import { AuthButton } from "@/app/components/auth-button";
import { ThemeToggle } from "@/app/components/theme-toggle";
import Link from "next/link";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Run Benchmark",
  description: "Configure and launch TCP congestion control benchmarks.",
};

export default async function BenchmarksPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <AuthButton />
      <ThemeToggle />

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

        {!user ? (
          <div className="mt-8 rounded-xl border border-slate-200 bg-white p-8 text-center shadow-sm dark:border-slate-700 dark:bg-slate-900">
            <p className="text-lg font-medium text-slate-700 dark:text-slate-300">
              Sign in to run benchmarks
            </p>
            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
              Click the &quot;Login with Google&quot; button in the top-right
              corner to get started.
            </p>
          </div>
        ) : (
          <BenchmarkTabs userEmail={user.email} />
        )}
      </div>
    </div>
  );
}
