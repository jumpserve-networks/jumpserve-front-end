import { notFound } from "next/navigation";
import { requireGoogleUser } from "@/lib/auth";
import { NEW_ASSESSMENT_PATH } from "@/lib/test-modules";
import { ResearchHeader } from "@/app/components/research-workflow/header";
import { PaperReviewPanel } from "@/app/components/research-workflow/paper-review";
import { PaperAssessment } from "@/app/components/research-workflow/paper-assessment";
import { parsePaperAssessmentStep } from "@/lib/paper-assessment-wizard";

export const dynamic = "force-dynamic";
export default async function ReviewPaper({ params, searchParams }: { params: Promise<{ assessmentId: string }>; searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  const { assessmentId } = await params;
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(assessmentId)) notFound();
  const step = parsePaperAssessmentStep((await searchParams)?.step);
  await requireGoogleUser(`${NEW_ASSESSMENT_PATH}/${assessmentId}${step ? `?step=${step}` : ""}`);
  return <PaperAssessment key={assessmentId} assessmentId={assessmentId} allowResume wizard><main className="mx-auto w-full max-w-5xl space-y-6 px-4 py-8 sm:px-6"><ResearchHeader title="Paper breakdown" showModuleLabel={false} /><PaperReviewPanel assessmentId={assessmentId} /></main></PaperAssessment>;
}
