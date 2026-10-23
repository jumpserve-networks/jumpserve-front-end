import { PreviousAssessments } from "@/app/components/research-workflow/previous-assessments";

export const dynamic = "force-dynamic";

export default async function Page({ searchParams }: { searchParams: Promise<{ before?: string | string[] }> }) {
  const { before } = await searchParams;
  const cursor = Array.isArray(before) ? "invalid" : before;
  return <PreviousAssessments key={cursor ?? "newest"} before={cursor} />;
}
