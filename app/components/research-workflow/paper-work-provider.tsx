"use client";
import Link from "next/link";
import { createContext, useContext, useSyncExternalStore, type ReactNode } from "react";
import { CheckCircle2, CircleAlert, LoaderCircle, X } from "lucide-react";
import { Button, buttonVariants } from "@/app/components/ui/button";
import type { PaperWorkManager } from "@/lib/paper-work-manager";
import { workPath, workPending, type PaperWorkActivity } from "@/lib/paper-work-status";
const Context = createContext<PaperWorkManager | null>(null);
export function PaperWorkScope({ manager, children }: { manager: PaperWorkManager; children: ReactNode }) { return <Context.Provider value={manager}>{children}</Context.Provider>; }
export function usePaperWork() { const manager = useContext(Context); if (!manager) throw new Error("Paper work requires the app's shared provider."); return manager; }
export function paperWorkHeading(item: PaperWorkActivity) {
  const label = item.step === 3 ? "Experiment steps" : "Shared setup and run commands";
  if (workPending(item.stage)) return item.step === 3 ? "Generating experiment steps…" : "Generating shared setup and run commands…";
  return `${label} ${item.stage === "ready" ? "ready" : item.stage === "cancelled" ? "cancelled" : "need attention"}`;
}
export function PaperWorkNotices() {
  const manager = usePaperWork(), state = useSyncExternalStore(manager.subscribe, manager.getSnapshot, manager.getServerSnapshot);
  return <>
    {state.activity.map(item => {
      const pending = workPending(item.stage) && !state.error && !item.status_error;
      const Icon = pending ? LoaderCircle : item.stage === "ready" ? CheckCircle2 : CircleAlert;
      return <article key={`${item.id}:${item.step}`} data-paper-work-notice={`${item.id}:${item.step}`} aria-atomic="true" className="space-y-3 bg-card p-4 text-card-foreground shadow-lg">
        <div className="flex items-start justify-between gap-3"><div className="flex items-start gap-2"><Icon aria-hidden="true" className={`mt-0.5 size-4 shrink-0 text-primary${pending ? " animate-spin" : ""}`} /><h2 className="text-sm font-semibold">{paperWorkHeading(item)}</h2></div><Button size="icon-sm" variant="ghost" aria-label={`Dismiss Step ${item.step} notification for ${item.title}`} onClick={() => manager.dismiss(item)}><X aria-hidden="true" /></Button></div>
        <p className="break-words text-sm font-medium">{item.title}</p>
        {item.step === 4 ? <p className="text-sm text-muted-foreground">{item.ready} of {item.total} experiment command packages ready.{item.needs_attention ? ` ${item.needs_attention} need attention.` : ""}</p> : null}
        {item.reason ? <p className="text-sm text-muted-foreground">{item.reason}</p> : null}
        {item.status_error ? <p className="text-sm text-warning">{item.status_error}</p> : null}
        {pending ? <><div role="progressbar" aria-label={`Step ${item.step} generation in progress`} className="h-1 overflow-hidden bg-primary/20"><div className="h-full w-full animate-pulse bg-primary/60" /></div><p className="text-xs text-muted-foreground">Generation continues in the background.</p></> : null}
        <Link prefetch={false} href={workPath(item)} onClick={() => manager.dismiss(item)} className={buttonVariants({ size: "sm" })}>View Step {item.step}</Link>
      </article>;
    })}
    {state.error && state.activity.length ? <div role="alert" className="space-y-2 bg-card p-4 text-sm"><p>{state.error}</p><p>The last recorded progress is retained. JumpServe will retry automatically.</p><Button size="sm" variant="outline" onClick={() => void manager.refresh()}>Retry background status</Button></div> : null}
    {state.persistenceError ? <p className="bg-card p-3 text-sm">{state.persistenceError}</p> : null}
  </>;
}
