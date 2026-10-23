import { permanentRedirect } from "next/navigation";
import { researchPublishedPath, researchSearchSuffix } from "@/lib/research-pathways";
import type { PublishedStudyProps } from "@/app/components/research-workflow/published-studies";

export const dynamic = "force-dynamic";

export default async function LegacyAssessment({ params, searchParams }: PublishedStudyProps) {
  const [{ studyId }, query] = await Promise.all([params, searchParams]);
  permanentRedirect(researchPublishedPath("paper", studyId) + researchSearchSuffix(query));
}
