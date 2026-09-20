import Link from "next/link";
import { EMULATED_TESTS_MODULE } from "@/lib/test-modules";
import { ParentRunIndex } from "@/app/components/parent-run-index";
import { fetchParentRunsForIndexPage } from "@/lib/emulated-runs-data";

export async function TestLookupHome({
  initialPageNumber = 1,
}: {
  initialPageNumber?: number;
}) {
  const parentRunPage = await fetchParentRunsForIndexPage({
    page: initialPageNumber,
    pageSize: 10,
  });

  return (
    <main className="bg-background relative min-h-[var(--page-height)] overflow-hidden p-5 font-sans sm:p-10">
      <div className="relative z-10 mx-auto flex w-full max-w-6xl flex-col gap-4 py-3 sm:py-8">
        <div className="flex w-full items-start justify-center">
          {parentRunPage.parentRuns.length > 0 ? (
            <ParentRunIndex initialPage={parentRunPage} />
          ) : (
            <section className="relative w-full max-w-4xl rounded-lg border border-border bg-card p-10 text-center">
              <Link
                href={EMULATED_TESTS_MODULE.href}
                aria-label="Go to emulated tests module"
                className="absolute top-6 right-6 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border bg-card text-foreground transition hover:border-primary/40 hover:bg-accent dark:hover:border-border"
              >
                <svg
                  viewBox="0 0 24 24"
                  className="h-5 w-5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.9"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M3 10.5 12 3l9 7.5" />
                  <path d="M6 10v10h12V10" />
                  <path d="M10 20v-6h4v6" />
                </svg>
              </Link>
              <p className="text-xs font-semibold tracking-normal text-primary">
                Jumpserve
              </p>
              <h1 className="mt-3 text-3xl font-semibold text-foreground">
                No parent run data found
              </h1>
              <p className="mt-3 text-sm text-muted-foreground">
                No rows were returned from <code>emulated_parent_runs</code>.
              </p>
            </section>
          )}
        </div>
      </div>
    </main>
  );
}
