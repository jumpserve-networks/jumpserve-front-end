import { notFound } from "next/navigation";
import { ResearchHeader } from "@/app/components/research-workflow/header";
import { StudyWorkspace } from "@/app/components/research-workflow/workspace";
import { studyView } from "@/app/components/research-workflow/study-panel";
import { requireGoogleUser } from "@/lib/auth";
import { isResearchId } from "@/lib/research-experiment-queue";
import { RESEARCH_IDEAS_MODULE_PATH as PATH } from "@/lib/test-modules";

export const dynamic = "force-dynamic";

export default async function Evidence({ params, searchParams }: { params: Promise<{ studyId: string }>; searchParams: Promise<{ view?: string }> }) {
  const [{ studyId }, query] = await Promise.all([params, searchParams]);
  if (!isResearchId(studyId)) notFound();
  const view = studyView(query.view);
  await requireGoogleUser(`${PATH}/workspace/${studyId}${query.view ? `?view=${view}` : ""}`);
  return <main className="mx-auto max-w-6xl space-y-6 px-4 py-6"><ResearchHeader kind="idea" title="Experiment evidence workspace" /><StudyWorkspace key={studyId} studyId={studyId} view={view} kind="idea" /></main>;
}
