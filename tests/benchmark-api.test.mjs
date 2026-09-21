import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import {
  cancelBenchmark,
  defaultConfig,
  getBenchmarkLogs,
  launchBenchmark,
  validateMultiBottleneckConfig,
} from "../lib/benchmark-api.ts";

const originalApiUrl = process.env.NEXT_PUBLIC_BENCHMARK_API_URL;
const launched = { jobId: "job-123", instanceId: "i-123", status: "launching" };
const operations = [
  ["launch", () => launchBenchmark(defaultConfig(), "verified-session")],
  ["cancel", () => cancelBenchmark("job-123", "verified-session")],
  ["logs", () => getBenchmarkLogs("job-123")],
];

const multiConfig = {
  ...defaultConfig(), script: 'netem_multi_bottleneck.py', topology: 'dumbbell',
  bottleneck_rates_mbit: [100, 50], bottleneck_buffers_kbytes: [125, 64], client_groups: [1, 1],
};

test('multi-bottleneck sends topology, both link settings, and group sizes intact', async (t) => {
  const fetchMock = t.mock.method(globalThis, 'fetch', async () => Response.json(launched));
  for (const topology of ['parking-lot', 'dumbbell']) {
    const config = { ...multiConfig, topology };
    assert.deepEqual(await launchBenchmark(config, "verified-session"), launched);
    assert.deepEqual(JSON.parse(fetchMock.mock.calls.at(-1).arguments[1].body).config, config);
  }
});

test('incomplete saved multi-bottleneck configs and invalid pairs never launch an instance', async (t) => {
  const fetchMock = t.mock.method(globalThis, 'fetch', async () => { throw new Error('Must not launch'); });
  for (const invalid of [
    { topology: undefined }, { topology: 'unknown' }, { bottleneck_rates_mbit: [100] },
    { bottleneck_rates_mbit: [100, NaN] }, { bottleneck_rates_mbit: [0, 50] },
    { bottleneck_buffers_kbytes: [125, -1] }, { bottleneck_buffers_kbytes: [125, 125, 125] },
    { client_groups: [2, 1] }, { client_groups: [0, 2] }, { client_groups: [1.5, 0.5] },
  ]) {
    const config = { ...multiConfig, ...invalid };
    const error = validateMultiBottleneckConfig(config);
    assert.ok(error);
    await assert.rejects(() => launchBenchmark(config, "verified-session"), { message: error });
  }
  assert.equal(fetchMock.mock.callCount(), 0);
  assert.equal(validateMultiBottleneckConfig({ ...multiConfig, topology: 'parking-lot', client_groups: undefined }), null);
  assert.equal(validateMultiBottleneckConfig(defaultConfig()), null);
});

beforeEach(() => {
  process.env.NEXT_PUBLIC_BENCHMARK_API_URL = "https://benchmarks.example.test";
});

afterEach(() => {
  if (originalApiUrl === undefined) {
    delete process.env.NEXT_PUBLIC_BENCHMARK_API_URL;
  } else {
    process.env.NEXT_PUBLIC_BENCHMARK_API_URL = originalApiUrl;
  }
});

for (const [name, request] of operations) {
  test(`${name} never sends a request when the API URL is missing`, async (t) => {
    const fetchMock = t.mock.method(globalThis, "fetch", async () => {
      throw new Error("Fetch must not be called without configuration");
    });

    for (const value of [undefined, "", "   "]) {
      if (value === undefined) delete process.env.NEXT_PUBLIC_BENCHMARK_API_URL;
      else process.env.NEXT_PUBLIC_BENCHMARK_API_URL = value;
      await assert.rejects(request, /benchmark service is not configured/i);
    }

    assert.equal(fetchMock.mock.callCount(), 0);
  });

  test(`${name} reports HTML responses without exposing raw HTML`, async (t) => {
    let status = 502;
    t.mock.method(globalThis, "fetch", async () => new Response(
      "<!DOCTYPE html><html><body>Gateway error or login page</body></html>",
      { status, headers: { "Content-Type": "text/html" } },
    ));

    for (status of [502, 200]) {
      await assert.rejects(request, (error) => {
        assert.match(error.message, /benchmark service returned a non-JSON response/i);
        assert.match(error.message, new RegExp(`HTTP ${status}`));
        assert.doesNotMatch(error.message, /<!DOCTYPE|Unexpected token/);
        return true;
      });
    }
  });

  test(`${name} rejects malformed success responses`, async (t) => {
    let body;
    t.mock.method(globalThis, "fetch", async () => Response.json(body));

    for (body of [null, [], {}, { jobId: 123, status: "launching" }]) {
      await assert.rejects(request, /benchmark service returned (an )?invalid/i);
    }
  });
}

