"use client";

import Link from "next/link";
import Form from "next/form";
import { LocalDateTime, useUserPreferences } from "@/app/components/user-preferences";
import { useEffect, useState } from "react";
import { Badge } from "@/app/components/ui/badge";
import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/app/components/ui/table";
import { NEW_ASSESSMENT_PATH, ASSESSMENTS_PATH } from "@/lib/test-modules";
import { researchAssessmentPath } from "@/lib/research-pathways";
import { paperWorkflowLabel, type PaperAssessment, type PaperCatalog } from "@/lib/research-paper-catalog";
import { assessmentListPath, loadAssessmentList, type AssessmentListOptions, type AssessmentView } from "@/lib/research-assessment-list";
import { PaperAuthors, usePaperBibliography } from "./paper-bibliography";
import { ResearchHeader } from "./header";

export function Assessments({ before, mine = false, name = "", view = "card" }: AssessmentListOptions) {
  const preferences = useUserPreferences();
  const userId = mine ? preferences?.userId : null;
  const returnPath = assessmentListPath({ mine, before, name, view });
  return <main className="mx-auto max-w-6xl space-y-6 px-4 py-6" data-testid="assessments">
    <ResearchHeader title="Assessments" showModuleLabel={false} />
    <div className="flex flex-wrap items-center justify-between gap-3">
      <nav aria-label="Assessment filter" className="flex w-fit max-w-full rounded-lg border bg-muted/40 p-1">
        <Button size="sm" variant={mine ? "ghost" : "secondary"} nativeButton={false} render={<Link href={assessmentListPath({ name, view })} aria-current={!mine ? "page" : undefined} />}>All Assessments</Button>
        <Button size="sm" variant={mine ? "secondary" : "ghost"} nativeButton={false} render={<Link href={assessmentListPath({ mine: true, name, view })} aria-current={mine ? "page" : undefined} />}>My Assessments</Button>
      </nav>
      <nav aria-label="Assessment view" className="flex w-fit rounded-lg border bg-muted/40 p-1">
        {(["card", "table"] as const).map(option => <Button key={option} size="sm" variant={view === option ? "secondary" : "ghost"} nativeButton={false} render={<Link href={assessmentListPath({ mine, before, name, view: option })} scroll={false} aria-current={view === option ? "page" : undefined} />}>{option === "card" ? "Card" : "Table"}</Button>)}
      </nav>
    </div>
    <Form action={ASSESSMENTS_PATH} className="flex flex-wrap items-end gap-2">
      {mine ? <Input type="hidden" name="mine" value="1" readOnly /> : null}
      {view === "table" ? <Input type="hidden" name="view" value="table" readOnly /> : null}
      <label className="min-w-0 flex-1 space-y-1 text-sm sm:max-w-md"><span>Filter by name</span><Input name="name" type="search" defaultValue={name} maxLength={200} placeholder="Assessment, author or initiator" /></label>
      <Button type="submit" variant="outline">Filter</Button>
      {name ? <Button variant="ghost" nativeButton={false} render={<Link href={assessmentListPath({ mine, view })} />}>Clear</Button> : null}
    </Form>
    {mine && !userId ? preferences?.loading ? <p role="status">Checking sign-in…</p> : preferences?.error ? <div role="alert" className="space-y-3 rounded-lg border p-4 text-sm"><p>{preferences.error}</p><Button variant="outline" onClick={() => preferences.refresh()}>Retry sign-in check</Button></div> : <p className="rounded-lg border p-4 text-sm"><Link className="underline" href={`/login?${new URLSearchParams({ next: returnPath })}`}>Sign in</Link> to view your assessments.</p> : <AssessmentList key={`${userId ?? "all"}:${before ?? "newest"}:${name}`} before={before} userId={userId ?? undefined} name={name} view={view} />}
  </main>;
}

function AssessmentBadges({ paper }: { paper: PaperAssessment }) {
  return <div className="flex flex-wrap gap-2">{paper.workflow_status !== null || !paper.published ? <Badge variant="secondary">{paperWorkflowLabel(paper.workflow_status)}</Badge> : null}<Badge variant="outline">{paper.published ? "Published assessment" : "Not published"}</Badge></div>;
}

