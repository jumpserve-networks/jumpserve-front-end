"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Check, CircleAlert, LoaderCircle } from "lucide-react";
import { Button } from "@/app/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/app/components/ui/card";
import { createClient } from "@/lib/supabase/client";
import { cancelBenchmark, getBenchmarkLogs, type BenchmarkLogEntry } from "@/lib/benchmark-api";
import { benchmarkSteps, benchmarkStatusMessage, isBenchmarkTerminal, type BenchmarkJob } from "@/lib/benchmark-progress";
import { cn } from "@/lib/utils";

function BenchmarkLogs({ jobId, terminal }: { jobId: string; terminal: boolean }) {
  const [logs, setLogs] = useState<BenchmarkLogEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    let remainingFinalReads = 6;

    async function refresh() {
      try {
        const events = await getBenchmarkLogs(jobId, controller.signal);
        if (controller.signal.aborted) return;
        setLogs(events);
        setError(null);
      } catch (err) {
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : "Unable to load benchmark logs.");
      }
      setLoading(false);
      // CloudWatch can deliver the final output after the job is marked done.
      // Allow 30 seconds for it to arrive, then stop polling terminal jobs.
      if (!terminal || remainingFinalReads-- > 0) {
        timer = setTimeout(refresh, 5_000);
      }
    }

    void refresh();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [jobId, terminal, retry]);

  return (
    <Card>
      <CardHeader>
        <CardTitle><h2>Run logs</h2></CardTitle>
        <p className="text-sm text-muted-foreground">
          Latest 200 entries. Logs can take a little time to arrive after the instance starts.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <pre tabIndex={0} aria-label="Benchmark log output" aria-busy={loading}
          className="max-h-96 overflow-auto rounded-lg bg-slate-950 p-4 text-xs leading-5 whitespace-pre-wrap break-all text-slate-200 focus-visible:outline-2 focus-visible:outline-ring">
          {logs.length > 0
            ? logs.map((entry) => entry.message).join("\n")
            : loading ? "Loading logs…" : terminal ? "No log entries are available for this run." : "Waiting for the instance to send its first logs…"}
        </pre>
        {(error || terminal) && <Button variant="outline" size="sm" onClick={() => setRetry((value) => value + 1)}>Refresh logs</Button>}
      </CardContent>
    </Card>
  );
}

const STEP_LABELS = {
  complete: "Complete", current: "In progress", waiting: "Waiting",
  failed: "Failed", unconfirmed: "Unconfirmed",
};

