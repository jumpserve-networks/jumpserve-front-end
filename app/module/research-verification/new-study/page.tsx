import { ResearchHeader } from "@/app/components/research-workflow/header";
import { PaperIntake } from "@/app/components/research-workflow/workspace";
import { requireGoogleUser } from "@/lib/auth";
import { RESEARCH_WORKFLOW_MODULE_PATH as PATH } from "@/lib/test-modules";
export const dynamic = "force-dynamic";
export default async function NewStudy() {
  await requireGoogleUser(`${PATH}/new-study`);
  return <main className="mx-auto max-w-5xl space-y-6 px-4 py-6"><ResearchHeader title="Assess a research paper" description="Start a private, versioned evidence register. Select methods appropriate to the paper and preserve the limits of every result." /><PaperIntake /></main>;
}
