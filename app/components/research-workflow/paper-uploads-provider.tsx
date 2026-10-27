"use client";

import Link from "next/link";
import { createContext, useContext, useEffect, useMemo, useSyncExternalStore, type ReactNode } from "react";
import { CheckCircle2, CircleAlert, LoaderCircle, X } from "lucide-react";
import { Button, buttonVariants } from "@/app/components/ui/button";
import { useUserPreferences } from "@/app/components/user-preferences";
import { PaperUploadManager } from "@/lib/paper-upload-manager";
import { researchRequest } from "@/lib/research-workflow-api";
import { createClient } from "@/lib/supabase/client";
import { NEW_ASSESSMENT_PATH } from "@/lib/test-modules";
import { experimentQueuePath } from "@/lib/research-experiment-queue";
import { assessmentActivityHeading, type AssessmentActivity } from "@/lib/assessment-notifications";
import { cn } from "@/lib/utils";

const Context = createContext<PaperUploadManager | null>(null);

function AssessmentNotice({ activity, stale, onDismiss }: { activity: AssessmentActivity; stale: boolean; onDismiss: () => void }) {
  const pending = activity.phase !== "finished" && activity.status !== "unavailable" && !stale;
  const success = activity.phase === "finished" && activity.status === "completed";
  const Icon = pending ? LoaderCircle : success ? CheckCircle2 : CircleAlert;
  return <article data-assessment-notice={activity.id} aria-atomic="true" className="space-y-3 rounded-xl border border-primary/40 bg-card p-4 text-card-foreground shadow-lg">
    <div className="flex items-start justify-between gap-3"><div className="flex min-w-0 items-start gap-2"><span aria-hidden="true" className={cn("mt-0.5 shrink-0 text-primary", pending && "animate-spin")}><Icon className="size-4" /></span><h2 className="text-sm font-semibold">{assessmentActivityHeading(activity)}</h2></div><Button variant="ghost" size="icon-sm" className="shrink-0 text-foreground" aria-label={`Dismiss assessment notification for ${activity.title}`} onClick={onDismiss}><X aria-hidden="true" /></Button></div>
    <p className="break-words text-sm font-medium">{activity.title}</p>
    {stale ? <p className="text-sm text-warning">Status is temporarily unavailable. {activity.counts ? "The last recorded progress is shown." : "JumpServe will retry automatically."}{activity.statusError ? <span className="mt-1 block">{activity.statusError}</span> : null}</p> : null}
    {activity.status === "unavailable" ? <p className="text-sm text-muted-foreground">Current assessment progress is unknown. Open Experiment Queue for details.</p> : activity.phase === "preparing" ? <p className="text-sm text-muted-foreground">Extracting the paper information for your review.</p> : activity.counts ? <div className="space-y-1 text-sm text-muted-foreground"><p>{activity.counts.finished} of {activity.counts.total} recorded claim checks finished.</p><p>{activity.counts.reproduced} reproduced · {activity.counts.discrepant} discrepant{activity.counts.blocked ? ` · ${activity.counts.blocked} need attention` : ""}</p>{activity.phase === "assessing" ? <p>{activity.counts.running} running · {activity.counts.queued} queued{activity.counts.waiting ? ` · ${activity.counts.waiting} waiting` : ""}</p> : null}</div> : <p className="text-sm text-muted-foreground">Waiting for recorded claim status.</p>}
    {pending ? <div role="progressbar" aria-label={activity.phase === "preparing" ? "Paper preparation in progress" : "Paper assessment in progress"} className="h-1 overflow-hidden rounded-full bg-primary/20"><div className="h-full w-full animate-pulse rounded-full bg-primary/60" /></div> : null}
    <Link prefetch={false} href={experimentQueuePath(activity.id)} onClick={onDismiss} className={buttonVariants({ size: "sm" })}>View experiment queue</Link>
    {activity.phase !== "finished" ? <p className="text-xs text-muted-foreground">{activity.phase === "preparing" ? "You can keep browsing. Closing this popup does not stop preparation." : "You can keep browsing. Closing this popup does not cancel the assessment."}</p> : null}
  </article>;
}

