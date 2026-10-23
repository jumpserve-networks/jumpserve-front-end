import { permanentRedirect } from "next/navigation";
import { NEW_ASSESSMENT_PATH } from "@/lib/test-modules";
import { researchSearchSuffix } from "@/lib/research-pathways";

export default async function LegacyNewStudy({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  permanentRedirect(NEW_ASSESSMENT_PATH + researchSearchSuffix(await searchParams));
}
