"use client";

import { useEffect, useState } from "react";
import { Button } from "@/app/components/ui/button";
import { DialogContent, DialogDescription, DialogTitle } from "@/app/components/ui/dialog";
import { TRAINING_BATCH_STATUS_API_PATH } from "@/lib/test-modules";
import { trainingBatchActivityLabel, type TrainingBatchActivity } from "@/lib/training-batch-activity";

export function TrainingBatchActivityDialog({ batchId, paperId, filename, active }:
  { batchId: number; paperId: string; filename: string; active: boolean }) {
  const [activity, setActivity] = useState<TrainingBatchActivity>();
  const [error, setError] = useState("");
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const url = `${TRAINING_BATCH_STATUS_API_PATH}/${batchId}/activity?${new URLSearchParams({ paper: paperId })}`;
    async function poll() {
      try {
        const response = await fetch(url, { cache: "no-store", signal: controller.signal });
        if ([401, 403, 404].includes(response.status)) {
          if (!controller.signal.aborted) {
            setActivity(undefined);
            setError(response.status === 401 ? "Sign in again to view worker activity." : "Worker activity is unavailable.");
          }
          return;
        }
        if (!response.ok) throw new Error("Worker activity unavailable");
        const next: TrainingBatchActivity = await response.json();
        if (controller.signal.aborted) return;
        setActivity(next);
        setError("");
      } catch {
        if (controller.signal.aborted) return;
        setError("Could not refresh worker activity.");
      }
      if (active) timer = setTimeout(poll, 4_000);
    }
    void poll();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [batchId, paperId, active, refresh]);

  const hasEvents = activity && (activity.generator.length > 0 || activity.verifier.length > 0);
  return <DialogContent className="gap-4 sm:max-w-2xl">
    <div className="min-w-0 space-y-2 pr-8">
      <DialogTitle>Worker terminal activity</DialogTitle>
      <DialogDescription className="break-words">{filename}</DialogDescription>
    </div>
    {error ? <div role="alert" className="flex flex-wrap items-center gap-3">
      <p>{error}</p>
      <Button type="button" size="sm" variant="outline" onClick={() => setRefresh(value => value + 1)}>Refresh activity</Button>
    </div> : null}
    {hasEvents ? <div aria-label="Recent worker activity" tabIndex={0}
      className="content-panel max-h-[55vh] min-w-0 space-y-4 overflow-y-auto rounded-lg border bg-muted/30 p-3 text-xs">
      {(["verifier", "generator"] as const).map(role => activity[role].length ? <section key={role} className="space-y-2">
        <h3 className="font-semibold">{role === "generator" ? "Generator" : "Verifier"}</h3>
        <ul className="space-y-1.5 font-mono">
          {activity[role].slice().reverse().map((event, index) => <li key={`${event.at}-${event.kind}-${index}`} className="flex flex-wrap gap-x-2">
            <time dateTime={event.at} className="text-muted-foreground">{new Date(event.at).toLocaleTimeString()}</time>
            <span>{trainingBatchActivityLabel(event)}</span>
          </li>)}
        </ul>
      </section> : null)}
    </div> : error ? null : <p role="status" className="text-muted-foreground">
      {!activity ? "Loading worker activity…" : active ? "Waiting for worker activity…" : "No worker activity was recorded for this paper."}
    </p>}
  </DialogContent>;
}
