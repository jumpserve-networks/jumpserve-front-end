import type { Metadata } from "next";
import { ChatPanel } from "@/app/components/chat-panel";
import { AuthButton } from "@/app/components/auth-button";
import { ThemeToggle } from "@/app/components/theme-toggle";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Chat - JumpServe",
  description: "Chat with the JumpServe AI assistant about benchmarks and congestion control.",
};

// TODO: Re-add auth gate once Google OAuth redirect is configured
export default function ChatPage() {
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

        <ChatPanel />
      </div>
    </div>
  );
}
