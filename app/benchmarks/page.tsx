import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { BenchmarkForm } from "@/app/components/benchmark-form";
import { BenchmarkStatus } from "@/app/components/benchmark-status";
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

  if (!user) {
    redirect("/");
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <AuthButton />
      <ThemeToggle />

      <div className="mx-auto max-w-2xl px-4 py-12">
        <Link
          href="/"
          className="mb-6 inline-flex items-center gap-1 text-sm text-slate-500 transition hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
        >
          &larr; Home
        </Link>

        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
          Run Benchmark
        </h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Configure parameters and launch a TCP congestion control benchmark on
          a fresh EC2 instance.
        </p>

        <div className="mt-8 rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <h2 className="mb-4 text-lg font-semibold text-slate-800 dark:text-slate-200">
            Configuration
          </h2>
          <BenchmarkForm userEmail={user.email} />
        </div>

        <div className="mt-8">
          <h2 className="mb-4 text-lg font-semibold text-slate-800 dark:text-slate-200">
            Recent Jobs
          </h2>
          <BenchmarkStatus />
        </div>
      </div>
    </div>
  );
}
