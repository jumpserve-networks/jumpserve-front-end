import { ResearchHeader } from "@/app/components/research-workflow/header";
import { IdeaWorkspace } from "@/app/components/research-workflow/idea-workspace";
import { requireGoogleUser } from "@/lib/auth";
import { RESEARCH_WORKFLOW_MODULE_PATH as PATH } from "@/lib/test-modules";
export const dynamic = "force-dynamic";
export default async function Idea({ params }: { params: Promise<{ studyId: string }> }) {
  const { studyId } = await params;
  await requireGoogleUser(`${PATH}/ideas/${studyId}`);
  return <main className="mx-auto max-w-6xl space-y-6 px-4 py-6"><ResearchHeader title="Plan your experiment" description="Start with a question. A guided conversation helps you specify the methods, resolve missing details, and review the plan before running an experiment." /><IdeaWorkspace key={studyId} studyId={studyId} /></main>;
}
