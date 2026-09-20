import type { SupabaseClient } from "@supabase/supabase-js";
import type { AggregateDelayGraphPoint } from "./emulated-runs-data";
import type { ResearchConfiguration } from "./research-comparison";

type Row = Record<string, unknown>;
function relation(value: unknown): Row {
  return (Array.isArray(value) ? value[0] : value) as Row ?? {};
}
function numeric(value: unknown): number | null {
  if (value === null || value === undefined || value === "" || typeof value === "boolean") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}
function cca(row: Row) {
  const name = relation(row.congestion_control_algorithms).name;
  return typeof name === "string" ? name.trim().toLowerCase() : null;
}

export async function loadAggregateResearchData(supabase: Pick<SupabaseClient, "from">): Promise<AggregateDelayGraphPoint[]> {
  const runs: Row[] = [];
  let after: number | null = null;
  // Keyset pagination also works when PostgREST caps a page below our limit.
  while (true) {
    let query = supabase.from("emulated_runs").select("id, emulated_parent_run_id, client_number, delay_added, client_start_delay_ms, flow_completion_time_ms, client_file_size_megabytes, congestion_control_algorithms(name), emulated_parent_runs(number_of_clients, queue_buffer_size_kilobyte, bottleneck_rate_megabit, snapshot_length_ms, topology, topology_config)").order("id", { ascending: true }).limit(1000);
    if (after !== null) query = query.gt("id", after);
    const { data, error } = await query;
    if (error) throw new Error(`Failed to load emulated_runs: ${error.message}`);
    if (!data?.length) break;
    const next = numeric(data.at(-1)?.id);
    if (next === null || (after !== null && next <= after) || runs.length + data.length > 100_000) throw new Error("Aggregate dataset could not be loaded completely; no partial comparison was produced.");
    runs.push(...data); after = next;
  }
  const parents = new Map<number, Row[]>();
  for (const row of runs) {
    const id = numeric(row.emulated_parent_run_id);
    if (id !== null) parents.set(id, [...(parents.get(id) ?? []), row]);
  }
  const jobs = new Map<number, Row[]>();
  const ids = [...parents.keys()];
  for (let i = 0; i < ids.length; i += 100) {
    let lastId: string | null = null;
    while (true) {
      let query = supabase.from("benchmark_jobs").select("id, parent_run_id, config").in("parent_run_id", ids.slice(i, i + 100)).order("id", { ascending: true }).limit(1000);
      if (lastId !== null) query = query.gt("id", lastId);
      const { data, error } = await query;
      if (error) throw new Error(`Failed to load experiment configurations: ${error.message}`);
      if (!data?.length) break;
      const next = String(data.at(-1)?.id ?? "");
      if (!next || (lastId !== null && next <= lastId)) throw new Error("Experiment configuration pagination did not advance.");
      for (const row of data) {
        const id = numeric(row.parent_run_id);
        if (id !== null) jobs.set(id, [...(jobs.get(id) ?? []), row]);
      }
      lastId = next;
    }
  }
  const points: AggregateDelayGraphPoint[] = [];
  for (const [parentRunId, rows] of parents) {
    const parent = relation(rows[0].emulated_parent_runs);
    const configs = jobs.get(parentRunId) ?? [];
    const rawConfig = configs.length === 1 ? configs[0].config : null;
    const jobConfig = rawConfig && typeof rawConfig === "object" && !Array.isArray(rawConfig) ? rawConfig as Row : null;
    const configuration: ResearchConfiguration = {
      numberOfClients: numeric(parent.number_of_clients), rateMbps: numeric(parent.bottleneck_rate_megabit),
      bufferKib: numeric(parent.queue_buffer_size_kilobyte), snapshotMs: numeric(parent.snapshot_length_ms),
      topology: typeof parent.topology === "string" ? parent.topology : null,
      topologyConfig: parent.topology_config ?? null, jobConfig,
      clients: rows.map(row => ({ clientNumber: numeric(row.client_number), delayMs: numeric(row.delay_added),
        startDelayMs: numeric(row.client_start_delay_ms), workloadMb: numeric(row.client_file_size_megabytes), cca: cca(row) })),
    };
    for (const row of rows) {
      const clientNumber = numeric(row.client_number), delayAddedMs = numeric(row.delay_added);
      if (clientNumber === null || delayAddedMs === null || configuration.numberOfClients === null) continue;
      const fct = numeric(row.flow_completion_time_ms);
      points.push({ parentRunId, clientNumber, delayAddedMs, numberOfClients: configuration.numberOfClients,
        clientStartDelayMs: numeric(row.client_start_delay_ms), flowCompletionTimeMs: fct !== null && fct > 0 ? fct : null,
        averageThroughputMbps: null, runCount: 1, congestionControlAlgorithmName: cca(row),
        clientFileSizeMegabytes: numeric(row.client_file_size_megabytes), queueBufferSizeKilobyte: configuration.bufferKib,
        bottleneckRateMegabit: configuration.rateMbps, configuration });
    }
  }
  return points.sort((a, b) => a.numberOfClients - b.numberOfClients || a.clientNumber - b.clientNumber || a.delayAddedMs - b.delayAddedMs || a.parentRunId - b.parentRunId);
}
