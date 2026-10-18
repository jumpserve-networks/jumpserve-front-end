"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Activity, CircleAlert, Clock3, UserRound, CheckCircle2 } from "lucide-react";
import { Button } from "@/app/components/ui/button";
import { Badge } from "@/app/components/ui/badge";
import { ResearchSelect } from "./select";
import { RunGapExperiment } from "./run-gap-experiment";
import { researchRequest } from "@/lib/research-workflow-api";
import { loadExperimentQueue, requireGapQueueApi } from "@/lib/research-queue-api";
import { QUEUE_STATUSES, type QueueJob } from "@/lib/research-queue";
import { experimentQueuePath, isResearchId, QUEUE_POLL_MS, validateGapEnqueued, validateGapPreview, type ExperimentQueue, type GapPreview } from "@/lib/research-experiment-queue";
import { RESEARCH_WORKFLOW_MODULE_PATH as PATH } from "@/lib/test-modules";
import { AutonomousAssessments } from "./autonomous-assessments";

const failureText = (error: unknown) => error instanceof Error ? error.message : "Queue status is unavailable.";
const display = (value: string) => value.replaceAll("-", " ");
function recordedTime(value: string) { return new Date(value).toLocaleString("en-US", { timeZone: "UTC" }) + " UTC"; }
function statusText(job: QueueJob) {
  if (job.status === "manual") return "Needs operator";
  if (job.status === "queued" && job.readiness === "blocked") return "Blocked";
  if (job.status === "awaiting-review") return "Awaiting evidence review";
  return display(job.status);
}

