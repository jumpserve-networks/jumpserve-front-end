import { ResearchHeader } from "@/app/components/research-workflow/header";
import Link from "next/link";
import { ASSESSMENTS_PATH, NEW_ASSESSMENT_PATH } from "@/lib/test-modules";
import { mcpConfig } from "@/lib/jumpserve-mcp-oauth";
import { PRODUCTION_SITE_ORIGIN } from "@/lib/site-url";

export const dynamic = "force-dynamic";

export default function NewAssessment() {
  const connector = mcpConfig();
  const resource = connector?.resource ?? `${PRODUCTION_SITE_ORIGIN}/mcp`;
  const connections = `${connector?.issuer ?? PRODUCTION_SITE_ORIGIN}/oauth/jumpserve/connections`;
  return <main className="mx-auto max-w-5xl space-y-6 px-4 py-6"><ResearchHeader title="Local Paper Assessments" /><section className="content-panel space-y-4 rounded-xl border p-6">
    <p>Use the JumpServe paper assessment skill in Claude Code or Codex to assess papers and run experiments in your local workspace.</p>
    <p><a href="/downloads/jumpserve-paper-assessment-v1.zip" download className="text-primary underline underline-offset-4">Download the JumpServe paper assessment skill</a></p>
    <p>Extract the <code>jumpserve-paper-assessment</code> folder into <code>~/.claude/skills/</code> for Claude Code or <code>~/.agents/skills/</code> for Codex.</p>
    <section className="space-y-3" aria-labelledby="mcp-setup">
      <h2 id="mcp-setup" className="text-lg font-semibold">Connect to JumpServe</h2>
      {connector ? null : <p>Local sharing is disabled. These commands target hosted JumpServe. <Link href={`${PRODUCTION_SITE_ORIGIN}${NEW_ASSESSMENT_PATH}`} className="text-primary underline underline-offset-4">View the live setup instructions</Link>.</p>}
      <p>Claude Code</p>
      <pre className="overflow-x-auto rounded-md bg-muted p-3 text-sm"><code>{`claude mcp add -t http -s user jumpserve ${resource}`}</code></pre>
      <p>Use <code>/mcp</code> in Claude Code to sign in with Google.</p>
      <p>Codex</p>
      <pre className="overflow-x-auto rounded-md bg-muted p-3 text-sm"><code>{`codex mcp add jumpserve --url ${resource}`}</code></pre>
      <p>Follow the browser sign-in prompt or run <code>codex mcp login jumpserve</code>.</p>
      <p>Ask your client to share an assessment. JumpServe will show you the public copy for approval.</p>
      <p><Link href={connections} className="text-primary underline underline-offset-4">Manage JumpServe connections</Link></p>
    </section>
    <Link href={ASSESSMENTS_PATH} className="text-primary underline underline-offset-4">View saved assessments</Link>
  </section></main>;
}
