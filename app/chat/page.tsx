import type { Metadata } from "next";
import { ChatPanel } from "@/app/components/chat-panel";
import { requireGoogleUser } from "@/lib/auth";
import Link from "next/link";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Chat - JumpServe",
  description: "Chat with the JumpServe AI assistant about benchmarks and congestion control.",
};

export default async function ChatPage({
  searchParams,
}: {
  searchParams: Promise<{ parentRunId?: string | string[] }>;
}) {
  const { parentRunId: value } = await searchParams;
  const parentRunId =
    typeof value === "string" && /^[1-9]\d*$/.test(value) && Number.isSafeInteger(Number(value))
      ? Number(value)
      : null;
  const nextPath = parentRunId ? `/chat?parentRunId=${parentRunId}` : "/chat";
  const user = await requireGoogleUser(nextPath);
  const initialMessage = parentRunId
    ? `Help me understand parent test run #${parentRunId} (/parent-run/${parentRunId}). Please look up its configuration and results, summarize throughput, round-trip time, and queueing delay, and highlight any notable behavior.`
    : "";

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <div className="mx-auto max-w-5xl px-4 py-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <Link
            href={parentRunId ? `/parent-run/${parentRunId}` : "/"}
            className="inline-flex items-center gap-1 text-sm text-slate-500 transition hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
          >
            &larr; {parentRunId ? `Test run #${parentRunId}` : "Home"}
          </Link>
          <h1 className="text-lg font-bold text-slate-900 dark:text-slate-100">
            JumpServe AI
          </h1>
          <div className="hidden w-16 sm:block" />
        </div>

        <ChatPanel
          key={parentRunId ?? "chat"}
          userEmail={user.email}
          initialMessage={initialMessage}
        />
      </div>
    </div>
  );
}
