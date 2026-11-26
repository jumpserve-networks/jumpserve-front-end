import { useEffect, useState, type RefObject } from "react";
import { Button } from "@/app/components/ui/button";
import { DialogContent, DialogDescription, DialogTitle } from "@/app/components/ui/dialog";
import { TRAINING_BATCH_STATUS_API_PATH } from "@/lib/test-modules";
import { trainingBatchStepLabels, type TrainingBatchPaper, type TrainingBatchStep } from "@/lib/training-batch";
import { trainingBatchActivityLabel, type TrainingBatchActivity } from "@/lib/training-batch-activity";
import { TrainingBatchTerminal } from "./training-batch-terminal";

export function TrainingBatchActivityDialog({ batchId, paperId, filename, active, activityAvailable, finalFocus, step }: {
  batchId: number;
  paperId: string;
  filename: string;
  active: boolean;
  activityAvailable: boolean;
  finalFocus: RefObject<HTMLButtonElement | null>;
  step: { role: TrainingBatchStep; status: string; elapsed: string; version: number | null; score: TrainingBatchPaper["score"] };
}) {
  const [activity, setActivity] = useState<TrainingBatchActivity>();
  const [error, setError] = useState("");
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    if (!activityAvailable) return;
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
  }, [batchId, paperId, active, activityAvailable, refresh]);

  const events = activity?.[step.role] ?? [];
  return <DialogContent finalFocus={finalFocus} className="max-h-[90dvh] gap-4 overflow-y-auto sm:max-w-2xl">
    <div className="min-w-0 space-y-2 pr-8">
      <DialogTitle>{trainingBatchStepLabels[step.role]} details</DialogTitle>
      <DialogDescription className="break-words">{filename}</DialogDescription>
    </div>
    <dl className="flex flex-wrap gap-x-6 gap-y-2">
      <div><dt className="text-muted-foreground">Status</dt><dd>{step.status}</dd></div>
      {step.version !== null ? <div><dt className="text-muted-foreground">Skill version</dt><dd>v{step.version}</dd></div> : null}
      {step.elapsed ? <div><dt className="text-muted-foreground">Duration</dt><dd>{step.elapsed}</dd></div> : null}
      {step.score ? <div><dt className="text-muted-foreground">Verifier score</dt><dd>{step.score.earned} / {step.score.maximum}</dd></div> : null}
    </dl>
    <TrainingBatchTerminal batchId={batchId} paperId={paperId} active={activityAvailable && active} role={step.role} />
    {error ? <div role="alert" className="flex flex-wrap items-center gap-3">
      <p>{error}</p>
      <Button type="button" size="sm" variant="outline" onClick={() => setRefresh(value => value + 1)}>Refresh activity</Button>
    </div> : null}
    {events.length ? <section aria-label="Recent worker activity" tabIndex={0}
      className="content-panel max-h-[55vh] min-w-0 space-y-2 overflow-y-auto rounded-lg border bg-muted/30 p-3 text-xs">
      <h3 className="font-semibold">Worker activity</h3>
      <ul className="space-y-1.5 font-mono">
        {events.slice().reverse().map((event, index) => <li key={`${event.at}-${event.kind}-${index}`} className="flex flex-wrap gap-x-2">
          <time dateTime={event.at} className="text-muted-foreground">{new Date(event.at).toLocaleTimeString()}</time>
          <span>{trainingBatchActivityLabel(event)}</span>
        </li>)}
      </ul>
    </section> : error ? null : <p role="status" className="text-muted-foreground">
      {!activityAvailable ? "Worker activity is unavailable for this batch."
        : !activity ? "Loading worker activity…"
        : active ? "Waiting for worker activity…"
        : "No worker activity was recorded for this step."}
    </p>}
  </DialogContent>;
}
