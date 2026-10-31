"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { AlertCircle, ArrowLeft, ArrowUpRight, CheckCircle2, Circle, Clock3, LoaderCircle, Pause, Play, RefreshCw, ShieldCheck, Square } from "lucide-react";
import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";
import { Textarea } from "@/app/components/ui/textarea";
import { Checkbox } from "@/app/components/ui/checkbox";
import { Badge } from "@/app/components/ui/badge";
import { WorkerHeartbeat } from "@/app/components/platform-worker-heartbeat";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { PLATFORM_REPOSITORIES, PLATFORM_UPDATES_PATH, parsePlatformControl, parsePlatformSnapshot, platformMoney, platformPullRequest, platformTime, type PlatformAction, type PlatformControl, type PlatformEvent, type PlatformRead, type PlatformStage, type PlatformTask } from "@/lib/platform-updates";

const TERMINAL: PlatformStage[] = ["completed", "rolled-back", "cancelled", "deadline", "budget"];
function Stage({ stage }: { stage: string }) {
  const done = stage === "completed" || stage === "verified";
  const warning = ["blocked", "reconciling", "unknown", "failed", "deadline", "budget"].includes(stage);
  const Icon = done ? CheckCircle2 : warning ? AlertCircle : stage === "queued" ? Clock3 : Circle;
  return <Badge variant="outline" className={cn("gap-1.5 capitalize", done && "border-emerald-600/30 text-emerald-700 dark:text-lime-300", warning && "border-amber-500/40 text-amber-800 dark:text-amber-300")}><Icon className="size-3" />{stage.replaceAll("-", " ")}</Badge>;
}
function mergeEvents(previous: PlatformEvent[], incoming: PlatformEvent[]) { return [...new Map([...previous, ...incoming].map(event => [String(event.sequence), event])).values()].sort((a, b) => BigInt(a.sequence) > BigInt(b.sequence) ? -1 : BigInt(a.sequence) < BigInt(b.sequence) ? 1 : 0); }
function mergeTasks(previous: PlatformTask[], incoming: PlatformTask[]) { return [...new Map([...previous, ...incoming].map(task => [task.id, task])).values()].sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id)); }

