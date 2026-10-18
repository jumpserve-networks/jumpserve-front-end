"use client";
import { useEffect, useState } from "react";
import { Button } from "@/app/components/ui/button";
import { Badge } from "@/app/components/ui/badge";
import { researchRequest } from "@/lib/research-workflow-api";
import { validateTurnHistory, type AutonomousOverview, type AutonomousTask, type AutonomousTurn } from "@/lib/research-autonomy";

const words = (text: string) => text.replaceAll("-", " ");
const time = (value: string) => new Date(value).toLocaleString("en-US", { timeZone: "UTC" }) + " UTC";
function TurnHistory({ task }: { task: AutonomousTask }) {
  const [turns, setTurns] = useState<AutonomousTurn[]>([]);
  const [before, setBefore] = useState<number | null>(null);
  const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    researchRequest(`/studies/${task.study_id}/autonomy?${new URLSearchParams({ task: task.id })}`, { signal: controller.signal }).then(result => {
      if (controller.signal.aborted) return;
      const value = validateTurnHistory(result, task.study_id, task.id); setTurns(value.turns); setBefore(value.next_before); setError("");
    }).catch(failure => { if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : "Prompt history unavailable."); });
    return () => controller.abort();
  }, [task.id, task.study_id, task.attempts, task.updated_at]);
  async function older() {
    if (before === null || busy) return; setBusy(true);
    try {
      const value = validateTurnHistory(await researchRequest(`/studies/${task.study_id}/autonomy?${new URLSearchParams({ task: task.id, before: String(before) })}`), task.study_id, task.id);
      setTurns(previous => [...previous, ...value.turns.filter(t => !previous.some(p => p.id === t.id))]); setBefore(value.next_before); setError("");
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Older turns unavailable."); }
    finally { setBusy(false); }
  }
  return <div className="mt-3 space-y-3">
    {error ? <p role="alert" className="text-destructive">{error}</p> : null}
    {!turns.length && !error ? <p role="status">{task.attempts ? "Loading recorded turns…" : "No model turn has started. The initial paper request is retained above."}</p> : null}
    {turns.map(turn => <article key={turn.id} className="space-y-2 rounded-md border p-3 text-xs">
      <p className="font-medium">Turn {turn.number} · {words(turn.stage)} · {words(turn.status)}</p>
      <p>{time(turn.created_at)} · {turn.model_id}</p>
      {turn.reason ? <p>{turn.reason}</p> : null}
      <p>Reserved ${(turn.reserved_cents / 100).toFixed(2)} · usage-based estimate {turn.estimated_cents === null ? "unknown" : `$${(turn.estimated_cents / 100).toFixed(2)}`} · measured charge unknown</p>
      <details><summary className="cursor-pointer">Exact prompt and configuration</summary><pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap break-all bg-muted p-3">{JSON.stringify(turn.request, null, 2)}</pre><p className="mt-2 break-all">Prompt version {turn.prompt_version_id} · request SHA256 {turn.request_sha256}</p></details>
      <details><summary className="cursor-pointer">Response, evidence and usage</summary><pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap break-all bg-muted p-3">{JSON.stringify({ raw_response: turn.raw_response, response_sha256: turn.response_sha256, parsed: turn.output, usage: turn.usage }, null, 2)}</pre></details>
    </article>)}
    {before !== null ? <Button size="sm" variant="outline" disabled={busy} onClick={() => void older()}>Show older turns</Button> : null}
  </div>;
}
function Claim({ task }: { task: AutonomousTask }) {
  const [open, setOpen] = useState(false);
  return <article className="space-y-2 rounded-md border p-4 text-sm" id={`claim-task-${task.id}`}>
    <div className="flex flex-wrap items-start justify-between gap-3"><h4 className="min-w-0 break-words font-medium">{task.claim_title ?? "Paper preparation and claim inventory"}</h4><Badge variant={task.status === "blocked" ? "destructive" : "secondary"} className="h-auto py-1">{words(task.status)}</Badge></div>
    <p>{words(task.stage)} · {task.attempts} / 25 model attempts{task.label ? ` · finding: ${task.label}` : " · scientific finding not applicable to intake"}</p>
    <p>{task.reason}</p><p className="text-xs text-muted-foreground">Recorded update: {time(task.updated_at)}</p>
    {task.status === "blocked" && task.required_inputs.length ? <div><p className="font-medium">Needed to resume this claim</p><ul className="mt-1 list-disc space-y-1 pl-5">{task.required_inputs.map((input, index) => <li key={index}>{input}</li>)}</ul></div> : null}
    <Button size="sm" variant="outline" aria-expanded={open} onClick={() => setOpen(value => !value)}>{open ? "Hide prompts and responses" : "View prompts and responses"}</Button>
    {open ? <TurnHistory task={task} /> : null}
  </article>;
}
export function AutonomousAssessments({ data, studyId, titles, stale = false }: { data: AutonomousOverview; studyId: string; titles: Map<string, string>; stale?: boolean }) {
  const workflows = data.workflows.filter(w => !studyId || w.study_id === studyId);
  return <section aria-label="Autonomous paper assessments" className="space-y-4">
    <h2 className="text-lg font-semibold">Autonomous paper assessments</h2>
    {stale ? <p role="status" className="rounded-lg border p-3 text-sm text-warning">The latest status retrieval failed. These retained claim states may be stale; current progress is unknown.</p> : null}
    {!data.enabled ? <p role="status" className="rounded-lg border p-3 text-sm">The autonomous controller is not enabled in this environment. Saved requests remain queued.</p> : null}
    {!workflows.length ? <p className="text-sm text-muted-foreground">No autonomous assessments in this view.</p> : null}
    {workflows.map(w => {
      const tasks = data.tasks.filter(t => t.study_id === w.study_id), claims = tasks.filter(t => t.claim_id !== null);
      const intake = tasks.find(t => t.claim_id === null);
      return <article key={w.study_id} className="space-y-4 rounded-lg border border-primary/40 p-5">
        <div className="flex flex-wrap justify-between gap-3"><h3 className="font-semibold">{titles.get(w.study_id) ?? "Paper assessment"}</h3><Badge variant="secondary">{words(w.status)}</Badge></div>
        <p className="text-sm">${(w.committed_cents / 100).toFixed(2)} committed of $100 · deadline {time(w.deadline_at)} · 25 attempts per claim</p>
        <p className="text-xs text-muted-foreground">Commitments include conservative reservations. Actual charges and unallocated costs remain unknown until reconciled. Closing this page does not stop enabled background workers.</p>
        <p className="text-sm">{w.reason}</p>
        <p className="text-sm">{claims.length} recorded candidate claims · {claims.filter(t => t.status === "resolved").length} resolved under tested conditions · {claims.filter(t => ["blocked", "attempt-limit", "budget", "deadline", "cancelled"].includes(t.status)).length} paused or stopped. {intake?.status !== "finished" ? "Claim inventory coverage is still incomplete." : "Inventory scope and omissions remain in the preparation record."}</p>
        <details className="text-sm"><summary className="cursor-pointer">Initial paper prompt</summary><pre className="mt-3 max-h-64 overflow-auto whitespace-pre-wrap break-all bg-muted p-3 text-xs">{w.initial_prompt}</pre><p className="mt-2 break-all text-xs">SHA256 {w.initial_sha256}</p></details>
        <div className="space-y-3">{tasks.map(task => <Claim key={task.id} task={task} />)}</div>
      </article>;
    })}
  </section>;
}
