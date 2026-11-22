import { ResearchHeader } from "@/app/components/research-workflow/header";
import { CopyBlock, McpSetupDialogs } from "@/app/components/research-workflow/mcp-setup-command";
import { LocalAssessmentUpload } from "@/app/components/research-workflow/local-assessment-upload";
import { PaperAssessmentSteps } from "@/app/components/research-workflow/paper-assessment-steps";
import Link from "next/link";
import { NEW_ASSESSMENT_PATH } from "@/lib/test-modules";
import { getGoogleUser } from "@/lib/auth";
import { mcpConfig } from "@/lib/jumpserve-mcp-oauth";
import { readLocalAssessmentSource } from "@/lib/jumpserve-mcp-store";
import { LOCAL_ASSESSMENT_SOURCE_API, localAssessmentPrompt, localAssessmentSourcePage } from "@/lib/local-assessment-source";
import { isResearchId } from "@/lib/research-experiment-queue";
import { PRODUCTION_SITE_ORIGIN } from "@/lib/site-url";

export const dynamic = "force-dynamic";

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
            <p className="break-all text-sm">Assessment ID <code>{assessmentId}</code></p>
            <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
              <a href={`${LOCAL_ASSESSMENT_SOURCE_API}?assessment_id=${assessmentId}`} className="text-primary underline underline-offset-4">Download PDF</a>
              <Link href={NEW_ASSESSMENT_PATH} className="text-primary underline underline-offset-4">Upload another paper</Link>
            </div>
            <CopyBlock title="Claude Code or Codex prompt" label="assessment prompt" value={localAssessmentPrompt(assessmentId)} wrap />
          </> : <>
            <p className="text-sm text-muted-foreground">Upload an academic research paper in PDF format.  JumpServe will run experiments to verify the claims in the paper.</p>
            {result?.error ? <p role="alert" className="text-sm text-destructive">{result.error}</p> : null}
            {owner ? <LocalAssessmentUpload ownerId={owner.id} /> : <Link href={signIn} className="text-primary underline underline-offset-4">Sign in with Google to upload</Link>}
          </>}
        </section>

        <McpSetupDialogs connectionsUrl={connections} />
      </section>
    </main>
  );
}
