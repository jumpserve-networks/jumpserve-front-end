import { ResearchHeader } from "@/app/components/research-workflow/header";
import { IdeaWorkspace } from "@/app/components/research-ideas/idea-workspace";
import { requireGoogleUser } from "@/lib/auth";
import { RESEARCH_IDEAS_MODULE_PATH as PATH } from "@/lib/test-modules";
import { researchSearchSuffix } from "@/lib/research-pathways";
export const dynamic = "force-dynamic";
export default async function Idea({ params, searchParams }: { params: Promise<{ studyId: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [{ studyId }, query] = await Promise.all([params, searchParams]);
  await requireGoogleUser(`${PATH}/ideas/${studyId}${researchSearchSuffix(query)}`);
  return <main className="mx-auto max-w-6xl space-y-6 px-4 py-6"><ResearchHeader kind="idea" title="Plan your experiment" description="Start with a question. A guided conversation helps you specify the methods, resolve missing details, and review the plan before running an experiment." /><IdeaWorkspace key={studyId} studyId={studyId} /></main>;
}
