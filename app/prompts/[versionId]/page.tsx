import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/app/components/ui/badge";
import { LocalDateTime } from "@/app/components/user-preferences";
import { requireGoogleUser } from "@/lib/auth";
import { promptSessionToken } from "@/lib/prompt-session";
import { formatPrompt, isPromptId, PROMPTS_PATH, promptArea, promptPath, promptStatus, readPrompts } from "@/lib/prompts";

export const metadata = { title: "Prompt" };

export default async function PromptPage({ params }: { params: Promise<{ versionId: string }> }) {
  const { versionId } = await params;
  if (!isPromptId(versionId)) notFound();
  await requireGoogleUser(promptPath(versionId));
  let data, error;
  try { data = await readPrompts(await promptSessionToken(), versionId); } catch (failure) { error = failure instanceof Error ? failure.message : "Prompt is unavailable."; }
  const prompt = data && "prompt" in data ? data.prompt : null;
  return <main className="mx-auto max-w-5xl space-y-6 px-4 py-6">
    <Link href={PROMPTS_PATH} className="text-sm underline">All prompts</Link>
    {prompt ? <>
      <div className="space-y-2"><p className="text-sm text-muted-foreground">{promptArea(prompt.module_id)}</p><h1 className="break-words text-2xl font-semibold">{prompt.version}</h1><Badge variant={prompt.active ? "default" : "secondary"}>{promptStatus(prompt)}</Badge></div>
      <dl className="grid gap-3 text-sm sm:grid-cols-2"><div><dt className="text-muted-foreground">{prompt.recorded ? "Recorded" : "Updated"}</dt><dd><LocalDateTime value={prompt.updated_at} /></dd></div>{!prompt.recorded ? <div><dt className="text-muted-foreground">Published</dt><dd>{prompt.published_at ? <LocalDateTime value={prompt.published_at} /> : "Not published"}</dd></div> : null}<div className="sm:col-span-2"><dt className="text-muted-foreground">Content SHA-256</dt><dd className="break-all font-mono text-xs">{prompt.content_sha256}</dd></div></dl>
      {[[prompt.recorded ? "Instructions" : "System prompt", prompt.system_prompt], [prompt.recorded ? "Input template and model settings" : "Research context", prompt.research_context]].map(([title, content]) => <section key={title} className="space-y-3"><h2 className="text-lg font-semibold">{title}</h2><pre className="whitespace-pre-wrap break-words rounded-lg border bg-muted/30 p-4 font-mono text-sm leading-relaxed [overflow-wrap:anywhere]">{formatPrompt(content)}</pre></section>)}
    </> : <div role="alert" className="space-y-3 rounded-lg border p-5 text-sm"><h1 className="text-xl font-semibold">Prompt unavailable</h1><p>{error}</p><Link href={promptPath(versionId)} className="underline">Try again</Link></div>}
  </main>;
}
