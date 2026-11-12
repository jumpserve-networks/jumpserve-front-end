"use client";
import { LocalDateTime } from "@/app/components/user-preferences";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Badge } from "@/app/components/ui/badge";
import { Button } from "@/app/components/ui/button";
import type { PublicStudyQueue } from "@/lib/research-public-queue";
import { experimentQueuePath } from "@/lib/research-experiment-queue";
import { QUEUE_STATUSES } from "@/lib/research-queue";
import { AutonomousAssessments, AutonomousAssessmentStatus } from "./autonomous-assessments";
import { ResearchSelect } from "./select";

const words = (value: string) => value.replaceAll("-", " ");
const recordedTime = (value: string) => <LocalDateTime value={value} />;

export function PublicExperimentQueue({ studyId, jobId, data, error }: { studyId: string; jobId?: string; data: PublicStudyQueue | null; error: string }) {
  const [status, setStatus] = useState(""); const [limit, setLimit] = useState(20);
  const scrolledJob = useRef("");
  useEffect(() => {
    if (!jobId || !data || scrolledJob.current === jobId || window.location.hash !== `#job-${jobId}`) return;
    const job = document.getElementById(`job-${jobId}`);
    if (job) { job.scrollIntoView({ block: "start" }); scrolledJob.current = jobId; }
  }, [jobId, data]);
  const jobs = data?.jobs ?? [];
  const visible = jobs.filter(j => !status || j.status === status).sort((a, b) => Number(b.id === jobId) - Number(a.id === jobId) || b.updated_at.localeCompare(a.updated_at) || a.id.localeCompare(b.id));
  return <section id="experiment-queue" aria-label="Experiment Queue" className="scroll-mt-24 space-y-6" data-testid="public-experiment-queue">
    <h2 className="text-lg font-semibold">Experiment Queue</h2>
    {error ? <p role="alert" className="content-panel rounded-lg border p-4 text-sm text-destructive">{error} {data ? "Previously retrieved status may be stale." : "Queue counts and current status are unknown."}</p> : null}
    {data ? <>
      <AutonomousAssessmentStatus data={data.autonomy} stale={Boolean(error)} />
      <AutonomousAssessments data={data.autonomy} studyId={studyId} titles={new Map([[data.study.id, data.study.title]])} embedded />
      <section aria-label="Assessment experiment status" className="space-y-4">
        <h3 className="text-lg font-semibold">Experiment jobs</h3>
        {!data.workers_enabled ? <p className="content-panel rounded-lg border p-3 text-sm text-warning">Scheduled experiment workers are disabled; queued jobs await activation.</p> : null}
        <p className="text-sm">{data.coverage.jobs} recorded jobs for this paper.</p>
        {jobs.length ? <ResearchSelect label="Filter queue by status" value={status} onChange={value => { setStatus(value); setLimit(20); }} options={[{ value: "", label: "All statuses" }, ...QUEUE_STATUSES.map(s => ({ value: s, label: s === "manual" ? "Needs operator" : words(s) }))]} /> : null}
        {jobId && !jobs.some(j => j.id === jobId) ? <p role="status" className="text-sm">The requested job was not returned for this paper. Its status is unknown.</p> : null}
        {!visible.length ? <p role="status" className="content-panel rounded-lg border p-4 text-sm">{jobs.length ? "No jobs match this filter." : "No experiment jobs recorded yet."}</p> : <>
          <p className="text-xs text-muted-foreground">Showing {Math.min(limit, visible.length)} of {visible.length} matching jobs.</p>
          {visible.slice(0, limit).map(job => <article key={job.id} id={`job-${job.id}`} data-selected={job.id === jobId} className={`content-panel scroll-mt-24 space-y-3 rounded-lg border p-4 text-sm ${job.id === jobId ? "bg-accent/40" : ""}`}>
            <div className="flex flex-wrap items-start justify-between gap-3"><h3 className="break-all font-semibold">Experiment {job.id}</h3><Badge variant={job.status === "failed" || job.status === "expired" ? "destructive" : "secondary"} className="h-auto py-1">{job.status === "manual" ? "Needs operator" : words(job.status)}</Badge></div>
            <p>{job.execution_mode === "manual" ? "Requires an operator; queueing does not execute an experiment." : "Automatic experiment"}</p>
            <p>Recorded run status: {job.run_status === null ? "unavailable" : words(job.run_status)}. Run completion does not establish claim validity.</p>
            {job.reason ? <div><h4 className="font-medium">Recorded job details</h4><p className="whitespace-pre-wrap break-words">{job.reason}</p></div> : null}
            {job.run_reason ? <div><h4 className="font-medium">Recorded run details</h4><p className="whitespace-pre-wrap break-words">{job.run_reason}</p></div> : null}
            {!job.reason && !job.run_reason && (job.status === "failed" || job.status === "expired" || ["failed", "partial", "excluded", "invalid"].includes(job.run_status ?? "")) ? <p className="text-muted-foreground">No failure details were returned by the service.</p> : null}
            <p className="text-xs text-muted-foreground">Queued {recordedTime(job.created_at)} · last recorded change {recordedTime(job.updated_at)}</p>
            <Link className="underline" href={experimentQueuePath(studyId, job.id)}>Link to this job</Link>
          </article>)}
          {visible.length > limit ? <Button variant="outline" onClick={() => setLimit(n => n + 20)}>Show more jobs</Button> : null}
        </>}
      </section>
    </> : !error ? <p role="status">Loading shared experiment status…</p> : null}
  </section>;
}
