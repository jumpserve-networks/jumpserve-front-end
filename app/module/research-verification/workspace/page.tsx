import { ResearchHeader } from "@/app/components/research-workflow/header";
import { OwnerStudies } from "@/app/components/research-workflow/workspace";
import { requireGoogleUser } from "@/lib/auth";
import { RESEARCH_WORKFLOW_MODULE_PATH as PATH } from "@/lib/test-modules";
export const dynamic = "force-dynamic";
export default async function Workspace() {
  await requireGoogleUser(`${PATH}/workspace`);
  return <main className="mx-auto max-w-5xl space-y-6 px-4 py-6"><ResearchHeader title="My research studies" description="Private drafts, frozen protocols, recorded runs and follow-up plans belong to your authenticated account." /><OwnerStudies /></main>;
}
