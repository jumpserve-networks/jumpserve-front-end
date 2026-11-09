"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/app/components/ui/button";
import { ResearchSelect } from "./select";
import { RunGapExperiment } from "./run-gap-experiment";
import { researchRequest } from "@/lib/research-workflow-api";
import { requireGapQueueApi } from "@/lib/research-queue-api";
import { experimentQueuePath, isResearchId, validateGapEnqueued, validateGapPreview, type GapPreview } from "@/lib/research-experiment-queue";
import { ASSESSMENTS_PATH, NEW_ASSESSMENT_PATH } from "@/lib/test-modules";

const failureText = (error: unknown) => error instanceof Error ? error.message : "Queue status is unavailable.";
const display = (value: string) => value.replaceAll("-", " ");

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
    <Link className="text-sm underline" href={`${ASSESSMENTS_PATH}/${studyId}?view=gaps#gap-${gapId}`}>Back to the evidence gap</Link>
    {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
    {preview ? <>
      <p className="text-xs text-muted-foreground">{preview.limitation}</p>
      {preview.choices.length ? <>
        <ResearchSelect label="Retained check to queue" value={choice} disabled={busy} onChange={value => { setChoice(value); requestId.current = ""; setMessage(""); setSavedStudy(""); setComplete(false); }} options={preview.choices.map(c => ({ value: c.key, label: `${c.title} · ${c.execution_mode === "manual" ? "operator task" : "automatic check"}` }))} />
        {selected ? <div className="space-y-2 text-sm"><p><strong>Method:</strong> {display(selected.experiment_type)} · {selected.execution_mode === "manual" ? "Requires a domain operator; queueing does not run a network experiment." : "Uses the retained implementation and input bytes."}</p><p><strong>Coverage:</strong> {selected.coverage_limits}</p>{selected.dependencies.length ? <p>{selected.dependencies.length} direct prerequisites; their prerequisites are included. Evidence review may block execution.</p> : null}</div> : null}
        <Button disabled={busy || !selected || complete} onClick={() => void enqueue()}>{busy ? "Preserving and queueing…" : complete ? "Job recorded" : savedStudy ? "Resume queueing" : selected?.execution_mode === "manual" ? "Queue operator task" : "Queue experiment"}</Button>
      </> : <div className="space-y-3 rounded-md bg-muted p-4"><p className="text-sm">{preview.unavailable_reason}</p><Button variant="outline" render={<Link href={NEW_ASSESSMENT_PATH} />} nativeButton={false}>Prepare a paper assessment</Button></div>}
    </> : !error ? <p role="status" className="text-sm">Checking retained protocols and input availability…</p> : <Button variant="outline" size="sm" onClick={() => setRevision(r => r + 1)}>Retry preview</Button>}
    {message ? <p role="status" className="text-sm">{message}</p> : null}
    {savedStudy ? <Link className="block text-sm underline" href={experimentQueuePath(savedStudy)}>View this follow-up in Experiment Queue</Link> : null}
  </section>;
}

export function AssessmentGapExperiments({ studyId, gapId, launchId }: { studyId: string; gapId: string; launchId?: string }) {
  const router = useRouter();
  function queued(id: string, job: string) { router.push(experimentQueuePath(id, job)); }
  return launchId ? <section aria-label="Run requested experiment" className="space-y-3 rounded-lg border p-5"><h2 className="text-lg font-semibold">Run requested experiment</h2><RunGapExperiment studyId={studyId} gapId={gapId} launchId={launchId} onQueued={queued} /></section> : <GapExperimentPlanner studyId={studyId} gapId={gapId} onQueued={queued} />;
}
