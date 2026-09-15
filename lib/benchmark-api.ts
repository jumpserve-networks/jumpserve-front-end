function getBenchmarkApiUrl(): string {
  const value = process.env.NEXT_PUBLIC_BENCHMARK_API_URL?.trim();

  if (!value) {
    throw new Error('The benchmark service is not configured. Please contact the site administrator.');
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('The benchmark service URL is invalid. Please contact the site administrator.');
  }

  if (!['http:', 'https:'].includes(url.protocol) || url.search || url.hash) {
    throw new Error('The benchmark service URL is invalid. Please contact the site administrator.');
  }

  return url.toString().replace(/\/+$/, '');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function postBenchmarkRequest(
  path: string,
  body: object,
): Promise<Record<string, unknown>> {
  const res = await fetch(`${getBenchmarkApiUrl()}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
  });

  let data: unknown;
  try {
    data = await res.json();
  } catch {
    throw new Error(`The benchmark service returned a non-JSON response (HTTP ${res.status}). Please try again or contact the site administrator.`);
  }

  if (!res.ok) {
    const message = isRecord(data) ? data.error || data.message : null;
    throw new Error(
      typeof message === 'string' && message.trim()
        ? message
        : `Benchmark request failed with status ${res.status}`,
    );
  }

  if (!isRecord(data)) {
    throw new Error('The benchmark service returned an invalid response. Please contact the site administrator.');
  }

  return data;
}

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
  const data = await postBenchmarkRequest('/benchmarks', {
    config,
    requested_by: requestedBy,
  });

  if (
    typeof data.jobId !== 'string' || !data.jobId ||
    typeof data.instanceId !== 'string' || !data.instanceId ||
    typeof data.status !== 'string' || !data.status
  ) {
    throw new Error('The benchmark service returned an invalid launch response. Please contact the site administrator.');
  }

  return { jobId: data.jobId, instanceId: data.instanceId, status: data.status };
}

export async function cancelBenchmark(jobId: string): Promise<{ jobId: string; status: string }> {
  const data = await postBenchmarkRequest('/benchmarks/cancel', { jobId });

  if (
    typeof data.jobId !== 'string' || !data.jobId ||
    typeof data.status !== 'string' || !data.status
  ) {
    throw new Error('The benchmark service returned an invalid cancellation response. Please contact the site administrator.');
  }

  return { jobId: data.jobId, status: data.status };
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
  { value: 'netem_multi_bottleneck.py', label: 'Multi-Bottleneck (parking-lot / dumbbell)' },
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
