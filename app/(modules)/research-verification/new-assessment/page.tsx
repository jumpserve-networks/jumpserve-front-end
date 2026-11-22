import { ResearchHeader } from "@/app/components/research-workflow/header";
import { McpSetupCommand } from "@/app/components/research-workflow/mcp-setup-command";
import Link from "next/link";
import { ASSESSMENTS_PATH } from "@/lib/test-modules";
import { mcpConfig } from "@/lib/jumpserve-mcp-oauth";
import { PRODUCTION_SITE_ORIGIN } from "@/lib/site-url";

export const dynamic = "force-dynamic";

const marketplace = "jumpserve-networks/jumpserve-plugins";

export default function NewAssessment() {
  const connector = mcpConfig();
  const connections = `${connector?.issuer ?? PRODUCTION_SITE_ORIGIN}/oauth/jumpserve/connections`;

  return (
    <main className="mx-auto max-w-5xl space-y-6 px-4 py-6">
      <ResearchHeader title="Local Paper Assessments" />
      <section className="content-panel space-y-6 rounded-xl border p-6">
        <section className="space-y-3" aria-labelledby="plugin-setup">
          <h2 id="plugin-setup" className="text-lg font-semibold">Install the JumpServe plugin</h2>
          <p>The plugin bundles the paper assessment skill and hosted JumpServe connector. Use it to assess papers and run experiments in your local workspace.</p>
          <McpSetupCommand client="Claude Code" command={`claude plugin install jumpserve --marketplace ${marketplace}`} />
          <McpSetupCommand client="Codex" command={`codex plugin marketplace add ${marketplace} && codex plugin add jumpserve@jumpserve`} />
          <p>Start a new session and ask the JumpServe paper assessment skill to assess a local PDF. When it finishes, your client gives you a link to view the results on JumpServe.</p>
          <p><a href={`https://github.com/${marketplace}`} className="text-primary underline underline-offset-4">View the public marketplace and install instructions</a></p>
        </section>

        <section className="space-y-3 border-t pt-4" aria-labelledby="share-assessment">
          <h2 id="share-assessment" className="text-lg font-semibold">Share an assessment</h2>
          <p>Connect with Google from <code>/mcp</code> in Claude Code or run <code>codex mcp login jumpserve</code> in Codex. Open the results link to review the private assessment and approve the exact copy when you want to share it publicly.</p>
          <p><Link href={connections} className="text-primary underline underline-offset-4">Manage JumpServe connections</Link></p>
          <Link href={ASSESSMENTS_PATH} className="text-primary underline underline-offset-4">View saved assessments</Link>
        </section>
      </section>
    </main>
  );
}
