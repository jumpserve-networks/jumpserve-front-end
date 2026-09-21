"use client";

import { Check, Circle, CircleHelp, LoaderCircle, Minus, X } from "lucide-react";
import { Badge } from "@/app/components/ui/badge";
import { realWorldProgress, progressDuration, type ProgressState } from "@/lib/real-world-progress";
import type { RealWorldJob } from "@/lib/real-world";
import { cn } from "@/lib/utils";

const labels: Record<ProgressState, string> = {
  completed: "Completed", current: "In progress", upcoming: "Pending", failed: "Failed",
  cancelled: "Cancelled", skipped: "Not run", unknown: "History unavailable",
};
const icons = { completed: Check, current: LoaderCircle, upcoming: Circle, failed: X,
  cancelled: Minus, skipped: Minus, unknown: CircleHelp };

export function RealWorldStatusTimeline({ job }: { job: RealWorldJob }) {
  const steps = realWorldProgress(job);
  const next = steps.find(step => step.state === "upcoming");
  const date = new Intl.DateTimeFormat(undefined, {
    year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", second: "2-digit", timeZoneName: "short",
  });

  return <div className="space-y-3 border-t pt-4">
    <ol aria-label="Test progress" className="space-y-1">
      {steps.map((step, index) => {
        const Icon = icons[step.state];
        const current = step.state === "current";
        const finished = ["completed", "failed", "cancelled"].includes(step.state);
        return <li key={step.status} aria-current={current ? "step" : undefined} data-state={step.state}
          className="relative flex gap-3 pb-3 last:pb-0">
          {index < steps.length - 1 && <span aria-hidden="true" className="absolute bottom-0 left-3 top-7 border-l border-border" />}
          <span className={cn("relative flex size-6 shrink-0 items-center justify-center rounded-full border bg-card text-muted-foreground",
            current && "border-primary bg-primary text-primary-foreground",
            step.state === "completed" && "border-primary/40 text-primary",
            step.state === "failed" && "border-destructive/40 text-destructive")}>
            <Icon aria-hidden="true" className={cn("size-3.5", current && "animate-spin")} />
          </span>
          <div className="min-w-0 flex-1 space-y-1 pt-0.5">
            <div className="flex items-start justify-between gap-3">
              <p className={cn("min-w-0 text-sm", current ? "font-semibold" : "font-medium",
                ["upcoming", "skipped", "unknown"].includes(step.state) && "text-muted-foreground")}>{step.label}</p>
              <Badge className="shrink-0" variant={current ? "default" : "outline"}>{step === next ? "Up next" : labels[step.state]}</Badge>
            </div>
            {finished && <p className="text-xs text-muted-foreground">
              {step.completedAt ? <>{step.state === "completed" ? "Completed" : "Stopped"} <time dateTime={step.completedAt}>{date.format(new Date(step.completedAt))}</time>
                {step.durationSeconds !== null && index < steps.length - 1 && <> · {progressDuration(step.durationSeconds)}</>}</>
                : step.state === "completed" ? "Completion time not recorded" : "Stop time not recorded"}
            </p>}
            {current && step.startedAt && <p className="text-xs text-muted-foreground">Started <time dateTime={step.startedAt}>{date.format(new Date(step.startedAt))}</time></p>}
          </div>
        </li>;
      })}
    </ol>
    {steps.some(step => step.state === "unknown" || (["completed", "failed", "cancelled"].includes(step.state) && !step.completedAt)) &&
      <p className="text-xs text-muted-foreground">Some step history predates timing records. Missing completion times are not estimated.</p>}
  </div>;
}
