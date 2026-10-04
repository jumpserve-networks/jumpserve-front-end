import { LeoHeader } from "@/app/components/leo-study/header";
import { getLeoPapers } from "@/lib/leo-study-server";
export const dynamic = "force-dynamic";
export default async function LeoLiteraturePage() {
  const papers = await getLeoPapers();
  const research = papers.filter(p => p.kind === "research");
  return <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6"><LeoHeader title="Literature and source coverage" description="The complete bibliography is retained. Retrieval and reading status distinguish reviewed papers, alternate versions, and sources that remain inaccessible." />
    <p className="mb-5 text-sm">{research.filter(p => p.download_status === "downloaded").length}/{research.length} cited research sources downloaded; {research.filter(p => p.reading_status === "reviewed").length} reviewed. Reviews can include complete author-uploaded web text when a PDF is inaccessible; each version note identifies the format. A download alone is not a completed review.</p>
    <div className="space-y-3">{papers.map(p => <article key={p.reference_number} className="rounded-lg border p-4 text-sm"><h2 className="font-medium">[{p.reference_number === 0 ? "Main paper" : p.reference_number}] {p.citation}</h2><p className="mt-2 text-muted-foreground">{p.kind} · {p.download_status} · {p.reading_status}{p.pages ? ` · ${p.pages} pages` : ""}</p>{p.source_url && /^https?:\/\//.test(p.source_url) && <a href={p.source_url} target="_blank" rel="noreferrer" className="mt-2 inline-block underline underline-offset-4">Source</a>}{p.version_note && <p className="mt-2">Version note: {p.version_note}</p>}{p.reading_notes && <p className="mt-2 whitespace-pre-line text-muted-foreground">{p.reading_notes}</p>}</article>)}</div>
  </main>;
}
