"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

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
  };
  ec2_instance_id: string | null;
  parent_run_id: number | null;
  error_message: string | null;
  requested_by: string | null;
}

const STATUS_STYLES: Record<string, string> = {
  pending:
    "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300",
  launching:
    "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300",
  running:
    "bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300",
  completed:
    "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300",
  failed:
    "bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300",
  terminated:
    "bg-orange-100 text-orange-700 dark:bg-orange-500/20 dark:text-orange-300",
};

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
  return `${config.num_clients} clients | ${ccas} | ${delays}ms | ${config.bottleneck_all_client_rate_mbit} Mbit`;
}

export function BenchmarkStatus() {
  const [supabase] = useState(() => createClient());
  const [jobs, setJobs] = useState<BenchmarkJob[]>([]);
  const [loading, setLoading] = useState(true);

  async function fetchJobs() {
    const { data } = await supabase
      .from("benchmark_jobs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(20);
    if (data) setJobs(data);
    setLoading(false);
  }

  useEffect(() => {
    fetchJobs();
    const interval = setInterval(fetchJobs, 10_000);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <p className="text-sm text-slate-500 dark:text-slate-400">
        Loading jobs...
      </p>
    );
  }

  if (jobs.length === 0) {
    return (
      <p className="text-sm text-slate-500 dark:text-slate-400">
        No benchmark jobs yet. Run one above!
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {jobs.map((job) => (
        <div
          key={job.id}
          className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800/50"
        >
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span
                  className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLES[job.status] || STATUS_STYLES.pending}`}
                >
                  {job.status}
                </span>
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  {formatTime(job.created_at)}
                </span>
              </div>
              <p className="mt-1 truncate text-sm text-slate-700 dark:text-slate-300">
                {configSummary(job.config)}
              </p>
              {job.error_message && (
                <p className="mt-1 text-xs text-red-600 dark:text-red-400">
                  {job.error_message}
                </p>
              )}
            </div>
            {job.status === "completed" && job.parent_run_id && (
              <Link
                href={`/parent-run/${job.parent_run_id}`}
                className="shrink-0 rounded-lg bg-rose-500 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-rose-600"
              >
                View Results
              </Link>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