export function PaperUploadsProvider({ children }: { children: ReactNode }) {
  const ownerId = useUserPreferences()?.userId ?? null;
  const manager = useMemo(() => new PaperUploadManager(ownerId,
    (path, options) => researchRequest(path, options, ownerId ?? undefined),
    async (ticket, file) => {
      const { error } = await createClient().storage.from(ticket.bucket).uploadToSignedUrl(ticket.path, ticket.token, file, { contentType: "application/pdf", upsert: false });
      if (error) throw new Error("The PDF upload response could not be confirmed.");
    }), [ownerId]);
  const state = useSyncExternalStore(manager.subscribe, manager.getSnapshot, manager.getServerSnapshot);
  useEffect(() => {
    let storage: Storage | undefined;
    try { storage = window.localStorage; } catch { /* Server records still restore pending papers. */ }
    manager.start(storage);
    const online = () => { void manager.refresh(); };
    const saved = (event: StorageEvent) => { if (event.key === manager.storageKey) manager.syncPreferences(); };
    const leaving = (event: BeforeUnloadEvent) => { if (manager.hasTransfers()) { event.preventDefault(); event.returnValue = ""; } };
    window.addEventListener("online", online); window.addEventListener("storage", saved); window.addEventListener("beforeunload", leaving);
    return () => {
      manager.stop(); window.removeEventListener("online", online); window.removeEventListener("storage", saved); window.removeEventListener("beforeunload", leaving);
    };
  }, [manager]);
  const statusError = state.error && (state.uploads.some(u => u.phase === "preparing") || state.activity.length > 0);
  return <Context.Provider value={manager}>
    {children}
    {state.activity.length || state.notices.length || statusError ? <aside aria-label="Paper notifications" className="fixed right-4 bottom-4 left-4 z-40 max-h-[70dvh] space-y-3 overflow-y-auto overscroll-contain sm:left-auto sm:w-96" aria-live="polite" aria-relevant="additions text">
      {state.activity.map(activity => <AssessmentNotice key={`${activity.id}:${activity.phase}`} activity={activity} stale={Boolean(state.error || activity.statusError)} onDismiss={() => manager.dismissActivity(activity.id, activity.phase)} />)}
      {state.notices.map(notice => {
        const upload = state.uploads.find(u => u.id === notice.id);
        return <article key={`${notice.id}:${notice.kind}`} data-paper-notice={notice.id} className="space-y-3 rounded-xl border border-primary/40 bg-card p-4 text-card-foreground shadow-lg">
          <div className="flex items-start justify-between gap-3"><h2 className="text-sm font-semibold">{notice.kind === "ready" ? "Paper ready for review" : "Paper needs attention"}</h2><Button variant="ghost" size="icon-sm" className="shrink-0 text-foreground" aria-label={`Dismiss notification for ${notice.title}`} onClick={() => manager.dismiss(notice.id, notice.kind)}><X aria-hidden="true" /></Button></div>
          <p className="break-words text-sm font-medium">{notice.title}</p>
          <p className="text-sm text-muted-foreground">{notice.kind === "ready" ? "Review the title, research domain, central claims and testable findings before starting the assessment." : upload?.retryable ? upload.message : "An earlier upload or preparation attempt failed. Open the paper details for its current status."}</p>
          {upload?.retryable ? <Button size="sm" variant="outline" onClick={() => manager.retry(upload.id)}>Retry upload</Button> : <Link prefetch={false} href={`${NEW_ASSESSMENT_PATH}/${notice.id}`} onClick={() => { if (notice.kind === "ready") manager.dismiss(notice.id, notice.kind); }} className={buttonVariants({ size: "sm" })}>{notice.kind === "ready" ? "Review paper" : "View paper details"}</Link>}
        </article>;
      })}
      {statusError ? <div role="alert" className="space-y-2 rounded-xl border bg-card p-4 text-sm text-card-foreground"><p>Paper notifications are temporarily unavailable. Saved preparation work is retained.</p><Button size="sm" variant="outline" onClick={() => void manager.refresh()}>Retry status</Button></div> : null}
      {state.persistenceError ? <p className="rounded-lg border bg-card p-3 text-sm text-card-foreground">{state.persistenceError}</p> : null}
    </aside> : null}
  </Context.Provider>;
}

export function usePaperUploads() {
  const manager = useContext(Context);
  if (!manager) throw new Error("Paper uploads require the app's shared upload provider.");
  const state = useSyncExternalStore(manager.subscribe, manager.getSnapshot, manager.getServerSnapshot);
  return { ...state, enqueue: manager.enqueue, retry: manager.retry, refresh: manager.refresh, trackAssessment: manager.trackAssessment, signedIn: Boolean(manager.ownerId) };
}
