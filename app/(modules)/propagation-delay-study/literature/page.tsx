import type { Metadata } from "next";
import { StudyHeader } from "@/app/components/delay-study/header";
import { Card, CardContent, CardHeader, CardTitle } from "@/app/components/ui/card";
import { getStudyPapers } from "@/lib/delay-study-server";

export const metadata: Metadata = { title: "Propagation delay study — literature" };
export const dynamic = "force-dynamic";
export default async function StudyLiteraturePage() {
  const papers = await getStudyPapers();
  return <main className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6"><StudyHeader title="Literature" description="The primary paper’s bibliography, with retrieval and reading status recorded separately. A downloaded PDF does not by itself count as a reviewed paper; substitutions and inaccessible sources remain visible." />
    <p className="text-sm text-muted-foreground">{papers.length} cited references, including software and manuals. The source paper and its author-provided experiment code were also reviewed.</p>
    <div className="space-y-4">{papers.map(p => <Card key={p.reference_number} className="gap-3"><CardHeader><CardTitle className="text-sm leading-6">[{p.reference_number}] {p.citation.replace(/^\d+\s+/, "")}</CardTitle></CardHeader><CardContent className="space-y-3 text-sm"><div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground"><span>{p.kind.replaceAll("_", " ")}</span><span>Retrieval: {p.download_status.replaceAll("_", " ")}</span><span>Reading: {p.reading_status.replaceAll("_", " ")}</span>{p.pages && <span>{p.pages} pages</span>}</div>
      {p.source_url && /^https?:\/\//.test(p.source_url) && <a href={p.source_url} target="_blank" rel="noreferrer" className="inline-block text-primary underline underline-offset-4">Source document ↗</a>}
      {p.version_note && <p>{p.version_note}</p>}{p.reading_notes && !p.reading_notes.endsWith(".md") && <p className="whitespace-pre-line text-muted-foreground">{p.reading_notes}</p>}
      {p.sha256 && <p className="break-all font-mono text-[10px] text-muted-foreground">SHA-256 {p.sha256}</p>}
    </CardContent></Card>)}</div>
  </main>;
}
