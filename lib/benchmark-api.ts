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

async function benchmarkRequest(
  path: string,
  options: RequestInit,
): Promise<Record<string, unknown>> {
  const res = await fetch(`${getBenchmarkApiUrl()}${path}`, {
    ...options,
    headers: {
      Accept: 'application/json',
      ...(options.method === 'POST' ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers,
    },
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

function postBenchmarkRequest(path: string, body: object, accessToken: string) {
  if (!accessToken) throw new Error("Sign in to run or manage tests.");
  return benchmarkRequest(path, { headers: { Authorization: `Bearer ${accessToken}` }, method: 'POST', body: JSON.stringify(body) });
}

export interface BenchmarkLogEntry {
  timestamp: number;
  message: string;
}

export async function getBenchmarkLogs(jobId: string, signal?: AbortSignal): Promise<BenchmarkLogEntry[]> {
  const query = new URLSearchParams({ jobId });
  const data = await benchmarkRequest(`/benchmarks/logs?${query}`, {
    method: 'GET', cache: 'no-store', signal,
  });

  if (!Array.isArray(data.events) || !data.events.every((entry) =>
    isRecord(entry) && typeof entry.timestamp === 'number' &&
    Number.isFinite(entry.timestamp) && typeof entry.message === 'string'
  )) {
    throw new Error('The benchmark service returned invalid log entries. Please try again.');
  }

  return data.events as BenchmarkLogEntry[];
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
  topology?: 'parking-lot' | 'dumbbell';
  bottleneck_rates_mbit?: number[];
  bottleneck_buffers_kbytes?: number[];
  client_groups?: number[];
  loss_pct?: number;
  snapshot_interval_ms?: number;
  experiment_name?: string;
  tags?: string[];
  notes?: string;
}

export interface LaunchResponse {
  jobId: string;
  instanceId: string;
  status: string;
  error?: string;
}

export async function launchBenchmark(
  config: BenchmarkConfig,
  accessToken: string,
): Promise<LaunchResponse> {
  const validationError = validateMultiBottleneckConfig(config);
  if (validationError) throw new Error(validationError);
  const data = await postBenchmarkRequest('/benchmarks', {
    config,
  }, accessToken);

  if (
    typeof data.jobId !== 'string' || !data.jobId ||
    typeof data.instanceId !== 'string' || !data.instanceId ||
    typeof data.status !== 'string' || !data.status
  ) {
    throw new Error('The benchmark service returned an invalid launch response. Please contact the site administrator.');
  }

  return { jobId: data.jobId, instanceId: data.instanceId, status: data.status };
}

export async function cancelBenchmark(jobId: string, accessToken: string): Promise<{ jobId: string; status: string }> {
  const data = await postBenchmarkRequest('/benchmarks/cancel', { jobId }, accessToken);

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

export const AVAILABLE_TOPOLOGIES = [
  { value: 'parking-lot', label: 'Parking lot (experimental)' },
  { value: 'dumbbell', label: 'Dumbbell' },
] as const;

export function validateMultiBottleneckConfig(config: BenchmarkConfig): string | null {
  if (config.script !== 'netem_multi_bottleneck.py') return null;
  if (!AVAILABLE_TOPOLOGIES.some(({ value }) => value === config.topology)) {
    return 'Choose a topology for the multi-bottleneck benchmark.';
  }
  if (config.bottleneck_rates_mbit?.length !== 2 ||
      !config.bottleneck_rates_mbit.every((value) => Number.isFinite(value) && value >= 1 && value <= 10000)) {
    return 'Enter two bottleneck rates between 1 and 10,000 Mbit/s.';
  }
  if (config.bottleneck_buffers_kbytes?.length !== 2 ||
      !config.bottleneck_buffers_kbytes.every((value) => Number.isFinite(value) && value >= 0 && value <= 100000)) {
    return 'Enter two buffer sizes between 0 and 100,000 KB.';
  }
  if (config.topology === 'dumbbell' && (
    config.client_groups?.length !== 2 ||
    !config.client_groups.every((value) => Number.isInteger(value) && value > 0) ||
    config.client_groups.reduce((sum, value) => sum + value, 0) !== config.num_clients
  )) return 'Enter two positive client group sizes that add up to the number of clients.';
  return null;
}

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
