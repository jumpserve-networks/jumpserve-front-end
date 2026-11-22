import { ResearchHeader } from "@/app/components/research-workflow/header";
import { CopyBlock, McpSetupCommand } from "@/app/components/research-workflow/mcp-setup-command";
import { LocalAssessmentUpload } from "@/app/components/research-workflow/local-assessment-upload";
import { PaperAssessmentSteps } from "@/app/components/research-workflow/paper-assessment-steps";
import Link from "next/link";
import { ASSESSMENTS_PATH, NEW_ASSESSMENT_PATH } from "@/lib/test-modules";
import { getGoogleUser } from "@/lib/auth";
import { mcpConfig } from "@/lib/jumpserve-mcp-oauth";
import { readLocalAssessmentSource } from "@/lib/jumpserve-mcp-store";
import { LOCAL_ASSESSMENT_SOURCE_API, localAssessmentPrompt, localAssessmentSourcePage } from "@/lib/local-assessment-source";
import { isResearchId } from "@/lib/research-experiment-queue";
import { PRODUCTION_SITE_ORIGIN } from "@/lib/site-url";

export const dynamic = "force-dynamic";

const marketplace = "jumpserve-networks/jumpserve-plugins";
const codexApprovalCommand = `codex --sandbox workspace-write --ask-for-approval on-request -c 'approvals_reviewer="user"'`;

export default async function NewAssessment({ searchParams }: { searchParams: Promise<{ assessment?: string | string[] }> }) {
  const [owner, query] = await Promise.all([getGoogleUser(), searchParams]);
  const assessmentId = isResearchId(query.assessment) ? query.assessment : undefined;
  const resumePath = assessmentId ? localAssessmentSourcePage(assessmentId) : NEW_ASSESSMENT_PATH;
  const signIn = `/login?${new URLSearchParams({ next: resumePath })}`;
  const result = owner && assessmentId ? await readLocalAssessmentSource(owner.id, assessmentId)
    .then(source => ({ source, error: source ? undefined : "This PDF is unavailable in your account. Upload the PDF to continue." }))
    .catch(() => ({ source: null, error: "Private PDF storage is temporarily unavailable. Reload the page to try again." })) : null;
  const connector = mcpConfig();
  const connections = `${connector?.issuer ?? PRODUCTION_SITE_ORIGIN}/oauth/jumpserve/connections`;

  return (
    <main className="mx-auto max-w-5xl space-y-6 px-4 py-6">
      <ResearchHeader title="Assess a Paper" />
      <PaperAssessmentSteps />
      <section className="content-panel space-y-6 rounded-xl border p-6">
        <section className="space-y-3" aria-labelledby="paper-upload">
          <h2 id="paper-upload" className="text-lg font-semibold">Upload the research paper</h2>
          {result?.source && assessmentId ? <>
            <p className="text-sm text-muted-foreground">Paste the prompt into Claude Code or Codex. The JumpServe plugin downloads the private PDF and runs feasible local verification experiments.</p>
            <p className="text-sm text-muted-foreground">If the client blocks access to a required resource, select <strong>Ask for approval</strong> in the Codex app or <strong>Manual</strong> in Claude Code to review its permission request.</p>
            <details className="space-y-2 text-sm">
              <summary className="cursor-pointer font-medium">Start Codex CLI with approval prompts</summary>
              <CopyBlock title="Run this in your assessment workspace" label="Codex human approval command" value={codexApprovalCommand} />
            </details>
            <p className="break-all text-sm">Assessment ID <code>{assessmentId}</code></p>
            <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
              <a href={`${LOCAL_ASSESSMENT_SOURCE_API}?assessment_id=${assessmentId}`} className="text-primary underline underline-offset-4">Download PDF</a>
              <Link href={NEW_ASSESSMENT_PATH} className="text-primary underline underline-offset-4">Upload another paper</Link>
            </div>
            <CopyBlock title="Claude Code or Codex prompt" label="assessment prompt" value={localAssessmentPrompt(assessmentId)} wrap />
          </> : <>
            <p className="text-sm text-muted-foreground">Upload a PDF to get a prompt for assessing it locally in Claude Code or Codex.</p>
            {result?.error ? <p role="alert" className="text-sm text-destructive">{result.error}</p> : null}
            {owner ? <LocalAssessmentUpload ownerId={owner.id} /> : <Link href={signIn} className="text-primary underline underline-offset-4">Sign in with Google to upload</Link>}
          </>}
        </section>

        <details className="space-y-3 border-t pt-4" open={!result?.source}>
          <summary className="cursor-pointer text-lg font-semibold">Set up the JumpServe plugin</summary>
          <p>The plugin bundles the paper assessment skill and hosted JumpServe connector. Use it to assess papers and run experiments in your local workspace.</p>
          <McpSetupCommand client="Claude Code" command={`claude plugin install jumpserve --marketplace ${marketplace}`} />
          <McpSetupCommand client="Codex" command={`codex plugin marketplace add ${marketplace} && codex plugin add jumpserve@jumpserve`} />
          <p>Connect with Google from <code>/mcp</code> in Claude Code or run <code>codex mcp login jumpserve</code> in Codex. Use the same Google account you used to upload the paper.</p>
          <p><a href={`https://github.com/${marketplace}`} className="text-primary underline underline-offset-4">View the public marketplace and install instructions</a></p>
          <p><Link href={connections} className="text-primary underline underline-offset-4">Manage JumpServe connections</Link></p>
        </details>

        <section className="space-y-3 border-t pt-4" aria-labelledby="share-assessment">
          <h2 id="share-assessment" className="text-lg font-semibold">Share an assessment</h2>
          <p>When the assessment finishes, find it under My Assessments. It stays private until you choose to share it publicly.</p>
          <Link href={ASSESSMENTS_PATH} className="text-primary underline underline-offset-4">View saved assessments</Link>
        </section>
      </section>
    </main>
  );
}
