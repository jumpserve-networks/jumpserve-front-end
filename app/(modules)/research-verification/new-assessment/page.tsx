import { ResearchHeader } from "@/app/components/research-workflow/header";
import { PaperIntake } from "@/app/components/research-workflow/workspace";
import { requireGoogleUser } from "@/lib/auth";
import { NEW_ASSESSMENT_PATH } from "@/lib/test-modules";
import { researchSearchSuffix } from "@/lib/research-pathways";

export const dynamic = "force-dynamic";

export default async function NewAssessment({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireGoogleUser(NEW_ASSESSMENT_PATH + researchSearchSuffix(await searchParams));
  return <main className="mx-auto max-w-5xl space-y-6 px-4 py-6"><ResearchHeader title="Start a research assessment" /><PaperIntake /></main>;
}
