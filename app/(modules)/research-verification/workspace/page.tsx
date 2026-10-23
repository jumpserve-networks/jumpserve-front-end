import { permanentRedirect } from "next/navigation";
import { researchSearchSuffix } from "@/lib/research-pathways";
import { ASSESSMENTS_PATH } from "@/lib/test-modules";
export const dynamic = "force-dynamic";
export default async function LegacyWorkspace({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  permanentRedirect(ASSESSMENTS_PATH + researchSearchSuffix(await searchParams));
}