test("invalid or relative API URLs cannot fall back to the frontend", async (t) => {
  const fetchMock = t.mock.method(globalThis, "fetch", async () => {
    throw new Error("Fetch must not be called with an invalid API URL");
  });

  for (const value of ["/", "/benchmarks", "not-a-url", "ftp://example.test", "https://example.test?query=1", "https://example.test#fragment"]) {
    process.env.NEXT_PUBLIC_BENCHMARK_API_URL = value;
    await assert.rejects(() => launchBenchmark(defaultConfig(), "verified-session"), /service URL is invalid/);
  }

  assert.equal(fetchMock.mock.callCount(), 0);
});

test("logs use an encoded job ID, disable caching, and accept empty output during startup", async (t) => {
  const controller = new AbortController();
  const fetchMock = t.mock.method(globalThis, "fetch", async () => Response.json({ events: [], nextToken: null }));
  assert.deepEqual(await getBenchmarkLogs("job/123?other=value", controller.signal), []);
  const [url, options] = fetchMock.mock.calls[0].arguments;
  assert.equal(url, "https://benchmarks.example.test/benchmarks/logs?jobId=job%2F123%3Fother%3Dvalue");
  assert.equal(options.method, "GET");
  assert.equal(options.cache, "no-store");
  assert.equal(options.signal, controller.signal);
});

test("logs validate entries and preserve text for safe rendering", async (t) => {
  let events;
  t.mock.method(globalThis, "fetch", async () => Response.json({ events }));
  for (events of [[null], [{ timestamp: "today", message: "test" }], [{ timestamp: 123, message: {} }]]) {
    await assert.rejects(() => getBenchmarkLogs("job-123"), /invalid log entries/);
  }
  events = [{ timestamp: 123, message: "<script>text, not markup</script>" }];
  assert.deepEqual(await getBenchmarkLogs("job-123"), events);
});

test("launch uses the configured API path and accepts the Lambda's text/plain JSON", async (t) => {
  process.env.NEXT_PUBLIC_BENCHMARK_API_URL = " https://benchmarks.example.test/stage/// ";
  const config = defaultConfig();
  const fetchMock = t.mock.method(globalThis, "fetch", async () => new Response(
    JSON.stringify(launched),
    { headers: { "Content-Type": "text/plain; charset=utf-8" } },
  ));

  assert.deepEqual(await launchBenchmark(config, "verified-session"), launched);
  const [url, options] = fetchMock.mock.calls[0].arguments;
  assert.equal(url, "https://benchmarks.example.test/stage/benchmarks");
  assert.equal(options.method, "POST");
  assert.equal(options.headers["Content-Type"], "application/json");
  assert.equal(options.headers.Authorization, "Bearer verified-session");
  assert.deepEqual(JSON.parse(options.body), {
    config,
  });
});

test("cancellation posts the job ID to the cancellation endpoint", async (t) => {
  const cancelled = { jobId: "job-123", status: "cancelled" };
  const fetchMock = t.mock.method(globalThis, "fetch", async () => Response.json(cancelled));

  assert.deepEqual(await cancelBenchmark(cancelled.jobId, "verified-session"), cancelled);
  const [url, options] = fetchMock.mock.calls[0].arguments;
  assert.equal(url, "https://benchmarks.example.test/benchmarks/cancel");
  assert.equal(options.method, "POST");
  assert.deepEqual(JSON.parse(options.body), { jobId: cancelled.jobId });
});

test("API and gateway error messages are preserved", async (t) => {
  let body;
  t.mock.method(globalThis, "fetch", async () => Response.json(body, { status: 429 }));

  for (body of [{ error: "Maximum 5 concurrent benchmark jobs." }, { message: "Too many requests" }]) {
    await assert.rejects(() => launchBenchmark(defaultConfig(), "verified-session"), {
      message: body.error ?? body.message,
    });
  }
});

test("anonymous callers cannot launch or cancel, but can read logs", async (t) => {
  const fetchMock = t.mock.method(globalThis, "fetch", async () => Response.json({ events: [] }));
  await assert.rejects(() => launchBenchmark(defaultConfig(), ""), /Sign in/);
  await assert.rejects(() => cancelBenchmark("job-123", ""), /Sign in/);
  assert.equal(fetchMock.mock.callCount(), 0);
  await getBenchmarkLogs("job-123");
  assert.equal(fetchMock.mock.calls[0].arguments[1].headers.Authorization, undefined);
});
