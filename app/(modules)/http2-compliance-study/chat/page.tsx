import { ChatPanel } from "@/app/components/chat-panel";
import { Http2Header } from "@/app/components/http2-study/header";
import { requireGoogleUser } from "@/lib/auth";
import { HTTP2_STUDY_MODULE_PATH as PATH } from "@/lib/test-modules";
export const dynamic = "force-dynamic";
export default async function Chat({ searchParams }: { searchParams: Promise<{ configuration?: string | string[] }> }) {
  const p = await searchParams;
  const configuration = typeof p.configuration === "string" && /^[A-Za-z0-9.-]{1,100}$/.test(p.configuration) ? p.configuration : null;
  const user = await requireGoogleUser(`${PATH}/chat${configuration ? `?configuration=${encodeURIComponent(configuration)}` : ""}`);
  const initialMessage = configuration ? `Read the saved HTTP/2 evidence for ${configuration}. Compare published and reanalyzed outcomes, inspect unknown measurements and configuration gaps, and explain which conclusions are supported.` : "";
  return <main className="mx-auto max-w-5xl px-4 py-6"><Http2Header title="Chat with AI · HTTP/2 evidence" description="AI selects relevant recorded evidence; answers show its values and documented limitations. Configuration links prepare an editable question; you choose when to send it." /><ChatPanel key={configuration ?? "http2"} userEmail={user.email} moduleId="http2-compliance-study" initialMessage={initialMessage} /></main>;
}
