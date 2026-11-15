import { notFound, permanentRedirect } from "next/navigation";
import { isResearchId } from "@/lib/research-experiment-queue";
import { researchAssessmentPath, researchSearchSuffix } from "@/lib/research-pathways";

export const dynamic = "force-dynamic";

export default async function Assessment({ params, searchParams }: {
  params: Promise<{ assessmentId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ assessmentId }, query] = await Promise.all([params, searchParams]);
  if (!isResearchId(assessmentId)) notFound();
  permanentRedirect(researchAssessmentPath(assessmentId) + researchSearchSuffix(query));
}
