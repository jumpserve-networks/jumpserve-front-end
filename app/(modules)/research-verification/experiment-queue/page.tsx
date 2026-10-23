import { ResearchHeader } from "@/app/components/research-workflow/header";
import { ExperimentQueueDashboard } from "@/app/components/research-workflow/experiment-queue";
import { PublicExperimentQueue } from "@/app/components/research-workflow/public-experiment-queue";
import { requireGoogleUser } from "@/lib/auth";
import { isResearchId } from "@/lib/research-experiment-queue";
import { researchSearchSuffix } from "@/lib/research-pathways";
import { RESEARCH_WORKFLOW_MODULE_PATH as PATH } from "@/lib/test-modules";
import { permanentRedirect } from "next/navigation";
import { assessmentQueueQuery } from "@/lib/research-pathways";

export const dynamic = "force-dynamic";
export default async function QueuePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { query, changed, conflicting } = assessmentQueueQuery(await searchParams);
  const invalid = conflicting || ["assessment", "job", "sourceAssessment", "gap", "run"].some(key => query[key] !== undefined && !isResearchId(query[key])) || Boolean(query.sourceAssessment) !== Boolean(query.gap) || Boolean(query.run && !query.sourceAssessment) || (query.view !== undefined && query.view !== "private");
  if (changed && !invalid) permanentRedirect(`${PATH}/experiment-queue${researchSearchSuffix(query)}`);
  const sharedAssessment = !invalid && isResearchId(query.assessment) && query.view !== "private" && !query.sourceAssessment;
  if (!invalid && !sharedAssessment) await requireGoogleUser(`${PATH}/experiment-queue${researchSearchSuffix(query)}`);
  return <main className="mx-auto max-w-6xl space-y-6 px-4 py-6">
    <ResearchHeader title="Experiment Queue" description="Track paper preparation, claim checks and recorded experiments." />
    {invalid ? <p role="alert" className="rounded-lg border p-4 text-sm text-destructive">This queue link contains an invalid assessment, gap or job identity. Open Experiment Queue from the sidebar to view your jobs.</p> : sharedAssessment ? <PublicExperimentQueue key={query.assessment as string} studyId={query.assessment as string} jobId={query.job as string | undefined} /> : <ExperimentQueueDashboard key={researchSearchSuffix(query)} studyId={query.assessment as string | undefined} jobId={query.job as string | undefined} sourceAssessment={query.sourceAssessment as string | undefined} gapId={query.gap as string | undefined} launchId={query.run as string | undefined} />}
  </main>;
}
