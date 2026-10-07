import Link from "next/link";
import { ResearchHeader } from "@/app/components/research-workflow/header";
import { StudyPanel, studyView } from "@/app/components/research-workflow/study-panel";
import { getResearchSnapshot } from "@/lib/research-workflow-server";
import { RESEARCH_WORKFLOW_MODULE_PATH as PATH } from "@/lib/test-modules";
export const dynamic = "force-dynamic";
export default async function Study({ params, searchParams }: { params: Promise<{ studyId: string }>; searchParams: Promise<{ view?: string }> }) {
  const [{ studyId }, query] = await Promise.all([params, searchParams]);
  const result = await getResearchSnapshot(studyId);
  return <main className="mx-auto max-w-6xl space-y-6 px-4 py-6"><ResearchHeader title={result.status === "available" ? result.data.study.title : "Research assessment unavailable"} description="Claim coverage, tested conditions, literature and next experiments are part of the same preserved study." />{result.status === "available" ? <><div className="flex flex-wrap gap-4 text-sm"><Link className="underline" href={`${PATH}/api/studies/${studyId}/export`}>Download complete published JSON</Link><Link className="underline" href={`${PATH}/api/studies/${studyId}/export?format=csv`}>Download measurements CSV</Link></div><StudyPanel snapshot={result.data} view={studyView(query.view)} basePath={`${PATH}/studies/${studyId}`} /></> : <p role="status" className="rounded-lg border p-4 text-sm">{result.reason}</p>}</main>;
}
