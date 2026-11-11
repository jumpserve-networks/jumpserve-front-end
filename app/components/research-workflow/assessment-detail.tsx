"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Badge } from "@/app/components/ui/badge";
import { Button } from "@/app/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/app/components/ui/table";
import { LocalDateTime } from "@/app/components/user-preferences";
import { loadPaperDetail, paperWorkflowLabel, type PaperDetail } from "@/lib/research-paper-catalog";
import { loadPublicStudyQueue, type PublicStudyQueue } from "@/lib/research-public-queue";
import { assessmentProgress, assessmentTaskStage } from "@/lib/research-assessment-progress";
import { QUEUE_POLL_MS } from "@/lib/research-experiment-queue";
import { researchPublishedPath } from "@/lib/research-pathways";
import { ASSESSMENTS_PATH, NEW_ASSESSMENT_PATH } from "@/lib/test-modules";
import { PaperAuthors } from "./paper-bibliography";
import { ResearchHeader } from "./header";
import { SharedAssessmentRecords } from "./shared-assessment-records";
import { PublicExperimentQueue } from "./public-experiment-queue";
import { AssessmentGapExperiments } from "./experiment-queue";

const words = (value: string) => value.replaceAll("-", " ");

export function AssessmentDetail({ assessmentId, jobId, gapId, launchId }: { assessmentId: string; jobId?: string; gapId?: string; launchId?: string }) {
  const [detail, setDetail] = useState<PaperDetail | null>(null);
  const [queue, setQueue] = useState<PublicStudyQueue | null>(null);
  const [detailError, setDetailError] = useState("");
  const [queueError, setQueueError] = useState("");
  const [revision, setRevision] = useState(0);
  const [limit, setLimit] = useState(20);
  const [recordsOpen, setRecordsOpen] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    async function refresh() {
      await Promise.allSettled([
        loadPaperDetail(assessmentId, controller.signal).then(value => {
          if (!controller.signal.aborted) { setDetail(value); setDetailError(""); }
        }).catch(error => { if (!controller.signal.aborted) setDetailError(error instanceof Error ? error.message : "Assessment details are unavailable."); }),
        loadPublicStudyQueue(assessmentId, controller.signal).then(value => {
          if (!controller.signal.aborted) { setQueue(value); setQueueError(""); }
        }).catch(error => { if (!controller.signal.aborted) setQueueError(error instanceof Error ? error.message : "Assessment progress is unavailable."); }),
      ]);
      if (!controller.signal.aborted) timer = setTimeout(refresh, QUEUE_POLL_MS);
    }
    void refresh();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [assessmentId, revision]);

  const paper = detail?.paper;
  const workflow = queue?.autonomy.workflows[0];
  const progress = assessmentProgress(queue, detail?.preparation_status);
  const status = workflow?.status ?? paper?.workflow_status;
  const title = paper?.title ?? queue?.study.title ?? (detail || detailError || queueError ? "Paper title unavailable" : "Loading assessment…");
  const tasks = [...(queue?.autonomy.tasks ?? [])].sort((a, b) => Number(a.claim_id !== null) - Number(b.claim_id !== null) || b.updated_at.localeCompare(a.updated_at) || a.id.localeCompare(b.id));

  return <main className="mx-auto max-w-6xl space-y-6 px-4 py-6" data-testid="assessment-detail">
    <Link className="text-sm underline" href={ASSESSMENTS_PATH}>Back to assessments</Link>
    <ResearchHeader title={title} showModuleLabel={false} />
    {paper ? <div className="space-y-2 text-sm">
      <PaperAuthors authors={paper.authors} />
      <p>Initiated by: {paper.initiated_by ?? "Name unavailable"}</p>
      <p className="text-muted-foreground">Submitted <LocalDateTime value={paper.created_at} /></p>
      <Badge variant="outline">{paper.published ? "Published assessment" : "Not published"}</Badge>
    </div> : null}
    {detailError ? <p role="alert" className="content-panel rounded-lg border p-4 text-sm text-destructive">Assessment details are unavailable. {detailError} {detail ? "Previously retrieved details may be stale." : ""}</p> : null}
    {detailError || queueError ? <Button variant="outline" onClick={() => setRevision(value => value + 1)}>Retry status</Button> : null}
    {detail || queue ? <>
      <section aria-label="Assessment status" className="content-panel space-y-4 rounded-lg border p-5">
        <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-semibold">Assessment status</h2>{status ? <Badge variant="secondary">{paperWorkflowLabel(status as NonNullable<PaperDetail["paper"]["workflow_status"]>)}</Badge> : null}</div>
        <dl className="grid gap-5 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1"><dt className="text-muted-foreground">Current stage</dt><dd className="font-medium" data-assessment-stage>{queue || detail?.preparation_status ? progress.stage : queueError ? "Unknown" : "Loading…"}</dd></div>
          <div className="space-y-1"><dt className="text-muted-foreground">Claim checks</dt><dd>{progress.counts ? `${progress.counts.finished} of ${progress.counts.total} finished` : "Not recorded"}</dd></div>
          <div className="space-y-1"><dt className="text-muted-foreground">Experiment jobs</dt><dd>{queue ? queue.coverage.jobs : "Unknown"}</dd></div>
          <div className="space-y-1"><dt className="text-muted-foreground">Last recorded update</dt><dd>{progress.lastUpdated ? <LocalDateTime value={progress.lastUpdated} /> : "Not recorded"}</dd></div>
        </dl>
        {detail?.preparation_status === "ready" ? <Button className="h-auto w-full whitespace-normal sm:w-auto" nativeButton={false} render={<Link href={`${NEW_ASSESSMENT_PATH}/${assessmentId}`} prefetch={false} />}>Choose central claims and testable findings</Button> : null}
      </section>
      {tasks.length ? <section aria-label="Claim progress" className="space-y-4">
        <h2 className="text-lg font-semibold">Claim progress</h2>
        <div className="content-panel rounded-lg border"><Table><TableHeader className="bg-muted/40"><TableRow><TableHead scope="col" className="p-3">Claim</TableHead><TableHead scope="col" className="p-3">Stage</TableHead><TableHead scope="col" className="p-3">Status</TableHead><TableHead scope="col" className="p-3">Finding</TableHead></TableRow></TableHeader><TableBody>{tasks.slice(0, limit).map(task => <TableRow key={task.id}>
          <TableHead scope="row" className="min-w-48 max-w-xl p-3 align-top font-medium whitespace-normal break-words">{task.claim_title ?? "Paper preparation"}</TableHead><TableCell className="p-3 align-top whitespace-normal">{assessmentTaskStage(task)}</TableCell><TableCell className="p-3 align-top">{words(task.status)}</TableCell><TableCell className="p-3 align-top">{task.label ?? "—"}</TableCell>
        </TableRow>)}</TableBody></Table></div>
        {tasks.length > limit ? <Button variant="outline" onClick={() => setLimit(value => value + 20)}>Show more claims</Button> : null}
      </section> : null}
      <div className="flex flex-wrap gap-3">
        {paper?.published ? <Button variant="outline" nativeButton={false} render={<Link href={researchPublishedPath("paper", assessmentId)} />}>Read published assessment</Button> : null}
        <Button variant="outline" aria-expanded={recordsOpen} onClick={() => setRecordsOpen(value => !value)}>{recordsOpen ? "Hide assessment records" : "View assessment records"}</Button>
      </div>
      {recordsOpen ? <SharedAssessmentRecords studyId={assessmentId} /> : null}
    </> : !detailError && !queueError ? <p role="status">Loading assessment information…</p> : null}
    {gapId ? <AssessmentGapExperiments studyId={assessmentId} gapId={gapId} launchId={launchId} /> : null}
    <PublicExperimentQueue studyId={assessmentId} jobId={jobId} data={queue} error={queueError} />
  </main>;
}