export function PlatformUpdates({ initial, taskId }: { initial: PlatformRead; taskId?: string }) {
  const [read, setRead] = useState(initial);
  const [tasks, setTasks] = useState(initial.status === "available" ? initial.data.tasks : []);
  const [events, setEvents] = useState(initial.status === "available" ? initial.data.events : []);
  const [message, setMessage] = useState(""); const [busy, setBusy] = useState(false); const [pending, setPending] = useState<PlatformControl | null>(null);
  const [olderTasks, setOlderTasks] = useState(initial.status === "available" && initial.data.has_more_tasks);
  const [olderEvents, setOlderEvents] = useState(initial.status === "available" && initial.data.has_more_events);
  const [title, setTitle] = useState(""); const [objective, setObjective] = useState(""); const [repositories, setRepositories] = useState<string[]>([...PLATFORM_REPOSITORIES]);
  const [budget, setBudget] = useState("100"); const [hours, setHours] = useState("6"); const [stream, setStream] = useState("Polling recorded status");
  const inFlight = useRef(false); const mounted = useRef(true);
  const paged = useRef({ tasks: false, events: false });
  const storageKey = read.status === "available" ? `jumpserve-platform-control:${read.data.operator_id}` : null;
  const refresh = useCallback(async (cursor?: { event?: string; task?: string }) => {
    if (inFlight.current) return; inFlight.current = true;
    try {
      const query = new URLSearchParams(); if (taskId) query.set("task", taskId); if (cursor?.event) query.set("before_event", cursor.event); if (cursor?.task) query.set("before_task", cursor.task);
      const response = await fetch(`/api/platform-updates?${query}`, { cache: "no-store" }); const value = await response.json();
      if (!mounted.current) return;
      if (response.status === 401) { setRead({ status: "forbidden", reason: "Your session ended. Sign in again to view platform activity." }); return; }
      if (value.status !== "available") { setRead(value.status === "forbidden" ? value : { status: "unavailable", reason: value.reason || "Platform status is temporarily unavailable." }); return; }
      const data = parsePlatformSnapshot(value.data);
      if (!cursor) setRead({ status: "available", data });
      if (!cursor?.event) { setTasks(previous => mergeTasks(previous, data.tasks)); if (cursor?.task) paged.current.tasks = true; if (cursor?.task || !paged.current.tasks) setOlderTasks(data.has_more_tasks); }
      if (!cursor?.task) { setEvents(previous => mergeEvents(previous, data.events)); if (cursor?.event) paged.current.events = true; if (cursor?.event || !paged.current.events) setOlderEvents(data.has_more_events); }
    } catch (error) { if (mounted.current) setMessage(error instanceof Error ? error.message : "Refresh failed; the recorded history is retained."); }
    finally { inFlight.current = false; }
  }, [taskId]);
  useEffect(() => {
    mounted.current = true; const timer = window.setInterval(() => { void refresh(); }, 10000);
    let cleanup = () => {};
    try {
      const client = createClient(); const channel = client.channel(`platform-updates:${taskId || "all"}`).on("postgres_changes", { event: "INSERT", schema: "public", table: "platform_events" }, () => { void refresh(); }).subscribe(status => {
        if (status === "SUBSCRIBED") { setStream("Live events with polling recovery"); void refresh(); }
        else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") setStream("Live stream reconnecting · polling active");
      });
      cleanup = () => { void client.removeChannel(channel); };
    } catch { setStream("Polling recorded status"); }
    return () => { mounted.current = false; window.clearInterval(timer); cleanup(); };
  }, [taskId, refresh]);
  useEffect(() => {
    if (!storageKey) return;
    try { const saved = sessionStorage.getItem(storageKey); if (saved) { setPending(parsePlatformControl(JSON.parse(saved))); setMessage("An earlier control request needs reconciliation. Retry it with its original identity."); } } catch { /* Unavailable local storage does not grant or change server authority. */ }
  }, [storageKey]);
  async function submit(control: PlatformControl) {
    setBusy(true); setPending(control); setMessage("");
    try {
      try { if (storageKey) sessionStorage.setItem(storageKey, JSON.stringify(control)); } catch { /* The in-memory request identity remains available for reconciliation. */ }
      const response = await fetch("/api/platform-updates", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(control) }); const value = await response.json();
      if (!response.ok) throw new Error(value.error || "Control request is unconfirmed. Retry the same request.");
      try { if (storageKey) sessionStorage.removeItem(storageKey); } catch { /* A retained identity safely replays the same server request. */ } setPending(null); setMessage("Control recorded.");
      if (control.action === "enqueue") { setTitle(""); setObjective(""); }
      await refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Control request is unconfirmed."); }
    finally { setBusy(false); }
  }
  function act(action: PlatformAction, id: string | null = null) { void submit({ action, request_id: crypto.randomUUID(), task_id: id, payload: {} }); }
  function enqueue(event: FormEvent) {
    event.preventDefault();
    try { void submit(parsePlatformControl({ action: "enqueue", request_id: crypto.randomUUID(), task_id: crypto.randomUUID(), payload: { title: title.trim(), objective: objective.trim(), repositories, max_reserved_cents: Math.round(Number(budget) * 100), elapsed_seconds: Math.round(Number(hours) * 3600) } })); } catch (error) { setMessage(error instanceof Error ? error.message : "Invalid platform task."); }
  }
  const snapshot = read.status === "available" ? read.data : null; const selected = snapshot?.tasks.find(task => task.id === taskId);
  const owner = snapshot?.operator_role === "owner"; const disabled = busy || pending !== null;
  return <main className="mx-auto w-full max-w-6xl space-y-6 px-4 py-6 sm:px-6">
    <div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0 space-y-2">
      {taskId && <Link href={PLATFORM_UPDATES_PATH} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" />All platform updates</Link>}
      <h1 className="text-2xl font-semibold tracking-tight">{selected?.title || "Platform Updates"}</h1>
      <p className="max-w-3xl text-sm text-muted-foreground">Follow the platform supervisor’s improvements, recorded checks and production releases across JumpServe.</p>
    </div><Button variant="outline" size="sm" onClick={() => { void refresh(); }}><RefreshCw />Refresh</Button></div>
    {read.status !== "available" ? <section className="rounded-lg border bg-card p-5" role="status"><h2 className="font-medium">{read.status === "forbidden" ? "Platform operator access required" : "Platform status unavailable"}</h2><p className="mt-2 text-sm text-muted-foreground">{read.reason}</p><p className="mt-2 text-sm text-muted-foreground">Only configured Google accounts can view this private activity.</p></section> : <>
      <section className="grid gap-3 md:grid-cols-3" aria-label="Supervisor status">
        <div className="rounded-lg border bg-card p-4"><div className="flex items-center gap-2 text-sm font-medium">{snapshot?.settings.paused ? <Pause className="size-4" /> : <Play className="size-4" />}{snapshot?.settings.paused ? "New work paused" : "Accepting work"}</div><p className="mt-2 text-xs text-muted-foreground">{snapshot?.settings.worker_status.replaceAll("-", " ")}</p><p className="mt-1 break-words text-xs text-muted-foreground">{snapshot?.settings.worker_reason || "No additional worker message."}</p></div>
        <div className="rounded-lg border bg-card p-4"><div className="flex items-center gap-2 text-sm font-medium"><ShieldCheck className="size-4" />{snapshot?.settings.automatic_releases ? "Automatic merges and releases enabled" : "Automatic releases disabled"}</div><p className="mt-2 break-all text-xs text-muted-foreground">Authority: {snapshot?.authorization?.version || "Not configured"}</p><p className="mt-1 text-xs text-muted-foreground">Each release requires its recorded checks and production verification.</p></div>
        <div className="rounded-lg border bg-card p-4"><p className="text-sm font-medium">Last worker heartbeat</p><WorkerHeartbeat seenAt={snapshot?.settings.worker_seen_at} /><p className="mt-1 text-xs text-muted-foreground">{stream}</p></div>
      </section>
      {owner && <div className="flex flex-wrap gap-2"><Button variant="outline" size="sm" disabled={disabled} onClick={() => act(snapshot?.settings.paused ? "resume" : "pause")}>{snapshot?.settings.paused ? <Play /> : <Pause />}{snapshot?.settings.paused ? "Resume new work" : "Pause new work"}</Button><Button variant="outline" size="sm" disabled={disabled} onClick={() => act(snapshot?.settings.automatic_releases ? "disable-releases" : "enable-releases")}>{snapshot?.settings.automatic_releases ? "Disable automatic releases" : "Enable automatic releases"}</Button><p className="self-center text-xs text-muted-foreground">In-flight actions retain their identities and stop at a safe boundary.</p></div>}
      {selected ? <section className="rounded-lg border bg-card p-4"><div className="flex flex-wrap items-center gap-3"><Stage stage={selected.status} /><span className="text-xs text-muted-foreground">Updated {platformTime(selected.updated_at)}</span>{owner && !TERMINAL.includes(selected.status) && <Button className="ml-auto" variant="outline" size="sm" disabled={disabled || selected.cancel_requested} onClick={() => act("cancel", selected.id)}><Square />{selected.cancel_requested ? "Cancellation requested" : "Cancel work"}</Button>}</div><p className="mt-3 whitespace-pre-wrap text-sm">{selected.objective}</p><p className="mt-3 whitespace-pre-wrap text-sm text-muted-foreground">{selected.reason}</p><div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-xs text-muted-foreground"><span>Reservations {platformMoney(selected.committed_cents)} / {platformMoney(selected.max_reserved_cents)}</span><span>Deadline {platformTime(selected.deadline_at)}</span></div><p className="mt-2 text-xs text-muted-foreground">Reservations are conservative admission amounts. Actual charges may be unavailable.</p><div className="mt-3 flex flex-wrap gap-2">{selected.repositories.map(repo => <Badge key={repo} variant="outline">{repo.split("/")[1]}</Badge>)}</div></section> : <>
        {owner && <details className="rounded-lg border bg-card p-4"><summary className="cursor-pointer text-sm font-medium">Queue a platform improvement</summary><form className="mt-4 space-y-4" onSubmit={enqueue}><label className="block space-y-1.5 text-sm"><span>Title</span><Input value={title} onChange={event => setTitle(event.target.value)} maxLength={160} required /></label><label className="block space-y-1.5 text-sm"><span>Objective and acceptance criteria</span><Textarea value={objective} onChange={event => setObjective(event.target.value)} maxLength={12000} rows={4} required /></label><fieldset className="space-y-2"><legend className="mb-2 text-sm">Repositories</legend>{PLATFORM_REPOSITORIES.map(repo => <label key={repo} className="flex items-center gap-3 text-sm"><Checkbox checked={repositories.includes(repo)} onCheckedChange={checked => setRepositories(previous => checked ? [...previous, repo] : previous.filter(value => value !== repo))} />{repo.split("/")[1]}</label>)}</fieldset><div className="grid gap-4 sm:grid-cols-2"><label className="space-y-1.5 text-sm"><span>Maximum reservations (USD)</span><Input type="number" min="1" max="10000" step="1" value={budget} onChange={event => setBudget(event.target.value)} /></label><label className="space-y-1.5 text-sm"><span>Elapsed-time limit (hours)</span><Input type="number" min="0.1" max="168" step="0.1" value={hours} onChange={event => setHours(event.target.value)} /></label></div><Button type="submit" disabled={disabled || !snapshot?.authorization}>{busy && <LoaderCircle className="animate-spin" />}Queue improvement</Button><p className="text-xs text-muted-foreground">Qualified changes can merge and deploy under the standing platform authorization.</p></form></details>}
        <section className="space-y-3"><h2 className="font-semibold">Improvements</h2>{!tasks.length && <div className="rounded-lg border bg-card p-6 text-sm text-muted-foreground">No platform improvements have been recorded yet.</div>}{tasks.map(task => <Link key={task.id} href={`${PLATFORM_UPDATES_PATH}/${task.id}`} className="block rounded-lg border bg-card p-4 outline-none transition-colors hover:bg-accent/40 focus-visible:ring-2 focus-visible:ring-ring"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="min-w-0 break-words text-sm font-medium">{task.title}</h3><Stage stage={task.status} /></div><p className="mt-2 line-clamp-2 whitespace-pre-wrap text-sm text-muted-foreground">{task.reason}</p><div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground"><span>{task.repositories.map(repo => repo.split("/")[1]).join(" · ")}</span><span>{platformMoney(task.committed_cents)} reserved</span><span>{platformTime(task.updated_at)}</span></div></Link>)}{olderTasks && tasks.length > 0 && <Button variant="outline" size="sm" onClick={() => { void refresh({ task: tasks.at(-1)?.id }); }}>Load older improvements</Button>}</section>
      </>}
      {taskId && <><section className="space-y-3"><h2 className="font-semibold">Repository changes</h2>{!snapshot?.changes.length && <p className="text-sm text-muted-foreground">No tested changes have been recorded.</p>}{snapshot?.changes.map(change => <div key={change.id} className="rounded-lg border bg-card p-4"><div className="flex flex-wrap justify-between gap-2"><p className="text-sm font-medium">{change.repository.split("/")[1]}</p><Stage stage={change.status} /></div><p className="mt-2 text-sm text-muted-foreground">{change.summary}</p><p className="mt-2 break-all font-mono text-xs text-muted-foreground">{change.base_sha} → {change.merge_sha || change.head_sha || "Unpublished"}</p>{platformPullRequest(change.pr_url) && <a className="mt-3 inline-flex items-center gap-1 text-sm text-primary underline underline-offset-4" href={platformPullRequest(change.pr_url)} target="_blank" rel="noreferrer">View pull request<ArrowUpRight className="size-3" /></a>}</div>)}</section>
        <section className="space-y-3"><h2 className="font-semibold">Production releases</h2>{!snapshot?.releases.length && <p className="text-sm text-muted-foreground">No production release has been recorded.</p>}{snapshot?.releases.map(release => <div key={release.id} className="rounded-lg border bg-card p-4"><div className="flex flex-wrap justify-between gap-2"><p className="text-sm font-medium">{release.component}</p><Stage stage={release.status} /></div><p className="mt-2 break-all font-mono text-xs">{release.revision}</p><p className="mt-2 text-xs text-muted-foreground">Updated {platformTime(release.updated_at)}</p>{release.verification && <details className="mt-3 text-sm"><summary className="cursor-pointer">Recorded verification</summary><pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap break-all rounded border bg-muted p-3 text-xs">{JSON.stringify(release.verification, null, 2)}</pre></details>}</div>)}</section></>}
      <section className="space-y-3"><h2 className="font-semibold">Recorded activity</h2>{!events.length ? <p className="text-sm text-muted-foreground">No activity events have been recorded.</p> : <ol className="divide-y rounded-lg border bg-card">{events.map(event => <li key={String(event.sequence)} className="space-y-2 p-4"><div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground"><time dateTime={event.created_at}>{platformTime(event.created_at)}</time><span className="capitalize">{event.actor}</span><span>{event.kind.replaceAll("-", " ")}</span></div><p className="whitespace-pre-wrap text-sm">{event.message}</p>{Object.keys(event.details).length > 0 && <details className="text-xs text-muted-foreground"><summary className="cursor-pointer">Event details</summary><pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-all rounded border bg-muted p-3">{JSON.stringify(event.details, null, 2)}</pre></details>}{!taskId && event.task_id && <Link className="inline-block text-xs text-primary underline underline-offset-4" href={`${PLATFORM_UPDATES_PATH}/${event.task_id}`}>View improvement</Link>}</li>)}</ol>}{olderEvents && events.length > 0 && <Button variant="outline" size="sm" onClick={() => { void refresh({ event: String(events.at(-1)?.sequence) }); }}>Load earlier activity</Button>}</section>
      {taskId && <section className="space-y-3"><h2 className="font-semibold">Prompts, responses and evidence</h2><p className="text-xs text-muted-foreground">Latest 30 model calls and 50 artifacts. Original hashes identify captured bytes; software checks do not establish scientific validity.</p>{snapshot?.runs.map(run => <div key={run.id} className="rounded-lg border bg-card p-3 text-sm"><div className="flex flex-wrap items-center gap-2"><span>Model call {run.number}</span><Stage stage={run.status} />{run.reconciled && <span className="text-xs text-muted-foreground">Original unknown outcome reconciled separately</span>}</div><div className="mt-2 flex gap-4 text-xs"><a className="text-primary underline" href={`/api/platform-updates/artifacts/${run.request_artifact_id}`}>Original request</a>{run.response_artifact_id && <a className="text-primary underline" href={`/api/platform-updates/artifacts/${run.response_artifact_id}`}>Captured response</a>}</div>{run.reason && <p className="mt-2 text-xs text-muted-foreground">{run.reason}</p>}{run.usage && <details className="mt-2 text-xs"><summary className="cursor-pointer">Reported usage</summary><pre className="mt-2 overflow-auto whitespace-pre-wrap break-all">{JSON.stringify(run.usage, null, 2)}</pre></details>}</div>)}<div className="divide-y rounded-lg border bg-card">{snapshot?.artifacts.map(artifact => <div className="space-y-1 p-3" key={artifact.id}><a className="break-all text-sm text-primary underline underline-offset-4" href={`/api/platform-updates/artifacts/${artifact.id}`}>{artifact.name}</a><p className="text-xs text-muted-foreground">{artifact.byte_count.toLocaleString("en-US")} bytes · {platformTime(artifact.created_at)}</p><p className="break-all font-mono text-[10px] text-muted-foreground">SHA-256 {artifact.sha256}</p></div>)}</div></section>}
    </>}
    {message && <div role="status" className="rounded-lg border bg-card p-3 text-sm"><p>{message}</p>{pending && !busy && <Button className="mt-2" size="sm" variant="outline" onClick={() => { void submit(pending); }}>Reconcile original control request</Button>}</div>}
  </main>;
}
