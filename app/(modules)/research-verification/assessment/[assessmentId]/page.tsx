import { notFound } from "next/navigation";
import { requireGoogleUser } from "@/lib/auth";
import { AssessmentDetail } from "@/app/components/research-workflow/assessment-detail";
import { PaperReviewPanel } from "@/app/components/research-workflow/paper-review";
import { PaperAssessment } from "@/app/components/research-workflow/paper-assessment";
import { isResearchId } from "@/lib/research-experiment-queue";
import { researchAssessmentPath, researchSearchSuffix } from "@/lib/research-pathways";

export const dynamic = "force-dynamic";
export const metadata = { title: "Assessment" };

export default async function AssessmentPage({ params, searchParams }: { params: Promise<{ assessmentId: string }>; searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  const { assessmentId } = await params;
  if (!isResearchId(assessmentId)) notFound();
  const query = (await searchParams) ?? {};
  const { job, gap, run } = query;
  if ([job, gap, run].some(value => value !== undefined && !isResearchId(value)) || (run && !gap)) notFound();
  if (gap) await requireGoogleUser(`${researchAssessmentPath(assessmentId)}${researchSearchSuffix(query)}`);
  return <main className="mx-auto max-w-6xl space-y-6 px-4 py-6" data-testid="assessment-detail">
    <PaperAssessment key={assessmentId} assessmentId={assessmentId} allowResume wizard embedded ownerOnly header={<AssessmentDetail assessmentId={assessmentId} gapId={gap as string | undefined} launchId={run as string | undefined} embedded />}><PaperReviewPanel assessmentId={assessmentId} /></PaperAssessment>
  </main>;
}
