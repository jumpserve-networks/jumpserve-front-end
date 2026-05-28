const BENCHMARK_API_URL = process.env.NEXT_PUBLIC_BENCHMARK_API_URL || '';

export interface BenchmarkConfig {
  num_clients: number;
  client_delays_ms: number[];
  client_ccas: string[];
  client_file_sizes_mbytes: number[];
  client_start_delays_ms: number[];
  bottleneck_all_client_rate_mbit: number;
  bottleneck_buffer_kbytes: number;
  snapshot_metrics_source: string;
  script: string;
  loss_pct?: number;
  snapshot_interval_ms?: number;
}

export interface LaunchResponse {
  jobId: string;
  instanceId: string;
  status: string;
  error?: string;
}

export async function launchBenchmark(
  config: BenchmarkConfig,
  requestedBy?: string,
): Promise<LaunchResponse> {
  const res = await fetch(`${BENCHMARK_API_URL}/benchmarks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ config, requested_by: requestedBy }),
  });

  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.error || `Request failed with status ${res.status}`);
  }

  return data;
}

export async function cancelBenchmark(jobId: string): Promise<{ jobId: string; status: string }> {
  const res = await fetch(`${BENCHMARK_API_URL}/benchmarks/cancel`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jobId }),
  });

  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.error || `Request failed with status ${res.status}`);
  }

  return data;
}

export const AVAILABLE_CCAS = [
  'cubic',
  'bbr',
  'bbr2',
  'bbr3',
  'reno',
  'vegas',
  'htcp',
  'highspeed',
  'scalable',
  'westwood',
] as const;

export const AVAILABLE_SCRIPTS = [
  { value: 'netem_cubic_benchmark_hotnets.py', label: 'HotNets Benchmark' },
  { value: 'netem_cubic_benchmark_nines.py', label: 'Nines Benchmark' },
  { value: 'netem_nines.py', label: 'Netem Nines' },
] as const;

export function defaultConfig(): BenchmarkConfig {
  return {
    num_clients: 2,
    client_delays_ms: [10, 60],
    client_ccas: ['cubic', 'bbr'],
    client_file_sizes_mbytes: [10, 10],
    client_start_delays_ms: [0, 0],
    bottleneck_all_client_rate_mbit: 100,
    bottleneck_buffer_kbytes: 125,
    snapshot_metrics_source: 'kernel',
    script: 'netem_cubic_benchmark_hotnets.py',
  };
}
