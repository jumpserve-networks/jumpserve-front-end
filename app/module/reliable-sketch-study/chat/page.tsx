import { ChatPanel } from "@/app/components/chat-panel";
import { ReliableHeader } from "@/app/components/reliable-study/header";
import { requireGoogleUser } from "@/lib/auth";
import { RELIABLE_STUDY_MODULE_PATH as PATH } from "@/lib/test-modules";
export const dynamic="force-dynamic";
export default async function Chat({ searchParams }: { searchParams: Promise<{ configuration?: string | string[] }> }) {
 const p=await searchParams; const configuration=typeof p.configuration==="string" && /^[A-Za-z0-9._-]{1,100}$/.test(p.configuration) ? p.configuration : null;
 const user=await requireGoogleUser(`${PATH}/chat${configuration ? `?configuration=${encodeURIComponent(configuration)}` : ""}`);
 const initialMessage=configuration ? `Read ${configuration}. Explain recorded outliers, allocated versus nominal memory, interval checks and limits of this ReliableSketch assessment.` : "";
 return <main className="mx-auto max-w-5xl px-4 py-6"><ReliableHeader title="Chat with AI · ReliableSketch" description="Discuss saved stream-counting evidence and source coverage. A configuration link prepares an editable question; sending it is your choice." /><ChatPanel key={configuration ?? "reliable"} userEmail={user.email} moduleId="reliable-sketch-study" initialMessage={initialMessage} /></main>;
}
