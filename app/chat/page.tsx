import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { ChatPanel } from "@/app/components/chat-panel";
import Link from "next/link";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Chat - JumpServe",
  description: "Chat with the JumpServe AI assistant about benchmarks and congestion control.",
};

export default async function ChatPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <div className="mx-auto max-w-5xl px-4 py-4">
        <div className="mb-3 flex items-center justify-between">
          <Link
            href="/"
            className="inline-flex items-center gap-1 text-sm text-slate-500 transition hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
          >
            &larr; Home
          </Link>
          <h1 className="text-lg font-bold text-slate-900 dark:text-slate-100">
            JumpServe AI
          </h1>
          <div className="w-16" />
        </div>

        <ChatPanel userEmail={user?.email} />
      </div>
    </div>
  );
}
