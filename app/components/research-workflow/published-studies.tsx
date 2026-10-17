import Link from "next/link";
import { permanentRedirect } from "next/navigation";
import { ResearchHeader } from "@/app/components/research-workflow/header";
import { StudyPanel, studyView } from "@/app/components/research-workflow/study-panel";
import { getResearchSnapshot, getResearchStudies } from "@/lib/research-workflow-server";
import { researchModulePath, researchSearchSuffix, researchStudyKind, studiesForPathway, type ResearchStudyKind } from "@/lib/research-pathways";

export async function PublishedStudies({ kind }: { kind: ResearchStudyKind }) {
  const result = await getResearchStudies();
  const base = researchModulePath(kind);
  const studies = result.status === "available" ? studiesForPathway(result.data.studies, kind) : [];
  return <main className="mx-auto max-w-6xl space-y-6 px-4 py-6">
    <ResearchHeader kind={kind} showModuleLabel={kind !== "paper"} title={kind === "idea" ? "Published idea experiments" : "Published research assessments"} />
    {result.status !== "available" ? <p role="status" className="rounded-lg border p-4 text-sm">{result.reason}</p> : <>
      {studies.length === 0 ? <section className="space-y-2 rounded-lg border p-5">
        <h2 className="font-semibold">{result.data.has_more ? "No matching studies in the available list" : kind === "idea" ? "No published idea experiments yet" : "No published assessments yet"}</h2>
        <p className="text-sm text-muted-foreground">Private drafts and planned experiments are not completed studies. Publish a reviewed snapshot when its declared checks pass.</p>
        <Link className="text-sm underline" href={`${base}/${kind === "idea" ? "new-idea" : "new-study"}`}>{kind === "idea" ? "Develop an idea" : "Assess a paper"}</Link>
      </section> : <div className="grid gap-4 md:grid-cols-2">{studies.map(study => <article key={study.id} className="space-y-3 rounded-lg border p-5">
        <p className="text-xs text-muted-foreground">{study.domain}</p>
        <h2 className="font-semibold"><Link className="underline" href={`${base}/studies/${study.id}`}>{study.title}</Link></h2>
        <p className="text-sm text-muted-foreground">{study.scope}</p>
        <Link className="text-sm underline" href={`${base}/studies/${study.id}?view=gaps`}>Evidence gaps and next experiments</Link>
      </article>)}</div>}
      {result.data.has_more ? <p className="text-sm">Showing matching results from the first 100 published studies across both pathways. Additional studies exist; this list is not a census.</p> : null}
    </>}
  </main>;
}

export type PublishedStudyProps = {
  params: Promise<{ studyId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function PublishedStudy({ kind, params, searchParams }: PublishedStudyProps & { kind: ResearchStudyKind }) {
  const [{ studyId }, query] = await Promise.all([params, searchParams]);
  const result = await getResearchSnapshot(studyId);
  const base = researchModulePath(kind);
  if (result.status === "available" && researchStudyKind(result.data.study) !== kind) {
    permanentRedirect(`${researchModulePath(researchStudyKind(result.data.study))}/studies/${studyId}${researchSearchSuffix(query)}`);
  }
  return <main className="mx-auto max-w-6xl space-y-6 px-4 py-6">
    <ResearchHeader kind={kind} title={result.status === "available" ? result.data.study.title : "Research assessment unavailable"} description="Claim coverage, tested conditions, literature and next experiments are part of the same preserved study." />
    {result.status === "available" ? <>
      <div className="flex flex-wrap gap-4 text-sm"><Link className="underline" href={`${base}/api/studies/${studyId}/export`}>Download complete published JSON</Link><Link className="underline" href={`${base}/api/studies/${studyId}/export?format=csv`}>Download measurements CSV</Link></div>
      <StudyPanel snapshot={result.data} view={studyView(typeof query.view === "string" ? query.view : undefined)} basePath={`${base}/studies/${studyId}`} />
    </> : <p role="status" className="rounded-lg border p-4 text-sm">{result.reason}</p>}
  </main>;
}