export function BenchmarkRunStatus({ initialJob }: { initialJob: BenchmarkJob }) {
  const [supabase] = useState(() => createClient());
  const [job, setJob] = useState(initialJob);
  const [pollError, setPollError] = useState<string | null>(null);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const terminal = isBenchmarkTerminal(job.status);

  useEffect(() => {
    if (terminal) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;

    async function refresh() {
      try {
        const { data, error } = await supabase.from("benchmark_jobs")
          .select("*").eq("id", initialJob.id).abortSignal(controller.signal).maybeSingle();
        if (controller.signal.aborted) return;
        if (error) throw new Error(error.message);
        if (!data) throw new Error("This benchmark is no longer available to your account.");
        // A response started before cancellation must not restore an active state.
        setJob((current) => isBenchmarkTerminal(current.status) ? current : data as BenchmarkJob);
        setPollError(null);
        if (isBenchmarkTerminal(data.status)) return;
      } catch (err) {
        if (controller.signal.aborted) return;
        setPollError(err instanceof Error ? err.message : "Unable to refresh this benchmark.");
      }
      timer = setTimeout(refresh, 5_000);
    }

    timer = setTimeout(refresh, 5_000);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [supabase, initialJob.id, terminal]);

  async function handleCancel() {
    setCancelling(true);
    setCancelError(null);
    try {
      const result = await cancelBenchmark(job.id);
      setJob((current) => ({ ...current, status: result.status }));
      setPollError(null);
      setConfirmCancel(false);
    } catch (err) {
      setCancelError(err instanceof Error ? err.message : "Unable to cancel this benchmark.");
    } finally {
      setCancelling(false);
    }
  }

  const steps = benchmarkSteps(job);
  const successful = job.status === "completed";
  const failed = job.status === "failed";

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="gap-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle><h2>{job.config.experiment_name || "Run progress"}</h2></CardTitle>
            <span className={cn("rounded-full px-3 py-1 text-xs font-medium capitalize",
              successful ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300"
                : failed ? "bg-red-100 text-red-800 dark:bg-red-500/20 dark:text-red-300"
                : "bg-secondary text-secondary-foreground")}>{job.status}</span>
          </div>
          <p role="status" aria-live="polite" className="text-sm text-muted-foreground">{benchmarkStatusMessage(job)}</p>
          {pollError && <p role="alert" className="text-sm text-destructive">Status updates interrupted: {pollError} Retrying automatically; the last known status is shown.</p>}
          {job.error_message && <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm break-words text-destructive">{job.error_message}</p>}
        </CardHeader>
        <CardContent className="space-y-6">
          <ol aria-label="Benchmark steps" className="space-y-5">
            {steps.map((step, index) => (
              <li key={step.title} aria-current={step.state === "current" ? "step" : undefined} className="flex gap-3">
                <span aria-hidden="true" className={cn("flex size-8 shrink-0 items-center justify-center rounded-full border text-xs font-semibold",
                  step.state === "complete" && "border-emerald-600 bg-emerald-600 text-white dark:border-emerald-500 dark:bg-emerald-500 dark:text-slate-950",
                  step.state === "current" && "border-primary bg-primary/10 text-primary",
                  step.state === "failed" && "border-destructive text-destructive",
                  (step.state === "waiting" || step.state === "unconfirmed") && "text-muted-foreground") }>
                  {step.state === "complete" ? <Check className="size-4" />
                    : step.state === "current" ? <LoaderCircle className="size-4 motion-safe:animate-spin" />
                    : step.state === "failed" ? <CircleAlert className="size-4" /> : index + 1}
                </span>
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <h3 className="text-sm font-semibold">{step.title}</h3>
                    <span className="text-xs text-muted-foreground">{STEP_LABELS[step.state]}</span>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {step.state === "unconfirmed" ? "This run did not report whether it reached this step."
                      : index === 4 && successful && job.parent_run_id == null ? "No results link was reported. Review the run logs for details."
                      : step.description}
                  </p>
                </div>
              </li>
            ))}
          </ol>

          <p className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">
            The instance is configured to shut down and terminate automatically after the benchmark exits. This page shows benchmark progress; it does not confirm EC2 termination.
          </p>

          <div className="flex flex-wrap items-center gap-3">
            {successful && job.parent_run_id != null && <Button nativeButton={false} render={<Link href={`/parent-run/${job.parent_run_id}`} />}>View results</Button>}
            {terminal && <Button variant="outline" nativeButton={false} render={<Link href="/benchmarks" />}>Configure another benchmark</Button>}
            {!terminal && !confirmCancel && <Button variant="outline" onClick={() => setConfirmCancel(true)}>Cancel benchmark</Button>}
            {!terminal && <span className="text-xs text-muted-foreground">Updates every 5 seconds. You can leave and return to this URL.</span>}
          </div>
          {!terminal && confirmCancel && (
            <div className="space-y-3 rounded-lg border p-4">
              <p className="text-sm">Cancel this benchmark and terminate its EC2 instance?</p>
              <div className="flex flex-wrap gap-2">
                <Button variant="destructive" disabled={cancelling} onClick={handleCancel}>{cancelling ? "Cancelling…" : "Confirm cancellation"}</Button>
                <Button variant="outline" disabled={cancelling} onClick={() => setConfirmCancel(false)}>Keep running</Button>
              </div>
            </div>
          )}
          {cancelError && <p role="alert" className="text-sm text-destructive">{cancelError}</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle><h2>Run details</h2></CardTitle></CardHeader>
        <CardContent>
          <dl className="grid gap-4 text-sm sm:grid-cols-2">
            {[
              ["Run ID", job.id], ["EC2 instance", job.ec2_instance_id || "Awaiting instance assignment"],
              ["Requested at", new Date(job.created_at).toUTCString()],
              ["Requested by", job.requested_by || "Not recorded"],
              ["Clients", `${job.config.num_clients} (${job.config.client_ccas.join(", ")})`],
              ["Client delays", `${job.config.client_delays_ms.join(", ")} ms`],
              ["Bottleneck rate", `${job.config.bottleneck_all_client_rate_mbit} Mbit/s`],
              ["Benchmark script", job.config.script || "Default script"],
            ].map(([label, value]) => <div key={label}><dt className="text-muted-foreground">{label}</dt><dd className="mt-1 break-words font-medium">{value}</dd></div>)}
          </dl>
        </CardContent>
      </Card>
      <BenchmarkLogs jobId={job.id} terminal={terminal} />
    </div>
  );
}
