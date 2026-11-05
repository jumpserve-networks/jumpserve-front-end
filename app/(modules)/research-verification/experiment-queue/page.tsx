import { notFound, permanentRedirect } from "next/navigation";
import { isResearchId } from "@/lib/research-experiment-queue";
import { assessmentQueueQuery, researchAssessmentPath, researchSearchSuffix } from "@/lib/research-pathways";
import { ASSESSMENTS_PATH } from "@/lib/test-modules";

export const dynamic = "force-dynamic";

// Saved queue URLs resolve to the assessment that now owns the queue.
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { query, conflicting } = assessmentQueueQuery(await searchParams);
  const invalid = conflicting || ["assessment", "job", "sourceAssessment", "gap", "run"].some(key => query[key] !== undefined && !isResearchId(query[key])) || Boolean(query.sourceAssessment) !== Boolean(query.gap) || Boolean(query.run && !query.gap) || Boolean(query.assessment && query.sourceAssessment) || query.view !== undefined;
  if (invalid) notFound();
  const { assessment, sourceAssessment, ...remaining } = query;
  const id = assessment ?? sourceAssessment;
  if (!id) {
    if (query.job) notFound();
    permanentRedirect(`${ASSESSMENTS_PATH}${researchSearchSuffix({ ...remaining, mine: "1" })}`);
  }
  permanentRedirect(`${researchAssessmentPath(id as string)}${researchSearchSuffix(remaining)}#${query.job ? `job-${query.job}` : "experiment-queue"}`);
}
