import { permanentRedirect } from "next/navigation";
import { PREVIOUS_ASSESSMENTS_PATH } from "@/lib/test-modules";
import { researchSearchSuffix } from "@/lib/research-pathways";

// The config redirect runs first; retain a route fallback for saved links.
export default async function LegacyResults({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  permanentRedirect(PREVIOUS_ASSESSMENTS_PATH + researchSearchSuffix(await searchParams));
}
