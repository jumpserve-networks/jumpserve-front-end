import { REAL_WORLD_MODULE_PATH } from "@/lib/test-modules";
import type { Metadata } from "next";
import Link from "next/link";
import { RealWorldReport } from "@/app/components/real-world-report";

export const metadata: Metadata = { title: "Real-world test results" };
export default async function ReportPage({ params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;
  return <main className="research-report-page mx-auto max-w-7xl px-4 py-8">
    <Link href={`${REAL_WORLD_MODULE_PATH}/test-results`} className="text-sm text-muted-foreground underline underline-offset-4 print:hidden">All test results</Link>
    <h1 className="mt-4 text-2xl font-semibold">Real-world test results</h1>
    <RealWorldReport key={jobId} jobId={jobId} />
  </main>;
}
