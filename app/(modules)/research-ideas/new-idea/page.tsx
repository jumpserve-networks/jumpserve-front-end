import { ResearchHeader } from "@/app/components/research-workflow/header";
import { IdeaIntake } from "@/app/components/research-ideas/idea-workspace";
import { requireGoogleUser } from "@/lib/auth";
import { RESEARCH_IDEAS_MODULE_PATH as PATH } from "@/lib/test-modules";
import { researchSearchSuffix } from "@/lib/research-pathways";
export const dynamic = "force-dynamic";
export default async function NewIdea({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireGoogleUser(`${PATH}/new-idea${researchSearchSuffix(await searchParams)}`);
  return <main className="mx-auto max-w-5xl space-y-6 px-4 py-6"><ResearchHeader kind="idea" title="Develop a new research idea" description="Start with a question or unpublished hypothesis. Refine a versioned plan, challenge it in fresh review sessions, and preregister a test. No paper or DOI is required." /><IdeaIntake /></main>;
}
