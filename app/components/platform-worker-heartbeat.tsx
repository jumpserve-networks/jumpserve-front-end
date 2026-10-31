"use client";

import { useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, Clock3 } from "lucide-react";
import { Badge } from "@/app/components/ui/badge";
import { workerHeartbeat } from "@/lib/platform-worker-heartbeat";
import { cn } from "@/lib/utils";

export function WorkerHeartbeatStatus({ seenAt, now }: { seenAt: string | null | undefined; now: number | null }) {
  const heartbeat = workerHeartbeat(seenAt, now);
  const Icon = heartbeat.state === "fresh" ? CheckCircle2 : heartbeat.state === "delayed" ? Clock3 : AlertCircle;
  return <>
    <div className="mt-2 space-y-1" role="status" aria-atomic="true">
      <Badge variant="outline" className={cn("gap-1.5", heartbeat.state === "fresh" && "border-emerald-600/30 text-emerald-700 dark:text-lime-300", heartbeat.state === "delayed" && "border-amber-500/40 text-amber-800 dark:text-amber-300", heartbeat.state === "unknown" && "text-muted-foreground")}>
        <Icon className="size-3" aria-hidden="true" />{heartbeat.label}
      </Badge>
      <p className="text-xs text-muted-foreground">{heartbeat.detail}</p>
    </div>
    {heartbeat.ageSeconds !== null && <p className="mt-1 text-xs text-muted-foreground">Age: {heartbeat.ageSeconds} seconds · browser clock</p>}
    <p className="mt-1 break-all text-xs text-muted-foreground">Recorded: <span className="font-mono">{typeof seenAt === "string" && seenAt !== "" ? seenAt : "Not recorded"}</span></p>
  </>;
}

export function WorkerHeartbeat({ seenAt }: { seenAt: string | null | undefined }) {
  // Keep server and first client render identical. The clock ages independently
  // of network refreshes, so a failed poll cannot leave a heartbeat fresh forever.
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const initial = window.setTimeout(tick, 0);
    const timer = window.setInterval(tick, 1000);
    return () => { window.clearTimeout(initial); window.clearInterval(timer); };
  }, []);
  return <WorkerHeartbeatStatus seenAt={seenAt} now={now} />;
}
