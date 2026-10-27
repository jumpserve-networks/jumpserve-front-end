import { ResearchHeader } from "@/app/components/research-workflow/header";
import { OwnerStudies } from "@/app/components/research-workflow/workspace";
import { requireGoogleUser } from "@/lib/auth";
import { researchSearchSuffix } from "@/lib/research-pathways";
import { MY_ASSESSMENTS_PATH } from "@/lib/test-modules";

export const dynamic = "force-dynamic";

export default async function MyAssessments({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireGoogleUser(MY_ASSESSMENTS_PATH + researchSearchSuffix(await searchParams));
  return <main className="mx-auto max-w-5xl space-y-6 px-4 py-6"><ResearchHeader title="My Assessments" description="Resume your private paper assessments, frozen protocols, recorded runs and follow-up plans." /><OwnerStudies /></main>;
}
