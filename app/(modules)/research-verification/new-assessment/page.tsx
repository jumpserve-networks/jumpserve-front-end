import { ResearchHeader } from "@/app/components/research-workflow/header";
import Link from "next/link";
import { ASSESSMENTS_PATH } from "@/lib/test-modules";
import { mcpConfig } from "@/lib/jumpserve-mcp-oauth";

export const dynamic = "force-dynamic";

export default function NewAssessment() {
  const connector = mcpConfig();
  return <main className="mx-auto max-w-5xl space-y-6 px-4 py-6"><ResearchHeader title="Local Paper Assessments" /><section className="content-panel space-y-4 rounded-xl border p-6">
    <p>Use the JumpServe paper assessment skill in Claude Code or Codex to assess papers and run experiments in your local workspace.</p>
    <p><a href="/downloads/jumpserve-paper-assessment-v1.zip" download className="text-primary underline underline-offset-4">Download the JumpServe paper assessment skill</a></p>
    <p>Extract the <code>jumpserve-paper-assessment</code> folder into <code>~/.claude/skills/</code> for Claude Code or <code>~/.agents/skills/</code> for Codex.</p>
    {connector ? <>
      <p>Connect your client to <code className="break-all">{connector.resource}</code>, then ask it to share your assessment. JumpServe will show you the public copy for approval.</p>
      <details className="space-y-3">
        <summary className="cursor-pointer font-medium">MCP setup commands</summary>
        <p>Claude Code</p>
        <pre className="overflow-x-auto rounded-md bg-muted p-3 text-sm"><code>{`claude mcp add --transport http --scope user --client-id jumpserve-claude-code --callback-port 17652 jumpserve ${connector.resource}`}</code></pre>
        <p>Use <code>/mcp</code> in Claude Code to sign in with Google.</p>
        <p>Codex</p>
        <pre className="overflow-x-auto rounded-md bg-muted p-3 text-sm"><code>{`codex -c mcp_oauth_callback_port=17651 mcp add jumpserve --url ${connector.resource} --oauth-client-id jumpserve-codex`}</code></pre>
        <p>Follow the browser sign-in prompt to connect your JumpServe account.</p>
      </details>
      <p><Link href="/oauth/jumpserve/connections" className="text-primary underline underline-offset-4">Manage JumpServe connections</Link></p>
    </>
      : <p>Online sharing through the connector is unavailable on this installation.</p>}
    <Link href={ASSESSMENTS_PATH} className="text-primary underline underline-offset-4">View saved assessments</Link>
  </section></main>;
}
