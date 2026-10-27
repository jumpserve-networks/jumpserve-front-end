import { permanentRedirect } from "next/navigation";
import { researchSearchSuffix } from "@/lib/research-pathways";
import { MY_ASSESSMENTS_PATH } from "@/lib/test-modules";

export const dynamic = "force-dynamic";

export default async function LegacyAssessments({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  permanentRedirect(MY_ASSESSMENTS_PATH + researchSearchSuffix(await searchParams));
}
