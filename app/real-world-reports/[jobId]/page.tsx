import type { Metadata } from "next";
import Link from "next/link";
import { RealWorldReport } from "@/app/components/real-world-report";
import { requireGoogleUser } from "@/lib/auth";

export const metadata: Metadata = { title: "Real-world measurement report" };
export default async function ReportPage({ params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;
  await requireGoogleUser(`/real-world-reports/${jobId}`);
  return <main className="research-report-page mx-auto max-w-7xl px-4 py-8">
    <Link href="/real-world-reports" className="text-sm text-muted-foreground underline underline-offset-4 print:hidden">All research reports</Link>
    <h1 className="mt-4 text-2xl font-semibold">Real-world measurement report</h1>
    <RealWorldReport key={jobId} jobId={jobId} />
  </main>;
}
