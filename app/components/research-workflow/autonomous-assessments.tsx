"use client";
import { useEffect, useState } from "react";
import { LocalDateTime } from "@/app/components/user-preferences";
import { Button } from "@/app/components/ui/button";
import { Badge } from "@/app/components/ui/badge";
import { researchRequest } from "@/lib/research-workflow-api";
import { validateTurnHistory, validateBuilderEvidence, type AutonomousOverview, type AutonomousTask, type AutonomousTurn, type BuilderCall } from "@/lib/research-autonomy";
import type { PublicAutonomousOverview, PublicAutonomousTask } from "@/lib/research-public-queue";
import { loadSharedTurnHistory, loadSharedBuilderEvidence, publicStatusReason, type SharedProjection } from "@/lib/research-public-queue";

const words = (text: string) => text.replaceAll("-", " ");
const time = (value: string) => <LocalDateTime value={value} />;
function NativeEvidence({call,kind,readOnly}:{call:BuilderCall;kind:"request"|"response";readOnly:boolean}) {
  const [open,setOpen]=useState(false);const [fragments,setFragments]=useState<string[]>([]);
  const [cursor,setCursor]=useState<number|null>(0);const [busy,setBusy]=useState(false);const [error,setError]=useState("");const [reason,setReason]=useState("");
  async function load() {
    if(cursor===null||busy)return;setBusy(true);setError("");
    try {
      const query=new URLSearchParams({task:call.task_id,builder_call:call.id,kind,cursor:String(cursor)});
      const result=readOnly?await loadSharedBuilderEvidence(call.study_id,call.task_id,call.id,kind,cursor):validateBuilderEvidence(await researchRequest(`/studies/${call.study_id}/autonomy?${query}`),call.study_id,call.task_id,call.id,kind,cursor);
      setFragments(previous=>[...previous,...(result.fragment===null?[]:[result.fragment])]);setCursor(result.next_cursor);setReason(result.reason);
    }catch(failure){setError(failure instanceof Error?failure.message:"Native evidence unavailable.");}finally{setBusy(false);}
  }
  return <div className="space-y-2"><Button size="sm" variant="outline" aria-expanded={open} onClick={()=>{setOpen(value=>!value);if(!open&&cursor===0&&!fragments.length)void load();}}>{kind==="request"?"Native prompt and tool results":"Native response and tool calls"}</Button>{open?<div className="space-y-2">{error?<p role="alert" className="text-destructive">{error}</p>:null}{busy?<p role="status">Loading recorded evidence…</p>:null}{reason?<p>{reason}</p>:null}{fragments.length?<pre className="max-h-80 overflow-auto whitespace-pre-wrap break-all bg-muted p-3">{fragments.join("")}</pre>:null}{cursor!==null?<Button size="sm" variant="outline" disabled={busy} onClick={()=>void load()}>{error?"Retry evidence retrieval":"Read next fragment"}</Button>:null}</div>:null}</div>;
}
function TurnHistory({ task, readOnly = false }: { task: AutonomousTask | PublicAutonomousTask; readOnly?: boolean }) {
  const [turns, setTurns] = useState<AutonomousTurn[]>([]);
  const [builderCalls,setBuilderCalls]=useState<BuilderCall[]>([]);
  const [before, setBefore] = useState<number | null>(null);
  const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  const [projection, setProjection] = useState<SharedProjection | null>(null);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    const request = readOnly ? loadSharedTurnHistory(task.study_id, task.id, undefined, controller.signal) : researchRequest(`/studies/${task.study_id}/autonomy?${new URLSearchParams({ task: task.id })}`, { signal: controller.signal }).then(value => validateTurnHistory(value, task.study_id, task.id));
    request.then(value => {
      if (controller.signal.aborted) return;
      setTurns(value.turns);setBuilderCalls(value.builder_calls??[]); setBefore(value.next_before); setError(""); setLoaded(true); if ("projection" in value) setProjection(value.projection);
    }).catch(failure => { if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : "Prompt history unavailable."); });
    return () => controller.abort();
  }, [task.id, task.study_id, task.attempts, task.updated_at, readOnly]);
  async function older() {
    if (before === null || busy) return; setBusy(true);
    try {
      const value = readOnly ? await loadSharedTurnHistory(task.study_id, task.id, before) : validateTurnHistory(await researchRequest(`/studies/${task.study_id}/autonomy?${new URLSearchParams({ task: task.id, before: String(before) })}`), task.study_id, task.id);
      setTurns(previous => [...previous, ...value.turns.filter(t => !previous.some(p => p.id === t.id))]); setBefore(value.next_before); setError("");
      setBuilderCalls(previous=>[...previous,...(value.builder_calls??[]).filter(c=>!previous.some(p=>p.id===c.id))]);
      if ("projection" in value) setProjection(value.projection);
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Older turns unavailable."); }
    finally { setBusy(false); }
  }
  return <div className="mt-3 space-y-3">
    {error ? <p role="alert" className="text-destructive">{error}</p> : null}
    {projection ? <p className="text-xs text-muted-foreground">{projection.note} {projection.redacted} values redacted · {projection.truncated} text values omitted or shortened on the latest page.</p> : null}
    {!turns.length && !builderCalls.length && !error ? <p role="status">{!loaded && task.attempts ? "Loading recorded turns…" : task.attempts ? "No turn records were returned. The attempt counter remains recorded; missing responses are unknown." : "No model turn has started. The initial paper request remains recorded."}</p> : null}
    {turns.map(turn => <article key={turn.id} className="space-y-2 rounded-md border p-3 text-xs">
      <p className="font-medium">Turn {turn.number} · {words(turn.stage)} · {words(turn.status)}</p>
      <p>{time(turn.created_at)} · {turn.model_id}</p>
      {turn.reason ? <p>{turn.reason}</p> : null}
      <p>Reserved ${(turn.reserved_cents / 100).toFixed(2)} · usage-based estimate {turn.estimated_cents === null ? "unknown" : `$${(turn.estimated_cents / 100).toFixed(2)}`} · measured charge unknown</p>
      <details><summary className="cursor-pointer">{readOnly ? "Prompt and configuration (shared copy)" : "Exact prompt and configuration"}</summary><pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap break-all bg-muted p-3">{JSON.stringify(turn.request, null, 2)}</pre><p className="mt-2 break-all">Prompt version {turn.prompt_version_id} · original request SHA256 {turn.request_sha256}</p></details>
      <details><summary className="cursor-pointer">Response, evidence and usage</summary><pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap break-all bg-muted p-3">{JSON.stringify({ raw_response: turn.raw_response, response_sha256: turn.response_sha256, parsed: turn.output, usage: turn.usage }, null, 2)}</pre></details>
    </article>)}
    {builderCalls.length?<div className="space-y-3"><h6 className="font-medium">Native experiment builder calls</h6><p className="text-xs text-muted-foreground">Each call retains its original prompt, tool history and response. Building code does not establish a scientific finding.</p>{builderCalls.map(call=><article key={call.id} className="space-y-2 rounded-md border p-3 text-xs"><p className="font-medium">AI call {call.number} · {words(call.status)}</p><p>{time(call.created_at)} · {call.model_id} · additional reservation ${(call.reserved_cents/100).toFixed(2)}</p>{call.reserved_cents===0?<p>The containing builder turn reserved this call’s allowance. Measured charge is unknown.</p>:<p>Measured charge is unknown.</p>}{call.reason?<p>{call.reason}</p>:null}<p className="break-all">Original request SHA256 {call.request_sha256}</p><NativeEvidence key={`${call.id}-request`} call={call} kind="request" readOnly={readOnly}/><NativeEvidence key={`${call.id}-response-${call.status}`} call={call} kind="response" readOnly={readOnly}/></article>)}</div>:null}
    {before !== null ? <Button size="sm" variant="outline" disabled={busy} onClick={() => void older()}>Show older turns</Button> : null}
  </div>;
}
function Claim({ task, maxAttempts, readOnly = false, embedded = false }: { task: AutonomousTask | PublicAutonomousTask; maxAttempts: number | null; readOnly?: boolean; embedded?: boolean }) {
  const [open, setOpen] = useState(false);
  const privateTask = !readOnly && "required_inputs" in task ? task : null;
  const Heading = embedded ? "h5" : "h4";
  return <article className="space-y-2 rounded-md border p-4 text-sm" id={`claim-task-${task.id}`}>
    <div className="flex flex-wrap items-start justify-between gap-3"><Heading className="min-w-0 break-words font-medium">{task.claim_title ?? "Paper preparation and claim inventory"}</Heading><Badge variant={task.status === "blocked" ? "destructive" : "secondary"} className="h-auto py-1">{words(task.status)}</Badge></div>
    <p>{task.claim_id === null ? "Paper preparation" : words(task.stage)} · {task.attempts}{maxAttempts === null ? " AI turns" : ` / ${maxAttempts} model attempts`}{task.label ? ` · finding: ${task.label}` : null}</p>
    {task.evidence_progress ? <p className="text-xs text-muted-foreground">{task.evidence_progress.completed_checks} / {task.evidence_progress.required_checks} retained checks examined. {task.evidence_progress.scope}</p> : null}
    <p className="whitespace-pre-wrap break-words" data-recorded-task-details>{readOnly ? publicStatusReason(task.reason) : task.reason}</p><p className="text-xs text-muted-foreground">Recorded update: {time(task.updated_at)}</p>
    {task.status === "blocked" && privateTask?.required_inputs.length ? <div><p className="font-medium">Needed to resume this claim</p><ul className="mt-1 list-disc space-y-1 pl-5">{privateTask.required_inputs.map((input, index) => <li key={index}>{input}</li>)}</ul></div> : null}
    <Button size="sm" variant="outline" aria-expanded={open} onClick={() => setOpen(value => !value)}>{open ? "Hide prompts and responses" : "View prompts and responses"}</Button>
    {open ? <TurnHistory task={task} readOnly={readOnly} /> : null}
  </article>;
}
export function AutonomousAssessmentStatus({ data, stale = false }: { data: AutonomousOverview | PublicAutonomousOverview; stale?: boolean }) {
  return <>
    {stale ? <p role="status" className="rounded-lg border p-3 text-sm text-warning">The latest status retrieval failed. These retained claim states may be stale; current progress is unknown.</p> : null}
    {!data.enabled ? <p role="status" className="rounded-lg border p-3 text-sm">The autonomous controller is not enabled in this environment. Saved requests remain queued.</p> : null}
  </>;
}

