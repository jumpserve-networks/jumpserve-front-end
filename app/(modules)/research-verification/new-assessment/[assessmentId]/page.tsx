import { notFound } from "next/navigation";
import { requireGoogleUser } from "@/lib/auth";
import { NEW_ASSESSMENT_PATH } from "@/lib/test-modules";
import { ResearchHeader } from "@/app/components/research-workflow/header";
import { PaperReviewPanel } from "@/app/components/research-workflow/paper-review";

export const dynamic = "force-dynamic";
export default async function ReviewPaper({ params }: { params: Promise<{ assessmentId: string }> }) {
  const { assessmentId } = await params;
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(assessmentId)) notFound();
  await requireGoogleUser(`${NEW_ASSESSMENT_PATH}/${assessmentId}`);
  return <main className="mx-auto w-full max-w-5xl space-y-6 px-4 py-8 sm:px-6"><ResearchHeader title="Review your paper" showModuleLabel={false} /><PaperReviewPanel key={assessmentId} assessmentId={assessmentId} /></main>;
}
