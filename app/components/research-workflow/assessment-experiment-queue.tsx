"use client";

import Link from "next/link";
import { useState } from "react";
import { Activity, Ban, CheckCircle2, CircleAlert, Clock3, UserRound } from "lucide-react";
import { Badge } from "@/app/components/ui/badge";
import { Button } from "@/app/components/ui/button";
import { experimentQueuePath, type ExperimentQueue } from "@/lib/research-experiment-queue";
import type { QueueJob } from "@/lib/research-queue";
import type { ResearchStudy } from "@/lib/research-workflow";
import { RESEARCH_WORKFLOW_MODULE_PATH } from "@/lib/test-modules";
import { AutonomousAssessments } from "./autonomous-assessments";

const words = (value: string) => value.replaceAll("-", " ");
const recordedTime = (value: string) => new Date(value).toLocaleString("en-US", { timeZone: "UTC" }) + " UTC";
function statusText(job: QueueJob) {
  if (job.status === "manual") return "Needs operator";
  if (job.status === "queued" && job.readiness === "blocked") return "Blocked";
  if (job.status === "awaiting-review") return "Awaiting evidence review";
  return words(job.status);
}

export function AssessmentExperimentQueue({ assessment, data, status, focusedJob, stale }: {
  assessment: ResearchStudy;
  data: ExperimentQueue;
  status: string;
  focusedJob: string;
  stale: boolean;
}) {
  const [page, setPage] = useState({ status, limit: 20 });
  const limit = page.status === status ? page.limit : 20;
  const jobs = data.jobs.filter(job => job.study_id === assessment.id);
  const visible = jobs.filter(job => !status || (status === "blocked" ? job.readiness === "blocked" : job.status === status))
    .sort((a, b) => Number(b.id === focusedJob) - Number(a.id === focusedJob) || b.updated_at.localeCompare(a.updated_at) || a.id.localeCompare(b.id));
  const counters = [
    { label: "Queued", count: jobs.filter(job => job.status === "queued").length, icon: Clock3 },
    { label: "Running", count: jobs.filter(job => job.status === "running").length, icon: Activity },
    { label: "Needs operator", count: jobs.filter(job => job.status === "manual").length, icon: UserRound },
    { label: "Awaiting review", count: jobs.filter(job => job.status === "awaiting-review").length, icon: Clock3 },
    { label: "Reviewed", count: jobs.filter(job => job.status === "reviewed").length, icon: CheckCircle2 },
    { label: "Failed / expired", count: jobs.filter(job => job.status === "failed" || job.status === "expired").length, icon: CircleAlert },
    { label: "Cancelled", count: jobs.filter(job => job.status === "cancelled").length, icon: Ban },
  ];

  return <section data-assessment-id={assessment.id} id={`assessment-${assessment.id}`} aria-labelledby={`assessment-title-${assessment.id}`} className="space-y-5 rounded-lg border border-primary/40 p-4 sm:p-5">
    <header className="space-y-2">
      <h3 id={`assessment-title-${assessment.id}`} className="break-words text-lg font-semibold"><Link className="underline underline-offset-4" href={`${experimentQueuePath(assessment.id)}&view=private`}>{assessment.title}</Link></h3>
      <p className="break-all text-xs text-muted-foreground">Assessment {assessment.id}</p>
    </header>
    {data.autonomy ? <AutonomousAssessments data={data.autonomy} studyId={assessment.id} titles={new Map([[assessment.id, assessment.title]])} embedded /> : <p className="text-sm text-muted-foreground">Claim progress is unavailable from the connected backend. Recorded experiment jobs appear below.</p>}
    <section aria-label="Assessment experiment jobs" className="space-y-4">
      <h4 className="font-semibold">Experiment jobs</h4>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4" aria-label="Assessment job counts">{counters.map(({ label, count, icon: Icon }) => <div key={label} className="rounded-md border p-3"><p className="flex items-center gap-2 text-sm"><Icon aria-hidden="true" className="size-4 shrink-0" />{label}</p><p className="mt-1 text-2xl font-semibold">{count}</p></div>)}</div>
      <p className="text-xs text-muted-foreground">{jobs.length} recorded jobs for this assessment, including cancelled jobs. Counts include all statuses{stale ? " from the last successful retrieval and may be stale" : ""}; the status filter applies to the job list below.</p>
      {!visible.length ? <p role="status" className="rounded-md border p-4 text-sm">{jobs.length ? "No experiment jobs match this status for this assessment. Claim progress remains visible above." : "No experiment jobs have been recorded for this assessment yet. Preparation and claim planning may still be in progress."}</p> : <>
        <p className="text-xs text-muted-foreground">Showing {Math.min(limit, visible.length)} of {visible.length} matching jobs for this assessment.</p>
        <div className="space-y-3">{visible.slice(0, limit).map(job => <article key={job.id} id={`job-${job.id}`} className={`scroll-mt-24 space-y-3 rounded-md border p-4 text-sm ${job.id === focusedJob ? "border-primary ring-1 ring-primary" : ""}`}>
          <div className="flex flex-wrap items-start justify-between gap-3"><h5 className="min-w-0 break-words font-semibold">{job.campaign_title}</h5><Badge variant={job.status === "failed" || job.status === "expired" ? "destructive" : "secondary"} className="h-auto py-1 capitalize">{statusText(job)}</Badge></div>
          <p className="text-muted-foreground">Priority {job.priority} · {job.execution_mode}</p>
          <p>{job.reason}</p>
          {job.blockers.length ? <ul className="list-disc space-y-1 pl-5">{job.blockers.map(reason => <li key={reason}>{reason}</li>)}</ul> : null}
          {job.status === "queued" && !job.blockers.length ? <p className="text-xs text-muted-foreground">Prerequisites ready; waiting for a scheduled worker, capacity or resource lock.</p> : null}
          {job.run_id ? <p className="break-words text-xs">Recorded run {job.run_id}: {job.run_status ?? "status unavailable"}. Run completion does not establish claim validity.</p> : null}
          <p className="text-xs text-muted-foreground">Queued {recordedTime(job.created_at)} · last recorded change {recordedTime(job.updated_at)}</p>
          <p className="break-all text-xs text-muted-foreground">Job {job.id} · recorded status {words(job.status)}</p>
          <div className="flex flex-wrap gap-4"><Link className="underline" href={`${RESEARCH_WORKFLOW_MODULE_PATH}/workspace/${assessment.id}#experiment-queue`}>Open assessment, evidence and event history</Link><Link className="underline" href={experimentQueuePath(assessment.id, job.id)}>Link to this job</Link></div>
        </article>)}</div>
        {visible.length > limit ? <Button variant="outline" onClick={() => setPage(previous => ({ status, limit: (previous.status === status ? previous.limit : 20) + 20 }))}>Show more jobs</Button> : null}
      </>}
    </section>
  </section>;
}
