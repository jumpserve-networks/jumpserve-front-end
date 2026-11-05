import { notFound } from "next/navigation";
import { AssessmentDetail } from "@/app/components/research-workflow/assessment-detail";
import { isResearchId } from "@/lib/research-experiment-queue";

export const dynamic = "force-dynamic";
export const metadata = { title: "Assessment" };

export default async function Page({ params }: { params: Promise<{ assessmentId: string }> }) {
  const { assessmentId } = await params;
  if (!isResearchId(assessmentId)) notFound();
  return <AssessmentDetail key={assessmentId} assessmentId={assessmentId} />;
}
