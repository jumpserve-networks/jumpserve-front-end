import { ResearchHeader } from "@/app/components/research-workflow/header";
import { PaperIntake } from "@/app/components/research-workflow/workspace";
import { requireGoogleUser } from "@/lib/auth";
import { NEW_ASSESSMENT_PATH } from "@/lib/test-modules";
import { researchSearchSuffix } from "@/lib/research-pathways";
import { PaperAssessmentSteps } from "@/app/components/research-workflow/paper-assessment-steps";

export const dynamic = "force-dynamic";

export default async function NewAssessment({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireGoogleUser(NEW_ASSESSMENT_PATH + researchSearchSuffix(await searchParams));
  return <main className="mx-auto max-w-5xl space-y-6 px-4 py-6"><ResearchHeader title="New Paper Assessment" /><PaperAssessmentSteps current="upload" /><section aria-labelledby="paper-upload-step" className="space-y-4"><h2 id="paper-upload-step" className="text-lg font-semibold">Paper Upload</h2><PaperIntake wizard /></section></main>;
}