export function AutonomousAssessments({ data, studyId, titles, stale = false, embedded = false }: { data: AutonomousOverview | PublicAutonomousOverview; studyId: string; titles: Map<string, string>; stale?: boolean; embedded?: boolean }) {
  const workflows = data.workflows.filter(w => !studyId || w.study_id === studyId);
  const readOnly = "access" in data && data.access === "public-read-only";
  const Container = embedded ? "div" : "article";
  return <section aria-label={embedded ? "Assessment claim progress" : "Autonomous paper assessments"} className="space-y-4">
    {!embedded ? <><h2 className="text-lg font-semibold">Autonomous paper assessments</h2><AutonomousAssessmentStatus data={data} stale={stale} /></> : null}
    {!workflows.length ? <p className="text-sm text-muted-foreground">{embedded ? "Autonomous claim progress is not recorded for this assessment." : "No autonomous assessments in this view."}</p> : null}
    {workflows.map(w => {
      const tasks = data.tasks.filter(t => t.study_id === w.study_id), claims = tasks.filter(t => t.claim_id !== null);
      const intake = tasks.find(t => t.claim_id === null);
      return <Container key={w.study_id} className={embedded ? "space-y-4" : "space-y-4 rounded-lg border border-primary/40 p-5"}>
        <div className="flex flex-wrap justify-between gap-3">{embedded ? <h4 className="font-semibold">Claim progress</h4> : <h3 className="font-semibold">{titles.get(w.study_id) ?? "Paper assessment"}</h3>}<Badge variant="secondary">{words(w.status)}</Badge></div>
        <p className="text-sm">${(w.committed_cents / 100).toFixed(2)} committed of ${(w.max_spend_cents / 100).toFixed(2)} · deadline {time(w.deadline_at)}{w.max_attempts !== null ? ` · ${w.max_attempts} attempts per claim` : null}</p>
        <p className="text-xs text-muted-foreground">Commitments include conservative reservations. Actual charges and unallocated costs remain unknown until reconciled. Closing this page does not stop enabled background workers.</p>
        <p className="whitespace-pre-wrap break-words text-sm">{w.reason}</p>
        <p className="text-sm">{claims.length} recorded candidate claims · {claims.filter(t => t.status === "resolved").length} resolved under tested conditions · {claims.filter(t => ["blocked", "attempt-limit", "budget", "deadline", "cancelled"].includes(t.status)).length} paused or stopped. {intake?.status !== "finished" ? "Claim inventory coverage is still incomplete." : "Inventory scope and omissions remain in the preparation record."}</p>
        {!readOnly && "initial_prompt" in w && typeof w.initial_prompt === "string" && "initial_sha256" in w && typeof w.initial_sha256 === "string" ? <details className="text-sm"><summary className="cursor-pointer">Initial paper prompt</summary><pre className="mt-3 max-h-64 overflow-auto whitespace-pre-wrap break-all bg-muted p-3 text-xs">{w.initial_prompt}</pre><p className="mt-2 break-all text-xs">SHA256 {w.initial_sha256}</p></details> : null}
        <div className="space-y-3">{tasks.map(task => <Claim key={task.id} task={task} maxAttempts={w.max_attempts} readOnly={readOnly} embedded={embedded} />)}</div>
      </Container>;
    })}
  </section>;
}
