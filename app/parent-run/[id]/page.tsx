import type { Metadata } from "next";
import Link from "next/link";
import { EMULATED_TESTS_MODULE } from "@/lib/test-modules";
import { Suspense } from "react";
import { MessageCircle } from "lucide-react";
import { Button } from "@/app/components/ui/button";
import { ParentRunCharts } from "@/app/parent-run/[id]/parent-run-charts";
import { fetchParentRunSummary } from "@/lib/emulated-runs-data";
import { notFound } from "next/navigation";

type ParentRunPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ page?: string | string[] }>;
};

export async function generateMetadata({
  params,
}: ParentRunPageProps): Promise<Metadata> {
  const { id } = await params;
  const parentRunId = Number(id);

  return {
    title: {
      absolute: Number.isInteger(parentRunId)
        ? `Jumpserve | ${parentRunId}`
        : "Jumpserve",
    },
  };
}

function formatCreatedAt(value: string | null) {
  if (!value) {
    return "Unknown timestamp";
  }

  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
    return value;
  }

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(parsed);
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 2,
  }).format(value);
}

function formatValueList(values: number[], suffix: string) {
  if (values.length === 0) {
    return "None";
  }

  return values.map((value) => `${formatNumber(value)} ${suffix}`).join(", ");
}

export default async function ParentRunPage({
  params,
  searchParams,
}: ParentRunPageProps) {
  const { id } = await params;
  const parentRunId = Number(id);
  const pageParam = (await searchParams).page;
  const pageValue = Array.isArray(pageParam) ? pageParam[0] : pageParam;

  const parsedPage = Number.parseInt(
    pageValue ?? "",
    10,
  );
  const returnPage =
    Number.isInteger(parsedPage) && parsedPage > 0
      ? parsedPage
      : 1;

  if (!Number.isInteger(parentRunId)) {
    notFound();
  }

  const parentRun = await fetchParentRunSummary(parentRunId);

  if (!parentRun) {
    return (
      <main className="bg-background relative min-h-[var(--page-height)] p-4 sm:p-10">
        <div className="relative z-10 mx-auto flex w-full items-start justify-center py-3 sm:py-8">
          <section className="w-full max-w-4xl rounded-lg border border-border bg-card p-10 text-center">
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
        </div>
      </main>
    );
  }

  return (
    <main className="bg-background relative box-border min-h-[var(--page-height)] p-2 sm:p-6">
      <div className="relative z-10 mx-auto flex w-full items-start justify-center py-1 sm:py-3">
        <section className="w-full max-w-6xl rounded-lg border border-border bg-card p-4 sm:rounded-lg sm:p-8">
          <div className="mb-6 border-b border-border pb-2.5 sm:mb-8 sm:pb-3">
            <p className="mb-3 text-xs font-semibold tracking-normal text-primary">
              Jumpserve
            </p>
            <div className="mb-5 flex items-center justify-between gap-3">
              <Link
                href={`/test-lookup?page=${returnPage}`}
                aria-label={`Return to test lookup page ${returnPage}`}
                className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-lg border border-border bg-card px-3 text-sm font-medium text-foreground transition hover:border-primary/40 hover:bg-accent dark:hover:border-border"
              >
                <svg
                  viewBox="0 0 24 24"
                  className="h-5 w-5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.9"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="m15 18-6-6 6-6" />
                </svg>
                Back
              </Link>
              <Link
                href={EMULATED_TESTS_MODULE.href}
                aria-label="Go to emulated tests module"
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border bg-card text-foreground transition hover:border-primary/40 hover:bg-accent dark:hover:border-border"
              >
                <svg
                  viewBox="0 0 24 24"
                  className="h-5 w-5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.9"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M3 10.5 12 3l9 7.5" />
                  <path d="M6 10v10h12V10" />
                  <path d="M10 20v-6h4v6" />
                </svg>
              </Link>
            </div>
            <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
                Emulated Run Explorer | {parentRun.id}
              </h1>
              <Button
                nativeButton={false}
                className="self-start sm:self-auto"
                render={<Link href={`/chat?parentRunId=${parentRun.id}`} />}
              >
                <MessageCircle aria-hidden="true" />
                Chat with AI
              </Button>
            </div>
          </div>
          <div className="mb-6 grid min-w-0 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-[minmax(0,2.4fr)_repeat(4,minmax(0,1fr))]">
            <article className="min-w-0 rounded-lg border border-border bg-card p-4 sm:col-span-2 lg:col-span-1">
              <div className="flex flex-col gap-1 text-sm text-muted-foreground">
                <span className="uppercase tracking-[0.18em]">
                  {parentRun.clientCount} client{parentRun.clientCount === 1 ? "" : "s"}
                </span>
              </div>
              <p className="mt-2 break-words text-base font-medium text-foreground">
                {parentRun.clientSummaryLine}
              </p>
              <p className="mt-2.5 text-sm tracking-normal text-muted-foreground dark:text-foreground">
                Parent #{parentRun.id}
              </p>
              <p className="mt-1.5 text-xs text-muted-foreground dark:text-foreground">
                {formatCreatedAt(parentRun.createdAt)}
              </p>
            </article>
            <SummaryCard
              label="Total File Size"
              value={
                parentRun.totalClientFileSizeMegabytes === null
                  ? "None"
                  : `${formatNumber(parentRun.totalClientFileSizeMegabytes)} MB`
              }
            />
            <SummaryCard
              label="Client Start Delay"
              value={formatValueList(parentRun.clientStartDelayMsValues, "ms")}
            />
            <SummaryCard
              label="Queue Buffer Size"
              value={
                parentRun.queueBufferSizeKilobyte === null
                  ? "None"
                  : `${formatNumber(parentRun.queueBufferSizeKilobyte)} kbytes`
              }
            />
            <SummaryCard
              label="Bottleneck Rate"
              value={
                parentRun.bottleneckRateMegabit === null
                  ? "None"
                  : `${formatNumber(parentRun.bottleneckRateMegabit)} mbit`
              }
            />
          </div>
          <Suspense fallback={<ChartsLoadingFallback />}>
            <ParentRunCharts parentRunId={parentRunId} />
          </Suspense>
        </section>
      </div>
    </main>
  );
}

function SummaryCard({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <article className="min-w-0 rounded-lg border border-border bg-card p-4">
      <p className="text-xs font-semibold tracking-normal text-muted-foreground">
        {label}
      </p>
      <p className="mt-2 break-words text-sm font-medium text-foreground">
        {value}
      </p>
    </article>
  );
}

function ChartsLoadingFallback() {
  return (
    <div className="space-y-4">
      <p className="text-xs tracking-normal text-muted-foreground">
        Loading chart data...
      </p>
      <div className="grid min-w-0 gap-4 md:grid-cols-2">
        {Array.from({ length: 4 }, (_, index) => (
          <div
            key={index}
            className="h-[320px] animate-pulse rounded-lg border border-border bg-card"
          />
        ))}
      </div>
    </div>
  );
}
