import { permanentRedirect } from "next/navigation";
import { researchResultsPath, researchSearchSuffix } from "@/lib/research-pathways";
import type { AssessmentResultProps } from "@/app/components/research-workflow/assessment-results";

export const dynamic = "force-dynamic";

export default async function LegacyAssessment({ params, searchParams }: AssessmentResultProps) {
  const [{ studyId }, query] = await Promise.all([params, searchParams]);
  permanentRedirect(researchResultsPath("paper", studyId) + researchSearchSuffix(query));
}