function GapExperimentPlanner({ studyId, gapId, onQueued }: { studyId: string; gapId: string; onQueued: (studyId: string, jobId: string) => void }) {
  const [preview, setPreview] = useState<GapPreview | null>(null);
  const [choice, setChoice] = useState(""); const [error, setError] = useState("");
  const [busy, setBusy] = useState(false); const [revision, setRevision] = useState(0);
  const [message, setMessage] = useState(""); const [savedStudy, setSavedStudy] = useState("");
  const [complete, setComplete] = useState(false);
  const requestId = useRef(""); const inFlight = useRef(false);
  const writeController = useRef<AbortController | null>(null);
  useEffect(() => () => writeController.current?.abort(), []);
  useEffect(() => {
    const controller = new AbortController();
    requireGapQueueApi(researchRequest, controller.signal).then(() => researchRequest(`/studies/${studyId}/gap-experiments?${new URLSearchParams({ gap_id: gapId })}`, { signal: controller.signal })).then(result => {
      if (controller.signal.aborted) return;
      const parsed = validateGapPreview(result, studyId, gapId);
      setPreview(parsed); setChoice(parsed.choices[0]?.key ?? ""); setError("");
    }).catch(error => { if (!controller.signal.aborted) setError(failureText(error)); });
    return () => controller.abort();
  }, [studyId, gapId, revision]);
  const selected = preview?.choices.find(c => c.key === choice);
  async function enqueue() {
    if (!preview || !selected || inFlight.current) return;
    inFlight.current = true; setBusy(true); setError(""); setMessage("");
    if (!requestId.current) requestId.current = crypto.randomUUID();
    const controller = new AbortController(); writeController.current = controller;
    try {
      const path = `/studies/${studyId}/gap-experiments`;
      const selection = { request_id: requestId.current, gap_id: gapId, gap_sha256: preview.gap_sha256, plan_sha256: preview.plan_sha256, key: selected.key };
      setMessage("Creating or resuming your private follow-up…");
      const followup = await researchRequest<{ version: string; study_id: string }>(path, { method: "POST", signal: controller.signal, body: JSON.stringify({ ...selection, action: "create-followup" }) });
      if (followup?.version !== "research-gap-queue-v1" || !isResearchId(followup.study_id)) throw new Error("Private follow-up identity was not confirmed.");
      setSavedStudy(followup.study_id);
      setMessage("Preserving the reviewed plan and exact input bytes…");
      await researchRequest(`/studies/${followup.study_id}/prepare`, { method: "POST", signal: controller.signal, body: JSON.stringify({ action: "prepare", request_id: requestId.current }) });
      setMessage("Queueing the selected check and its prerequisites…");
      const result = validateGapEnqueued(await researchRequest(path, { method: "POST", signal: controller.signal, body: JSON.stringify({ ...selection, action: "enqueue" }) }));
      if (controller.signal.aborted) return;
      setSavedStudy(result.study_id);
      setComplete(result.complete);
      setMessage(result.complete ? `${selected.execution_mode === "manual" ? "Operator task" : "Experiment job"} recorded. Track its recorded execution and review status below. ${result.workers_enabled ? "" : "Scheduled workers are disabled; automatic execution awaits activation."} Scientific assessment remains separate.` : "Preparation and some prerequisites were saved. Resume to queue the selected check; it is not yet confirmed as queued.");
      if (result.complete) onQueued(result.study_id, result.job_id);
    } catch (error) { if (!controller.signal.aborted) setError(`${failureText(error)} Saved work may already exist. Retrying resumes the same follow-up without creating duplicate jobs.`); }
    finally { inFlight.current = false; setBusy(false); }
  }
  return <section aria-label="Queue a follow-up experiment" className="space-y-4 rounded-lg border border-primary/40 p-5">
    <h2 className="text-lg font-semibold">Queue a follow-up experiment</h2>
    <p className="text-sm">Choose a retained check for this claim. JumpServe creates your private follow-up, preserves the original inputs and queues the selected check with its prerequisites. Returning to the same selection resumes its existing jobs.</p>
    <Link className="text-sm underline" href={`${PATH}/studies/${studyId}?view=gaps#gap-${gapId}`}>Back to the evidence gap</Link>
    {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
    {preview ? <>
      <p className="text-xs text-muted-foreground">{preview.limitation}</p>
      {preview.choices.length ? <>
        <ResearchSelect label="Retained check to queue" value={choice} disabled={busy} onChange={value => { setChoice(value); requestId.current = ""; setMessage(""); setSavedStudy(""); setComplete(false); }} options={preview.choices.map(c => ({ value: c.key, label: `${c.title} · ${c.execution_mode === "manual" ? "operator task" : "automatic check"}` }))} />
        {selected ? <div className="space-y-2 text-sm"><p><strong>Method:</strong> {display(selected.experiment_type)} · {selected.execution_mode === "manual" ? "Requires a domain operator; queueing does not run a network experiment." : "Uses the retained implementation and input bytes."}</p><p><strong>Coverage:</strong> {selected.coverage_limits}</p>{selected.dependencies.length ? <p>{selected.dependencies.length} direct prerequisites; their prerequisites are included. Evidence review may block execution.</p> : null}</div> : null}
        <Button disabled={busy || !selected || complete} onClick={() => void enqueue()}>{busy ? "Preserving and queueing…" : complete ? "Job recorded" : savedStudy ? "Resume queueing" : selected?.execution_mode === "manual" ? "Queue operator task" : "Queue experiment"}</Button>
      </> : <div className="space-y-3 rounded-md bg-muted p-4"><p className="text-sm">{preview.unavailable_reason}</p><Button variant="outline" render={<Link href={`${PATH}/new-study`} />} nativeButton={false}>Prepare a paper study</Button></div>}
    </> : !error ? <p role="status" className="text-sm">Checking retained protocols and input availability…</p> : <Button variant="outline" size="sm" onClick={() => setRevision(r => r + 1)}>Retry preview</Button>}
    {message ? <p role="status" className="text-sm">{message}</p> : null}
    {savedStudy ? <Link className="block text-sm underline" href={experimentQueuePath(savedStudy)}>View this follow-up in Experiment Queue</Link> : null}
  </section>;
}

export function ExperimentQueueDashboard({ studyId, jobId, sourceStudy, gapId, launchId }: { studyId?: string; jobId?: string; sourceStudy?: string; gapId?: string; launchId?: string }) {
  const [data, setData] = useState<ExperimentQueue | null>(null); const [error, setError] = useState("");
  const [updatedAt, setUpdatedAt] = useState(""); const [revision, setRevision] = useState(0);
  const [study, setStudy] = useState(studyId ?? ""); const [status, setStatus] = useState(""); const [limit, setLimit] = useState(20);
  const [focusedJob, setFocusedJob] = useState(jobId ?? "");
  useEffect(() => {
    const controller = new AbortController(); let timer: ReturnType<typeof setTimeout> | undefined;
    async function refresh() {
      try {
        const result = await loadExperimentQueue(researchRequest, controller.signal);
        if (!controller.signal.aborted) { setData(result); setError(""); setUpdatedAt(new Date().toISOString()); }
      } catch (error) { if (!controller.signal.aborted) setError(failureText(error)); }
      finally { if (!controller.signal.aborted) timer = setTimeout(refresh, QUEUE_POLL_MS); }
    }
    void refresh();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [revision]);
  function queued(id: string, job: string) { setStudy(id); setFocusedJob(job); setStatus(""); setLimit(20); setRevision(r => r + 1); window.history.replaceState(null, "", experimentQueuePath(id, job)); }
  const jobs = data?.jobs ?? [];
  const visible = jobs.filter(j => (!study || j.study_id === study) && (!status || (status === "blocked" ? j.readiness === "blocked" : j.status === status))).sort((a, b) => Number(b.id === focusedJob) - Number(a.id === focusedJob) || b.updated_at.localeCompare(a.updated_at) || a.id.localeCompare(b.id));
  const names = new Map(data?.studies.map(s => [s.id, s.title]));
  const counters = [
    { label: "Queued", count: jobs.filter(j => j.status === "queued").length, icon: Clock3 },
    { label: "Running", count: jobs.filter(j => j.status === "running").length, icon: Activity },
    { label: "Needs operator", count: jobs.filter(j => j.status === "manual").length, icon: UserRound },
    { label: "Awaiting review", count: jobs.filter(j => j.status === "awaiting-review").length, icon: Clock3 },
    { label: "Reviewed", count: jobs.filter(j => j.status === "reviewed").length, icon: CheckCircle2 },
    { label: "Failed / expired", count: jobs.filter(j => j.status === "failed" || j.status === "expired").length, icon: CircleAlert },
  ];
  return <div className="space-y-6" data-testid="experiment-queue-dashboard">
    {data?.autonomy ? <AutonomousAssessments data={data.autonomy} studyId={study} titles={names} stale={Boolean(error)} /> : null}
    {sourceStudy && gapId ? launchId ? <section aria-label="Run requested experiment" className="space-y-3 rounded-lg border p-5"><h2 className="text-lg font-semibold">Run requested experiment</h2><RunGapExperiment studyId={sourceStudy} gapId={gapId} launchId={launchId} onQueued={queued} /></section> : <GapExperimentPlanner studyId={sourceStudy} gapId={gapId} onQueued={queued} /> : null}
    <section className="space-y-4" aria-label="Your experiment status">
      <h2 className="text-lg font-semibold">Your experiment status</h2>
      <p className="text-sm text-muted-foreground">Your private paper jobs across all studies. Status refreshes every 10 seconds. An executed check still needs evidence review before a scientific conclusion changes.</p>
      {updatedAt ? <p className="text-xs text-muted-foreground">Last successful status retrieval: {recordedTime(updatedAt)}. Job timestamps below are recorded by the backend.</p> : null}
      {error ? <p role="alert" className="rounded-lg border p-4 text-sm text-destructive">{error} {data ? "Previously retrieved status is shown and may be stale." : "Queue counts and current status are unknown."}</p> : null}
      {data ? <>
        {!data.workers_enabled ? <p className="rounded-lg border p-3 text-sm text-warning">Scheduled workers are disabled. Automatic jobs can be recorded but will not start until workers are activated.</p> : null}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3" aria-label="All paper job counts">{counters.map(({ label, count, icon: Icon }) => <div key={label} className="rounded-lg border p-3"><p className="flex items-center gap-2 text-sm"><Icon className="size-4" />{label}</p><p className="mt-1 text-2xl font-semibold">{count}</p></div>)}</div>
        <p className="text-xs text-muted-foreground">{data.coverage.jobs} recorded jobs across {data.coverage.studies} paper studies · global execution limit {data.limits.global_jobs} · per-study limit {data.limits.study_jobs} · no automatic experiment retries. Counts above cover all your paper studies, including cancelled jobs in the total.</p>
        <div className="grid gap-3 sm:grid-cols-2"><ResearchSelect label="Filter queue by study" value={study} onChange={value => { setStudy(value); setLimit(20); }} options={[{ value: "", label: "All paper studies" }, ...data.studies.map(s => ({ value: s.id, label: s.title })), ...(study && !names.has(study) ? [{ value: study, label: "Requested study unavailable" }] : [])]} /><ResearchSelect label="Filter queue by status" value={status} onChange={value => { setStatus(value); setLimit(20); }} options={[{ value: "", label: "All statuses" }, { value: "blocked", label: "Blocked" }, ...QUEUE_STATUSES.map(s => ({ value: s, label: s === "manual" ? "Needs operator" : display(s) }))]} /></div>
        {focusedJob && !jobs.some(j => j.id === focusedJob && (!study || j.study_id === study)) ? <p role="status" className="rounded-lg border p-4 text-sm">The requested job was not returned for this study and account. Its status is unverified; no successful execution is inferred.</p> : null}
        {study && !names.has(study) ? <p role="status" className="text-sm">This study is unavailable in your paper queue. Published assessments do not grant access to another owner’s jobs.</p> : !visible.length ? <p role="status" className="rounded-lg border p-5 text-sm">{jobs.length ? "No jobs match these filters." : "No paper experiment jobs queued yet. Open a published assessment’s evidence gaps and choose a check, or prepare checks in My Assessments."}</p> : <>
          <p className="text-xs text-muted-foreground">Showing {Math.min(limit, visible.length)} of {visible.length} matching jobs.</p>
          <div className="space-y-3">{visible.slice(0, limit).map(job => <article key={job.id} id={`job-${job.id}`} className={`scroll-mt-24 space-y-3 rounded-lg border p-4 text-sm ${job.id === focusedJob ? "border-primary ring-1 ring-primary" : ""}`}>
            <div className="flex flex-wrap items-start justify-between gap-3"><h3 className="min-w-0 break-words font-semibold">{job.campaign_title}</h3><Badge variant={job.status === "failed" || job.status === "expired" ? "destructive" : "secondary"} className="h-auto py-1 capitalize">{statusText(job)}</Badge></div>
            <p className="text-muted-foreground">{names.get(job.study_id)} · priority {job.priority} · {job.execution_mode}</p>
            <p>{job.reason}</p>
            {job.blockers.length ? <ul className="list-disc space-y-1 pl-5">{job.blockers.map(reason => <li key={reason}>{reason}</li>)}</ul> : null}
            {job.status === "queued" && !job.blockers.length ? <p className="text-xs text-muted-foreground">Prerequisites ready; waiting for a scheduled worker, capacity or resource lock.</p> : null}
            {job.run_id ? <p className="break-words text-xs">Recorded run {job.run_id}: {job.run_status ?? "status unavailable"}. Run completion does not establish claim validity.</p> : null}
            <p className="text-xs text-muted-foreground">Queued {recordedTime(job.created_at)} · last recorded change {recordedTime(job.updated_at)}</p>
            <p className="break-all text-xs text-muted-foreground">Job {job.id} · recorded status {display(job.status)}</p>
            <div className="flex flex-wrap gap-4"><Link className="underline" href={`${PATH}/workspace/${job.study_id}#experiment-queue`}>Open study, evidence and event history</Link><Link className="underline" href={experimentQueuePath(job.study_id, job.id)}>Link to this job</Link></div>
          </article>)}</div>
          {visible.length > limit ? <Button variant="outline" onClick={() => setLimit(n => n + 20)}>Show more jobs</Button> : null}
        </>}
        <p className="text-xs text-muted-foreground">{data.limitations}</p>
      </> : !error ? <p role="status">Loading your experiment queue…</p> : null}
    </section>
  </div>;
}