function AssessmentList({ before, userId, name, view }: { before?: string; userId?: string; name: string; view: AssessmentView }) {
  const [data, setData] = useState<PaperCatalog | null>(null);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const bibliography = usePaperBibliography(data?.papers);
  const options = { mine: !!userId, name, view };
  const papers = data?.papers.map(paper => ({ ...paper, displayTitle: paper.title ?? bibliography[paper.id]?.title ?? "Reading paper title…", authors: paper.authors ?? bibliography[paper.id]?.authors, authorsLoading: paper.authors == null && !bibliography[paper.id] }));
  useEffect(() => {
    const controller = new AbortController();
    const request = loadAssessmentList({ userId, before, name }, controller.signal);
    request.then(value => {
      if (!controller.signal.aborted) { setData(value); setError(""); }
    }).catch(failure => { if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : "The assessment list is unavailable. Counts are unknown."); });
    return () => controller.abort();
  }, [before, userId, name, revision]);
  return <>
    {error ? <div role="alert" className="space-y-3 rounded-lg border p-4 text-sm"><p>{error}</p><Button variant="outline" onClick={() => { setData(null); setError(""); setRevision(value => value + 1); }}>Try again</Button></div> : !data ? <p role="status">{name ? "Filtering assessments…" : "Loading paper assessments…"}</p> : <>
      {!data.papers.length ? <section className="space-y-3 rounded-lg border p-5"><h2 className="font-semibold">{name ? "No assessments match this name" : before ? "No assessments on this page" : userId ? "You have no assessments yet" : "No paper assessments submitted yet"}</h2>{name ? <Link className="text-sm underline" href={assessmentListPath({ ...options, name: "" })}>Clear name filter</Link> : <Link className="text-sm underline" href={NEW_ASSESSMENT_PATH}>Assess a paper</Link>}</section> : view === "table" ? <div className="rounded-lg border"><Table className="min-w-[48rem]">
        <TableCaption className="sr-only">Assessments</TableCaption>
        <TableHeader><TableRow><TableHead scope="col">Assessment</TableHead><TableHead scope="col">Status</TableHead><TableHead scope="col">Initiated by</TableHead><TableHead scope="col">Submitted</TableHead></TableRow></TableHeader>
        <TableBody>{papers?.map(paper => <TableRow key={paper.id} data-paper-id={paper.id} className="relative focus-within:bg-muted/50">
          <TableCell className="min-w-64 max-w-lg space-y-2 whitespace-normal align-top"><Link className="break-words font-semibold underline after:absolute after:inset-0" href={researchAssessmentPath(paper.id)}>{paper.displayTitle}</Link><PaperAuthors authors={paper.authors} loading={paper.authorsLoading} /></TableCell>
          <TableCell className="min-w-44 max-w-56 whitespace-normal align-top"><AssessmentBadges paper={paper} /></TableCell>
          <TableCell className="max-w-48 whitespace-normal break-words align-top">{paper.initiated_by ?? "Name unavailable"}</TableCell>
          <TableCell className="whitespace-normal align-top"><LocalDateTime value={paper.created_at} /></TableCell>
        </TableRow>)}</TableBody>
      </Table></div> : <div className="grid gap-4 md:grid-cols-2">{papers?.map(paper => {
          const assessment = researchAssessmentPath(paper.id);
          return <article key={paper.id} data-paper-id={paper.id} className="relative space-y-3 rounded-lg border p-5 focus-within:ring-2 focus-within:ring-ring">
            <h2 className="break-words font-semibold"><Link className="underline after:absolute after:inset-0 after:rounded-lg" href={assessment}>{paper.displayTitle}</Link></h2>
            <PaperAuthors authors={paper.authors} loading={paper.authorsLoading} />
            <AssessmentBadges paper={paper} />
            <p className="break-words text-xs text-muted-foreground">Initiated by: {paper.initiated_by ?? "Name unavailable"}</p>
            <p className="text-xs text-muted-foreground">Submitted <LocalDateTime value={paper.created_at} /></p>
          </article>;
        })}</div>}
      {before || data.next_cursor ? <nav aria-label="Assessment pages" className="flex flex-wrap gap-5 text-sm">{before ? <Link className="underline" href={assessmentListPath(options)}>Newest assessments</Link> : null}{data.next_cursor ? <Link className="underline" href={assessmentListPath({ ...options, before: data.next_cursor })}>Older assessments</Link> : null}</nav> : null}
    </>}
  </>;
}
