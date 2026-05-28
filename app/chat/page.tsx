import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { ChatPanel } from "@/app/components/chat-panel";
import { AuthButton } from "@/app/components/auth-button";
import { ThemeToggle } from "@/app/components/theme-toggle";
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
      <AuthButton />
      <ThemeToggle />

      <div className="mx-auto max-w-3xl px-4 py-8">
        <div className="mb-4 flex items-center justify-between">
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

        {!user ? (
          <div className="mt-16 rounded-xl border border-slate-200 bg-white p-8 text-center shadow-sm dark:border-slate-700 dark:bg-slate-900">
            <p className="text-lg font-medium text-slate-700 dark:text-slate-300">
              Sign in to chat
            </p>
            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
              Click the &quot;Login with Google&quot; button in the top-right
              corner to get started.
            </p>
          </div>
        ) : (
          <ChatPanel userEmail={user.email} />
        )}
      </div>
    </div>
  );
}
