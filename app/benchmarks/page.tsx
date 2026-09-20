import type { Metadata } from "next";
import { BenchmarkTabs } from "@/app/components/benchmark-tabs";
import { requireGoogleUser } from "@/lib/auth";
import Link from "next/link";
import { EMULATED_TESTS_MODULE } from "@/lib/test-modules";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Run Benchmark",
  description: "Configure and launch TCP congestion control benchmarks.",
};

export default async function BenchmarksPage() {
  const user = await requireGoogleUser("/benchmarks");

  return (
    <div className="min-h-[var(--page-height)] bg-muted dark:bg-background">
      <div className="mx-auto max-w-3xl px-4 py-12">
        <Link
          href={EMULATED_TESTS_MODULE.href}
          className="mb-6 inline-flex items-center gap-1 text-sm text-muted-foreground transition hover:text-foreground"
        >
          &larr; Emulated tests
        </Link>

        <h1 className="text-2xl font-bold text-foreground">
          Benchmarks
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Configure and launch TCP congestion control benchmarks on fresh EC2
          instances.
        </p>

        <BenchmarkTabs userEmail={user.email} />
      </div>
    </div>
  );
}
