import { ResearchHeader } from "@/app/components/research-workflow/header";
import { PaperIntake } from "@/app/components/research-workflow/workspace";
import { requireGoogleUser } from "@/lib/auth";
import { RESEARCH_WORKFLOW_MODULE_PATH as PATH } from "@/lib/test-modules";
export const dynamic = "force-dynamic";
export default async function NewStudy() {
  await requireGoogleUser(`${PATH}/new-study`);
  return <main className="mx-auto max-w-5xl space-y-6 px-4 py-6"><ResearchHeader title="Start a research assessment" description="Save the paper and scope, prepare an available source-grounded plan and queue its checks. Missing domain plans and dependencies remain visible." /><PaperIntake /></main>;
}
