import { ResearchHeader } from "@/app/components/research-workflow/header";
import { IdeaWorkspace } from "@/app/components/research-workflow/idea-workspace";
import { requireGoogleUser } from "@/lib/auth";
import { RESEARCH_WORKFLOW_MODULE_PATH as PATH } from "@/lib/test-modules";
export const dynamic = "force-dynamic";
export default async function Idea({ params }: { params: Promise<{ studyId: string }> }) {
  const { studyId } = await params;
  await requireGoogleUser(`${PATH}/ideas/${studyId}`);
  return <main className="mx-auto max-w-6xl space-y-6 px-4 py-6"><ResearchHeader title="Research idea workspace" description="Develop the plan, test whether it stands on its own, and preserve the evidence from later experiments. Planning progress and scientific results are separate." /><IdeaWorkspace key={studyId} studyId={studyId} /></main>;
}
