import { notFound } from "next/navigation";
import { getGoogleUser, requireGoogleUser } from "@/lib/auth";
import { AssessmentDetail } from "@/app/components/research-workflow/assessment-detail";
import { PaperReviewPanel } from "@/app/components/research-workflow/paper-review";
import { PaperAssessment } from "@/app/components/research-workflow/paper-assessment";
import { isResearchId } from "@/lib/research-experiment-queue";
import { researchAssessmentPath, researchSearchSuffix } from "@/lib/research-pathways";
import { loadSharedLocalPaperAssessment } from "@/lib/local-paper-assessment-server";
import { SharedLocalPaperAssessment } from "@/app/components/research-workflow/shared-local-paper-assessment";
import { SkillAssessment } from "@/app/components/research-workflow/skill-assessment";
import { readSharedSkillAssessment } from "@/lib/jumpserve-mcp-store";

export const dynamic = "force-dynamic";
export const metadata = { title: "Assessment" };

export default async function AssessmentPage({ params, searchParams }: { params: Promise<{ assessmentId: string }>; searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  const { assessmentId } = await params;
  if (!isResearchId(assessmentId)) notFound();
  const query = (await searchParams) ?? {};
  const { job, gap, run } = query;
  if ([job, gap, run].some(value => value !== undefined && !isResearchId(value)) || (run && !gap)) notFound();
  if (gap) await requireGoogleUser(`${researchAssessmentPath(assessmentId)}${researchSearchSuffix(query)}`);
  const sharedSkill = gap ? null : await readSharedSkillAssessment(assessmentId).catch(() => null);
  if (sharedSkill) return <main className="mx-auto max-w-6xl px-4 py-6" data-testid="assessment-detail">
    <SkillAssessment bundle={sharedSkill} path={researchAssessmentPath(assessmentId)} query={query} />
  </main>;
  const local = gap ? { status: "absent" as const } : await loadSharedLocalPaperAssessment(assessmentId);
  if (local.status === "available" && (await getGoogleUser())?.id !== local.owner) return <main className="mx-auto max-w-6xl space-y-6 px-4 py-6" data-testid="assessment-detail">
    <AssessmentDetail assessmentId={assessmentId} embedded />
    <SharedLocalPaperAssessment value={local.value} />
  </main>;
  return <main className="mx-auto max-w-6xl space-y-6 px-4 py-6" data-testid="assessment-detail">
    {local.status === "unavailable" ? <p role="alert" className="text-sm text-destructive">Shared local assessment details are temporarily unavailable.</p> : null}
    <PaperAssessment key={assessmentId} assessmentId={assessmentId} allowResume wizard embedded ownerOnly header={<AssessmentDetail assessmentId={assessmentId} gapId={gap as string | undefined} launchId={run as string | undefined} embedded />}><PaperReviewPanel assessmentId={assessmentId} /></PaperAssessment>
  </main>;
}
