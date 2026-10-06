import { ChatPanel } from "@/app/components/chat-panel";
import { IPv6Header } from "@/app/components/ipv6-study/header";
import { requireGoogleUser } from "@/lib/auth";
import { IPV6_STUDY_MODULE_PATH as PATH } from "@/lib/test-modules";
export const dynamic = "force-dynamic";
export default async function Chat({ searchParams }: { searchParams: Promise<{ configuration?: string | string[] }> }) {
 const p = await searchParams; const configuration = typeof p.configuration === "string" && /^[A-Za-z0-9._-]{1,100}$/.test(p.configuration) ? p.configuration : null;
 const user = await requireGoogleUser(`${PATH}/chat${configuration ? `?configuration=${encodeURIComponent(configuration)}` : ""}`);
 const initialMessage = configuration ? `Read ${configuration}. Compare historical epochs, percentage units, coverage, missing observations and limits of the IPv6 DNS assessment.` : "";
 return <main className="mx-auto max-w-5xl px-4 py-6"><IPv6Header title="Chat with AI · IPv6 DNS" description="Discuss saved historical DNS evidence with read-only research tools. A result link prepares an editable question without sending it." /><ChatPanel key={configuration ?? "ipv6"} userEmail={user.email} moduleId="ipv6-dns-study" initialMessage={initialMessage} /></main>;
}
