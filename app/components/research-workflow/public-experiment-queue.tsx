"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Badge } from "@/app/components/ui/badge";
import { Button } from "@/app/components/ui/button";
import { loadPublicStudyQueue, type PublicStudyQueue } from "@/lib/research-public-queue";
import { experimentQueuePath, QUEUE_POLL_MS } from "@/lib/research-experiment-queue";
import { QUEUE_STATUSES } from "@/lib/research-queue";
import { AutonomousAssessments } from "./autonomous-assessments";
import { ResearchSelect } from "./select";

const words = (value: string) => value.replaceAll("-", " ");
const recordedTime = (value: string) => new Date(value).toLocaleString("en-US", { timeZone: "UTC" }) + " UTC";

export function PublicExperimentQueue({ studyId, jobId }: { studyId: string; jobId?: string }) {
  const [data, setData] = useState<PublicStudyQueue | null>(null);
  const [error, setError] = useState(""); const [updatedAt, setUpdatedAt] = useState("");
  const [status, setStatus] = useState(""); const [limit, setLimit] = useState(20);
  useEffect(() => {
    const controller = new AbortController(); let timer: ReturnType<typeof setTimeout> | undefined;
    async function refresh() {
      try {
        const result = await loadPublicStudyQueue(studyId, controller.signal);
        if (!controller.signal.aborted) { setData(result); setError(""); setUpdatedAt(new Date().toISOString()); }
      } catch (failure) {
        if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : "Shared queue status is unavailable.");
      } finally { if (!controller.signal.aborted) timer = setTimeout(refresh, QUEUE_POLL_MS); }
    }
    void refresh();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [studyId]);
  const jobs = data?.jobs ?? [];
  const visible = jobs.filter(j => !status || j.status === status).sort((a, b) => Number(b.id === jobId) - Number(a.id === jobId) || b.updated_at.localeCompare(a.updated_at) || a.id.localeCompare(b.id));
  return <div className="space-y-6" data-testid="public-experiment-queue">
    <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
      <p>Public status · refreshes every 10 seconds</p>
      <Link className="underline" href={`${experimentQueuePath(studyId, jobId)}&view=private`}>Open owner’s private queue</Link>
    </div>
    {updatedAt ? <p className="text-xs text-muted-foreground">Last successful status retrieval: {recordedTime(updatedAt)}. Progress timestamps are recorded by the backend.</p> : null}
    {error ? <p role="alert" className="rounded-lg border p-4 text-sm text-destructive">{error} {data ? "Previously retrieved status may be stale." : "Queue counts and current status are unknown."}</p> : null}
    {data ? <>
      <AutonomousAssessments data={data.autonomy} studyId={studyId} titles={new Map([[data.study.id, data.study.title]])} stale={Boolean(error)} />
      <section aria-label="Assessment experiment status" className="space-y-4">
        <h2 className="text-lg font-semibold">Experiment jobs</h2>
        {!data.workers_enabled ? <p className="rounded-lg border p-3 text-sm text-warning">Scheduled experiment workers are disabled; queued jobs await activation.</p> : null}
        <p className="text-sm">{data.coverage.jobs} recorded jobs for this paper. Execution and scientific findings are reported separately.</p>
        {jobs.length ? <ResearchSelect label="Filter queue by status" value={status} onChange={value => { setStatus(value); setLimit(20); }} options={[{ value: "", label: "All statuses" }, ...QUEUE_STATUSES.map(s => ({ value: s, label: s === "manual" ? "Needs operator" : words(s) }))]} /> : null}
        {jobId && !jobs.some(j => j.id === jobId) ? <p role="status" className="text-sm">The requested job was not returned for this paper. Its status is unknown.</p> : null}
        {!visible.length ? <p role="status" className="rounded-lg border p-4 text-sm">{jobs.length ? "No jobs match this filter." : "No experiment jobs have been recorded yet. Paper preparation and claim planning appear above when available."}</p> : <>
          <p className="text-xs text-muted-foreground">Showing {Math.min(limit, visible.length)} of {visible.length} matching jobs.</p>
          {visible.slice(0, limit).map(job => <article key={job.id} id={`job-${job.id}`} className={`scroll-mt-24 space-y-3 rounded-lg border p-4 text-sm ${job.id === jobId ? "border-primary ring-1 ring-primary" : ""}`}>
            <div className="flex flex-wrap items-start justify-between gap-3"><h3 className="break-all font-semibold">Experiment {job.id}</h3><Badge variant={job.status === "failed" || job.status === "expired" ? "destructive" : "secondary"} className="h-auto py-1">{job.status === "manual" ? "Needs operator" : words(job.status)}</Badge></div>
            <p>{job.execution_mode === "manual" ? "Requires an operator; queueing does not execute an experiment." : "Automatic experiment"}</p>
            <p>Recorded run status: {job.run_status === null ? "unavailable" : words(job.run_status)}. Run completion does not establish claim validity.</p>
            <p className="text-xs text-muted-foreground">Queued {recordedTime(job.created_at)} · last recorded change {recordedTime(job.updated_at)}</p>
            <Link className="underline" href={experimentQueuePath(studyId, job.id)}>Link to this job</Link>
          </article>)}
          {visible.length > limit ? <Button variant="outline" onClick={() => setLimit(n => n + 20)}>Show more jobs</Button> : null}
        </>}
      </section>
      <p className="text-xs text-muted-foreground">{data.limitations}</p>
    </> : !error ? <p role="status">Loading shared experiment status…</p> : null}
  </div>;
}
