"use client";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";
import { researchRequest } from "@/lib/research-workflow-api";
import { prepareAndQueue, validatePreparation, type PreparationStatus } from "@/lib/research-preparation";

export function PaperPreparation({ studyId, onSaved }: { studyId: string; onSaved: () => Promise<void> }) {
  const [status, setStatus] = useState<PreparationStatus | null>(null);
  const [error, setError] = useState(""); const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false); const [input, setInput] = useState<string | undefined>();
  const request = useRef("");
  const inFlight = useRef(false);
  useEffect(() => {
    const controller = new AbortController();
    researchRequest(`/studies/${studyId}/prepare`, { signal: controller.signal }).then(value => { if (!controller.signal.aborted) setStatus(validatePreparation(value)); }).catch(failure => { if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : "Preparation is unavailable. The saved draft is retained."); });
    return () => controller.abort();
  }, [studyId]);
  async function refresh() { setStatus(validatePreparation(await researchRequest(`/studies/${studyId}/prepare`))); }
  async function start(preparedId?: string) {
    if (inFlight.current) return; inFlight.current = true; setBusy(true); setError(""); if (!request.current) request.current = crypto.randomUUID();
    try { await prepareAndQueue(studyId, request.current, setMessage, researchRequest, input, preparedId); await refresh(); await onSaved(); request.current = ""; }
    catch (failure) {
      setError(`${failure instanceof Error ? failure.message : "Preparation paused."} Previously saved records and jobs remain preserved. Refresh or resume the retained plan.`);
      try { await refresh(); await onSaved(); } catch { /* Keep the original failure visible; status remains unverified. */ }
    } finally { inFlight.current = false; setBusy(false); }
  }
  return <section aria-label="Prepare paper and queue checks" className="space-y-4 rounded-lg border p-5">
    <h2 className="text-lg font-semibold">Prepare paper and queue checks</h2>
    <p className="text-sm">Use an existing source-grounded plan or upload a reviewed domain plan. Preparation preserves sources and claims, freezes protocols and queues their checks. Archived numerical rechecks and operator tasks remain distinct; completion never automatically changes a claim finding.</p>
    {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
    {status ? <><p className="text-sm">{status.available_plan ? `${status.available_plan.title}: ${status.available_plan.claims} claims, ${status.available_plan.automatic_jobs} numerical checks and ${status.available_plan.manual_jobs} operator tasks.` : "This paper needs a source-grounded preparation plan. Automatic AI claim extraction is not enabled by this bridge."}</p>
      {status.available_plan ? <p className="text-xs text-muted-foreground">{String(status.available_plan.provenance.limitations ?? "Review the plan’s original scope before starting.")}</p> : null}
      <details className="rounded-lg border p-3"><summary className="cursor-pointer text-sm font-medium">Upload a source-grounded preparation plan</summary><div className="mt-3 space-y-2"><p className="text-xs text-muted-foreground">Versioned JSON data only, with exact paper identities, sources, claims, protocols and campaign inputs. Maximum {status.uploaded_plan_bytes.toLocaleString()} bytes. Source content cannot select code, commands, models or credentials. Review declarations must identify the actual reviewer.</p><Input aria-label="Preparation plan JSON" type="file" accept="application/json,.json" disabled={busy} onChange={async event => { const file = event.target.files?.[0]; if (!file) return; try { if (file.size > status.uploaded_plan_bytes) throw new Error("Plan exceeds the upload byte limit; split versioned plans rather than truncate."); const value = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(await file.arrayBuffer()); JSON.parse(value); if (new TextEncoder().encode(JSON.stringify({ action: "prepare", request_id: crypto.randomUUID(), plan_input: value })).length > 512000) throw new Error("Encoded preparation request exceeds the service byte limit."); setInput(value); request.current = ""; setError(""); setMessage(`Plan selected: ${file.name}. Its source and claim records will be validated before queueing.`); } catch (failure) { setInput(undefined); setError(failure instanceof Error ? failure.message : "Invalid preparation plan."); } }} /></div></details>
      <Button disabled={busy || (!status.available_plan && input === undefined)} onClick={() => void start()}>{busy ? "Preparing and queueing…" : input !== undefined ? "Prepare uploaded plan and queue checks" : "Prepare available checks and queue jobs"}</Button>
      {status.prepared.map(plan => <article key={plan.id} className="space-y-2 rounded-lg border p-3 text-sm"><p className="font-medium">{plan.plan_id} · {plan.queued_jobs} / {plan.planned_jobs} jobs preserved</p><p>{plan.automatic_jobs} numerical checks · {plan.manual_jobs} operator tasks</p>{plan.queued_jobs < plan.planned_jobs ? <Button size="sm" variant="outline" disabled={busy} onClick={() => void start(plan.id)}>Resume queueing this plan</Button> : <p className="text-xs text-muted-foreground">All job definitions are preserved. See the claim queue below for execution, blockers and evidence-review status.</p>}</article>)}
    </> : !error ? <p role="status">Loading preparation availability…</p> : null}
    {message ? <p role="status" className="text-sm">{message}</p> : null}
    <Button variant="outline" size="sm" disabled={busy} onClick={() => void refresh().then(() => setError("")).catch(failure => setError(failure instanceof Error ? failure.message : "Preparation status is unavailable."))}>Refresh preparation status</Button>
  </section>;
}
