import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { getGoogleUser, requireGoogleUser } from "@/lib/auth";
import { AssessmentDetail } from "@/app/components/research-workflow/assessment-detail";
import { PaperReviewPanel } from "@/app/components/research-workflow/paper-review";
import { PaperAssessment } from "@/app/components/research-workflow/paper-assessment";
import { isResearchId } from "@/lib/research-experiment-queue";
import { researchAssessmentPath, researchSearchSuffix } from "@/lib/research-pathways";
import { loadSharedLocalPaperAssessment } from "@/lib/local-paper-assessment-server";
import { SharedLocalPaperAssessment } from "@/app/components/research-workflow/shared-local-paper-assessment";
import { SkillAssessment } from "@/app/components/research-workflow/skill-assessment";
import { Badge } from "@/app/components/ui/badge";
import { Button } from "@/app/components/ui/button";
import { mcpConfig } from "@/lib/jumpserve-mcp-oauth";
import { approveAssessment, readAssessmentPreview, readSharedSkillAssessment, submitAssessment } from "@/lib/jumpserve-mcp-store";

async function share(id: string, hash: string) {
  "use server";
  if (!mcpConfig() || !isResearchId(id) || !/^[a-f0-9]{64}$/.test(hash)) notFound();
  const path = researchAssessmentPath(id);
  const user = await requireGoogleUser(path);
  if (!await approveAssessment(user.id, id, hash)) {
    const preview = await readAssessmentPreview(user.id, id);
    if (preview?.hash !== hash || !preview.studyId) notFound();
    revalidatePath(path);
    redirect(researchAssessmentPath(preview.studyId));
  }
  let studyId = id;
  try {
    studyId = await submitAssessment(user.id, id);
  } catch {
    // Refresh the same page to reconcile a submission that may have completed.
  }
  revalidatePath(path);
  redirect(researchAssessmentPath(studyId));
}

export const dynamic = "force-dynamic";
export const metadata = { title: "Assessment" };

export default async function AssessmentPage({ params, searchParams }: { params: Promise<{ assessmentId: string }>; searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  const { assessmentId } = await params;
  if (!isResearchId(assessmentId)) notFound();
  const path = researchAssessmentPath(assessmentId);
  const query = (await searchParams) ?? {};
  const { job, gap, run } = query;
  if ([job, gap, run].some(value => value !== undefined && !isResearchId(value)) || (run && !gap)) notFound();
  if (gap) await requireGoogleUser(path + researchSearchSuffix(query));
  const sharedSkill = gap ? null : await readSharedSkillAssessment(assessmentId).catch(() => null);
  if (sharedSkill) return <main className="mx-auto max-w-6xl px-4 py-6" data-testid="assessment-detail">
    <SkillAssessment bundle={sharedSkill} path={path} query={query} />
  </main>;
  const user = !gap && mcpConfig() ? await getGoogleUser() : undefined;
  const preview = user ? await readAssessmentPreview(user.id, assessmentId).catch(() => null) : null;
  if (preview && !preview.studyId) {
    const includesPdf = preview.bundle.paper.pdf_copy;
    const canShare = preview.complete && (!includesPdf || preview.pdfReady);
    return <main className="mx-auto max-w-5xl space-y-6 px-4 py-8" data-testid="assessment-detail">
      <meta name="robots" content="noindex, nofollow" />
      <div className="content-panel space-y-3 rounded-xl border p-5">
        {canShare ? <>
          <Badge variant="secondary">Private</Badge>
          {preview.approved
            ? <p role="status">This assessment is approved for public sharing. You can finish sharing it here.</p>
            : <p>This assessment stays private until you choose to share it publicly.</p>}
          {includesPdf ? <p>Public sharing includes the attached source PDF.</p> : null}
          <form action={share.bind(null, assessmentId, preview.hash)}>
            <Button type="submit">{preview.approved ? "Finish sharing publicly" : "Share publicly"}</Button>
          </form>
        </> : <p role="status">The source PDF is unavailable for public sharing.</p>}
      </div>
      <SkillAssessment bundle={preview.bundle} path={path} query={query} pdfReady={preview.pdfReady} />
    </main>;
  }
  const local = gap ? { status: "absent" as const } : await loadSharedLocalPaperAssessment(assessmentId);
  if (local.status === "available" && (user === undefined ? await getGoogleUser() : user)?.id !== local.owner) return <main className="mx-auto max-w-6xl space-y-6 px-4 py-6" data-testid="assessment-detail">
    <AssessmentDetail assessmentId={assessmentId} embedded />
    <SharedLocalPaperAssessment value={local.value} />
  </main>;
  return <main className="mx-auto max-w-6xl space-y-6 px-4 py-6" data-testid="assessment-detail">
    {local.status === "unavailable" ? <p role="alert" className="text-sm text-destructive">Shared local assessment details are temporarily unavailable.</p> : null}
    <PaperAssessment key={assessmentId} assessmentId={assessmentId} allowResume wizard embedded ownerOnly header={<AssessmentDetail assessmentId={assessmentId} gapId={gap as string | undefined} launchId={run as string | undefined} embedded />}><PaperReviewPanel assessmentId={assessmentId} /></PaperAssessment>
  </main>;
}
