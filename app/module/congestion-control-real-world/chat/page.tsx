import type { Metadata } from "next";
import Link from "next/link";
import { ChatPanel } from "@/app/components/chat-panel";
import { requireGoogleUser } from "@/lib/auth";
import { REAL_WORLD_MODULE_PATH } from "@/lib/test-modules";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Real World Chat - JumpServe",
  description: "Discuss real-world congestion control results using recorded EC2 measurements and configurations.",
};

export default async function RealWorldChatPage({ searchParams }: {
  searchParams: Promise<{ jobId?: string | string[] }>;
}) {
  const { jobId: value } = await searchParams;
  const jobId = typeof value === "string" && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value)
    ? value.toLowerCase() : null;
  const nextPath = `${REAL_WORLD_MODULE_PATH}/chat${jobId ? `?jobId=${jobId}` : ""}`;
  const user = await requireGoogleUser(nextPath);
  const initialMessage = jobId
    ? `Help me understand real-world test ${jobId} (${REAL_WORLD_MODULE_PATH}/test-results/${jobId}). Look up its recorded configuration and results. Summarize receiver throughput, sender RTT, estimated queue drain time, measurement warnings, and the limits of any conclusions.`
    : "";

  return <div className="min-h-[var(--page-height)] bg-muted dark:bg-background">
    <div className="mx-auto max-w-5xl px-4 py-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <Link href={jobId ? `${REAL_WORLD_MODULE_PATH}/test-results/${jobId}` : REAL_WORLD_MODULE_PATH}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground transition hover:text-foreground">
          &larr; {jobId ? "Test results" : "Real-world tests"}
        </Link>
        <h1 className="text-lg font-bold text-foreground">JumpServe AI · Real World Tests</h1>
      </div>
      <ChatPanel key={crypto.randomUUID()} userEmail={user.email} initialMessage={initialMessage}
        moduleId="congestion-control-real-world" />
    </div>
  </div>;
}
