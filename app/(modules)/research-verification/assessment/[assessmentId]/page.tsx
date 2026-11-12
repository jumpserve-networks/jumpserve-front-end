import { notFound } from "next/navigation";
import { AssessmentDetail } from "@/app/components/research-workflow/assessment-detail";
import { isResearchId } from "@/lib/research-experiment-queue";
import { requireGoogleUser } from "@/lib/auth";
import { researchAssessmentPath, researchSearchSuffix } from "@/lib/research-pathways";

export const dynamic = "force-dynamic";
export const metadata = { title: "Assessment" };

export default async function Page({ params, searchParams }: { params: Promise<{ assessmentId: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { assessmentId } = await params;
  if (!isResearchId(assessmentId)) notFound();
  const query = await searchParams;
  const { job, gap, run } = query;
  if ([job, gap, run].some(value => value !== undefined && !isResearchId(value)) || (run && !gap)) notFound();
  if (gap) await requireGoogleUser(`${researchAssessmentPath(assessmentId)}${researchSearchSuffix(query)}`);
  return <AssessmentDetail assessmentId={assessmentId} jobId={job as string | undefined} gapId={gap as string | undefined} launchId={run as string | undefined} />;
}
