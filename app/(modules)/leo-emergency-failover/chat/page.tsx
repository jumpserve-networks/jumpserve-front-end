import { ChatPanel } from "@/app/components/chat-panel";
import { LeoHeader } from "@/app/components/leo-study/header";
import { requireGoogleUser } from "@/lib/auth";
import { LEO_STUDY_MODULE_PATH } from "@/lib/test-modules";
import { LEO_COUNTRIES, COUNTRY_LABELS } from "@/lib/leo-study";
export const dynamic = "force-dynamic";
export default async function LeoChatPage({ searchParams }: { searchParams: Promise<{ country?: string | string[] }> }) {
  const params = await searchParams;
  const country = typeof params.country === "string" && LEO_COUNTRIES.some(c => c === params.country) ? params.country : null;
  const user = await requireGoogleUser(`${LEO_STUDY_MODULE_PATH}/chat${country ? `?country=${country}` : ""}`);
  const initialMessage = country ? `Look up the saved LEO failover study results for ${COUNTRY_LABELS[country]}. Compare the published capacity with our simulation, explain discrepancies and terminal placement, and state the limits of these estimates.` : "";
  return <main className="mx-auto max-w-5xl px-4 py-6"><LeoHeader title="Chat with AI · LEO failover" description="Ask about recorded capacity simulations, model assumptions, and cited evidence. Country links prepare an editable question for you to send." /><ChatPanel key={country ?? "leo"} userEmail={user.email} moduleId="leo-emergency-failover" initialMessage={initialMessage} /></main>;
}
