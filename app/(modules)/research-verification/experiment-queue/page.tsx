import { ResearchHeader } from "@/app/components/research-workflow/header";
import { ExperimentQueueDashboard } from "@/app/components/research-workflow/experiment-queue";
import { requireGoogleUser } from "@/lib/auth";
import { isResearchId } from "@/lib/research-experiment-queue";
import { researchSearchSuffix } from "@/lib/research-pathways";
import { RESEARCH_WORKFLOW_MODULE_PATH as PATH } from "@/lib/test-modules";

export const dynamic = "force-dynamic";
export default async function QueuePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = await searchParams;
  await requireGoogleUser(`${PATH}/experiment-queue${researchSearchSuffix(query)}`);
  const invalid = ["study", "job", "sourceStudy", "gap", "run"].some(key => query[key] !== undefined && !isResearchId(query[key])) || Boolean(query.sourceStudy) !== Boolean(query.gap) || Boolean(query.run && !query.sourceStudy);
  return <main className="mx-auto max-w-6xl space-y-6 px-4 py-6">
    <ResearchHeader title="Experiment Queue" description="Track your paper experiments from queueing through execution and evidence review." />
    {invalid ? <p role="alert" className="rounded-lg border p-4 text-sm text-destructive">This queue link contains an invalid study, gap or job identity. Open Experiment Queue from the sidebar to view your jobs.</p> : <ExperimentQueueDashboard key={researchSearchSuffix(query)} studyId={query.study as string | undefined} jobId={query.job as string | undefined} sourceStudy={query.sourceStudy as string | undefined} gapId={query.gap as string | undefined} launchId={query.run as string | undefined} />}
  </main>;
}
