"use client";

import { AlertDialog, AlertDialogTrigger, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from "@/app/components/ui/alert-dialog";
import { Button } from "@/app/components/ui/button";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { PUBLIC_BENCHMARK_COLUMNS } from "@/lib/benchmark-progress";
import { requireAccessToken } from "@/lib/browser-auth";
import { cancelBenchmark } from "@/lib/benchmark-api";

interface BenchmarkJob {
  id: string;
  created_at: string;
  status: string;
  config: {
    num_clients: number;
    client_ccas: string[];
    client_delays_ms: number[];
    bottleneck_all_client_rate_mbit: number;
    script?: string;
    topology?: string;
    bottleneck_rates_mbit?: number[];
  };
  ec2_instance_id: string | null;
  parent_run_id: number | null;
  error_message: string | null;
  requested_by?: string | null;
}

const STATUS_STYLES: Record<string, string> = {
  pending:
    "bg-muted text-muted-foreground dark:bg-card",
  launching:
    "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300",
  installing:
    "bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-300",
  cloning:
    "bg-cyan-100 text-cyan-700 dark:bg-cyan-500/20 dark:text-cyan-300",
  running:
    "bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300",
  completed:
    "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300",
  failed:
    "bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300",
  terminated:
    "bg-orange-100 text-orange-700 dark:bg-orange-500/20 dark:text-orange-300",
  cancelled:
    "bg-muted text-muted-foreground dark:bg-card",
};

const PHASE_ORDER = [
  "pending",
  "launching",
  "installing",
  "cloning",
  "running",
  "completed",
];
const ACTIVE_STATUSES = new Set([
  "pending",
  "launching",
  "installing",
  "cloning",
  "running",
]);

function formatTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function configSummary(config: BenchmarkJob["config"]) {
  const ccas = [...new Set(config.client_ccas)].join("/");
  const delays = config.client_delays_ms.join(",");
  const rate = config.script === "netem_multi_bottleneck.py"
    ? `${config.topology ?? "Topology missing"} | ${config.bottleneck_rates_mbit?.join(" / ") ?? "Rates missing"}`
    : config.bottleneck_all_client_rate_mbit;
  return `${config.num_clients} clients | ${ccas} | ${delays}ms | ${rate} Mbit`;
}

function ProgressBar({ status }: { status: string }) {
  const currentIdx = PHASE_ORDER.indexOf(status);
  if (currentIdx < 0) return null;

  return (
    <div className="mt-2 flex items-center gap-1">
      {PHASE_ORDER.map((phase, idx) => {
        let color = "bg-slate-200 dark:bg-card";
        if (idx < currentIdx) color = "bg-emerald-400 dark:bg-emerald-500";
        else if (idx === currentIdx && ACTIVE_STATUSES.has(status))
          color = "bg-blue-400 dark:bg-blue-500 animate-pulse";
        else if (idx === currentIdx) color = "bg-emerald-400 dark:bg-emerald-500";

        return (
          <div key={phase} className="flex-1 flex flex-col items-center gap-0.5">
            <div className={`h-1.5 w-full rounded-full ${color}`} />
            <span className="text-[11px] text-muted-foreground">
              {phase === "completed" ? "done" : phase}
            </span>
          </div>
        );
      })}
    </div>
  );
}

interface LogEntry {
  timestamp: number;
  message: string;
}

function LogViewer({ jobId }: { jobId: string }) {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [expanded, setExpanded] = useState(false);

  const fetchLogs = useCallback(async () => {
    const apiUrl = process.env.NEXT_PUBLIC_BENCHMARK_API_URL;
    if (!apiUrl) return;
    try {
      const res = await fetch(
        `${apiUrl}/benchmarks/logs?jobId=${jobId}`,
      );
      if (res.ok) {
        const data = await res.json();
        return data.events as LogEntry[] | undefined;
      }
    } catch {
      // Logs may not be available yet
    }
  }, [jobId]);

  useEffect(() => {
    if (!expanded) return;
    let active = true;
    const refresh = () => void fetchLogs().then((events) => {
      if (active && events?.length) setLogs(events);
    });
    refresh();
    const interval = setInterval(refresh, 5_000);
    return () => { active = false; clearInterval(interval); };
  }, [expanded, fetchLogs]);

  return (
    <div className="mt-2">
      <Button
        variant="ghost"
        size="sm"
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="h-auto whitespace-normal text-xs font-medium text-muted-foreground hover:text-foreground"
      >
        {expanded ? "Hide logs" : "Show logs"}
      </Button>
      {expanded && (
        <div className="mt-1 max-h-60 overflow-y-auto rounded-md bg-slate-900 p-3 font-mono text-xs text-green-400">
          {logs.length === 0 ? (
            <span className="text-muted-foreground">
              Waiting for logs...
            </span>
          ) : (
            logs.map((entry, i) => (
              <div key={i} className="whitespace-pre-wrap break-all">
                {entry.message}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function LiveMetrics({ jobId }: { jobId: string }) {
  const [supabase] = useState(() => createClient());
  const [snapshotCount, setSnapshotCount] = useState(0);
  const [latestMetrics, setLatestMetrics] = useState<{
    megabits_per_second?: number;
    round_trip_time_ms?: number;
  } | null>(null);

  useEffect(() => {
    // Query current snapshot count
    async function fetchCount() {
      // Get the most recent emulated_runs that might belong to this job
      // by looking for runs created around the same time
      const { count } = await supabase
        .from("emulated_snapshot_stats")
        .select("*", { count: "exact", head: true });
      if (count !== null) setSnapshotCount(count);
    }
    fetchCount();

    // Subscribe to realtime inserts on snapshot stats
    const channel = supabase
      .channel(`benchmark-metrics-${jobId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "emulated_snapshot_stats",
        },
        (payload) => {
          setSnapshotCount((c) => c + 1);
          const row = payload.new;
          setLatestMetrics({
            megabits_per_second: parseFloat(String(row.megabits_per_second)),
            round_trip_time_ms: parseFloat(String(row.round_trip_time_ms)),
          });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [jobId, supabase]);

  if (!latestMetrics && snapshotCount === 0) return null;

  return (
    <div className="mt-2 flex items-center gap-4 text-xs">
      {latestMetrics?.megabits_per_second !== undefined && (
        <span className="text-blue-600 dark:text-blue-400">
          Throughput: {latestMetrics.megabits_per_second.toFixed(1)} Mbps
        </span>
      )}
      {latestMetrics?.round_trip_time_ms !== undefined && (
        <span className="text-amber-600 dark:text-amber-400">
          RTT: {latestMetrics.round_trip_time_ms.toFixed(1)} ms
        </span>
      )}
      <span className="text-muted-foreground">
        {snapshotCount} snapshots
      </span>
    </div>
  );
}

function CancelButton({
  jobId,
  onCancelled,
}: {
  jobId: string;
  onCancelled: () => void;
}) {
  const [cancelling, setCancelling] = useState(false);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCancel() {
    setCancelling(true);
    setError(null);
    try {
      await cancelBenchmark(jobId, await requireAccessToken());
      setOpen(false);
      onCancelled();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Unable to cancel this benchmark.");
    } finally {
      setCancelling(false);
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={(nextOpen) => { if (!cancelling) { setOpen(nextOpen); setError(null); } }}>
      <AlertDialogTrigger render={<Button variant="outline" size="sm" className="text-destructive" />}>
        Cancel
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Cancel this benchmark?</AlertDialogTitle>
          <AlertDialogDescription>The EC2 instance will be terminated.</AlertDialogDescription>
        </AlertDialogHeader>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={cancelling}>Keep running</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={handleCancel} disabled={cancelling}>
            {cancelling ? "Cancelling..." : "Cancel benchmark"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function BenchmarkStatus({ canManage = false }: { canManage?: boolean }) {
  const [supabase] = useState(() => createClient());
  const [jobs, setJobs] = useState<BenchmarkJob[]>([]);
  const [loading, setLoading] = useState(true);

  const loadJobs = useCallback(async () => {
    const { data } = await supabase
      .from("benchmark_jobs")
      .select(PUBLIC_BENCHMARK_COLUMNS)
      .order("created_at", { ascending: false })
      .limit(20);
    return data as BenchmarkJob[] | null;
  }, [supabase]);

  function fetchJobs() {
    void loadJobs().then((data) => { if (data) setJobs(data); });
  }

  useEffect(() => {
    let active = true;
    const refresh = () => void loadJobs().then((data) => {
      if (!active) return;
      if (data) setJobs(data);
      setLoading(false);
    });
    refresh();
    const interval = setInterval(refresh, 5_000);
    return () => { active = false; clearInterval(interval); };
  }, [loadJobs]);

  if (loading) {
    return (
      <p className="text-sm text-muted-foreground">
        Loading jobs...
      </p>
    );
  }

  if (jobs.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No benchmark jobs yet. Run one above!
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {jobs.map((job) => {
        const isActive = ACTIVE_STATUSES.has(job.status);

        return (
          <div
            key={job.id}
            className="rounded-lg border border-border bg-card p-4"
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span
                    className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLES[job.status] || STATUS_STYLES.pending}`}
                  >
                    {job.status}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {formatTime(job.created_at)}
                  </span>
                </div>
                <p className="mt-1 truncate text-sm text-foreground dark:text-muted-foreground">
                  {configSummary(job.config)}
                </p>
                {job.error_message && (
                  <p className="mt-1 text-xs text-red-600 dark:text-red-400">
                    {job.error_message}
                  </p>
                )}
              </div>
              <div className="flex shrink-0 flex-wrap gap-2">
                <Link
                  href={`/benchmarks/${encodeURIComponent(job.id)}`}
                  className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted dark:hover:bg-accent"
                >
                  View progress
                </Link>
                {isActive && canManage && (
                  <CancelButton jobId={job.id} onCancelled={fetchJobs} />
                )}
                {job.status === "completed" && job.parent_run_id && (
                  <Link
                    href={`/parent-run/${job.parent_run_id}`}
                    className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition hover:bg-primary/90"
                  >
                    View Results
                  </Link>
                )}
              </div>
            </div>

            {/* Progress bar for active jobs */}
            {(isActive || job.status === "completed") && (
              <ProgressBar status={job.status} />
            )}

            {/* Live metrics for running jobs */}
            {job.status === "running" && <LiveMetrics jobId={job.id} />}

            {/* Log viewer for active and recently completed jobs */}
            {(isActive || job.status === "completed" || job.status === "failed") && (
              <LogViewer jobId={job.id} />
            )}
          </div>
        );
      })}
    </div>
  );
}
