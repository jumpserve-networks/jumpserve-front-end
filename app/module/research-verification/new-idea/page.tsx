import { ResearchHeader } from "@/app/components/research-workflow/header";
import { IdeaIntake } from "@/app/components/research-workflow/idea-workspace";
import { requireGoogleUser } from "@/lib/auth";
import { RESEARCH_WORKFLOW_MODULE_PATH as PATH } from "@/lib/test-modules";
export const dynamic = "force-dynamic";
export default async function NewIdea() {
  await requireGoogleUser(`${PATH}/new-idea`);
  return <main className="mx-auto max-w-5xl space-y-6 px-4 py-6"><ResearchHeader title="Develop a new research idea" description="Start with a question or unpublished hypothesis. Refine a versioned plan, challenge it in fresh review sessions, and preregister a test. No paper or DOI is required." /><IdeaIntake /></main>;
}
