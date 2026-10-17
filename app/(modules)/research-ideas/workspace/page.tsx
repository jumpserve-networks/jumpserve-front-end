import { ResearchHeader } from "@/app/components/research-workflow/header";
import { OwnerStudies } from "@/app/components/research-workflow/workspace";
import { requireGoogleUser } from "@/lib/auth";
import { RESEARCH_IDEAS_MODULE_PATH as PATH } from "@/lib/test-modules";

export const dynamic = "force-dynamic";

export default async function Ideas() {
  await requireGoogleUser(`${PATH}/workspace`);
  return <main className="mx-auto max-w-5xl space-y-6 px-4 py-6"><ResearchHeader kind="idea" title="My research ideas" description="Resume your unpublished hypotheses, saved plans, fresh reviews and experiment evidence." /><OwnerStudies kind="idea" /></main>;
}
