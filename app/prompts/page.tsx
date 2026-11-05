import Link from "next/link";
import { Prompts } from "@/app/components/prompts";
import { requireGoogleUser } from "@/lib/auth";
import { promptSessionToken } from "@/lib/prompt-session";
import { PROMPTS_PATH, readPrompts } from "@/lib/prompts";

export const metadata = { title: "Prompts" };

export default async function PromptsPage() {
  await requireGoogleUser(PROMPTS_PATH);
  let data, error;
  try { data = await readPrompts(await promptSessionToken()); } catch (failure) { error = failure instanceof Error ? failure.message : "Prompts are unavailable."; }
  return <main className="mx-auto max-w-5xl space-y-6 px-4 py-6"><h1 className="text-3xl font-semibold tracking-tight">Prompts</h1>
    {data && "prompts" in data ? <Prompts prompts={data.prompts} /> : <div role="alert" className="space-y-3 rounded-lg border p-5 text-sm"><p>{error}</p><Link href={PROMPTS_PATH} className="underline">Try again</Link></div>}
  </main>;
}
