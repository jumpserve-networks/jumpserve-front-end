import type { Metadata } from "next";
import Link from "next/link";
import { RealWorldTestDetail } from "@/app/components/real-world-test-detail";

export const metadata: Metadata = { title: "Real-world test results" };
export default async function RealWorldDetailPage({ params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;
  return <main className="mx-auto max-w-6xl px-4 py-8"><Link href="/real-world" className="text-sm text-muted-foreground underline underline-offset-4">All real-world tests</Link>
    <h1 className="mt-4 text-2xl font-semibold">Real-world test</h1><RealWorldTestDetail key={jobId} jobId={jobId} />
  </main>;
}
