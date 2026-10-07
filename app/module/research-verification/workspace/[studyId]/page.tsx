import { notFound } from "next/navigation";
import { ResearchHeader } from "@/app/components/research-workflow/header";
import { StudyWorkspace } from "@/app/components/research-workflow/workspace";
import { studyView } from "@/app/components/research-workflow/study-panel";
import { requireGoogleUser } from "@/lib/auth";
import { RESEARCH_WORKFLOW_MODULE_PATH as PATH } from "@/lib/test-modules";
export const dynamic = "force-dynamic";
export default async function Workspace({ params, searchParams }: { params: Promise<{ studyId: string }>; searchParams: Promise<{ view?: string }> }) {
  const [{ studyId }, query] = await Promise.all([params, searchParams]);
  if (!/^[a-f0-9-]{36}$/i.test(studyId)) notFound();
  const view = studyView(query.view);
  await requireGoogleUser(`${PATH}/workspace/${studyId}${query.view ? `?view=${view}` : ""}`);
  return <main className="mx-auto max-w-6xl space-y-6 px-4 py-6"><ResearchHeader title="Research workspace" description="Preserve new versions of sources, protocols, assessments and gaps. Browser actions are authenticated; the backend verifies study ownership." /><StudyWorkspace key={studyId} studyId={studyId} view={view} /></main>;
}
