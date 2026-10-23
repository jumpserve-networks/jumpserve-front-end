import { PublishedStudy } from "@/app/components/research-workflow/published-studies";

export const dynamic = "force-dynamic";

export default function Assessment({ params, searchParams }: {
  params: Promise<{ assessmentId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return <PublishedStudy params={params.then(({ assessmentId }) => ({ studyId: assessmentId }))} searchParams={searchParams} kind="paper" />;
}
