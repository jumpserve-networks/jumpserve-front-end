import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import {
  cancelBenchmark,
  defaultConfig,
  launchBenchmark,
} from "../lib/benchmark-api.ts";

const originalApiUrl = process.env.NEXT_PUBLIC_BENCHMARK_API_URL;
const launched = { jobId: "job-123", instanceId: "i-123", status: "launching" };
const operations = [
  ["launch", () => launchBenchmark(defaultConfig())],
  ["cancel", () => cancelBenchmark("job-123")],
];

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
      await assert.rejects(request, /benchmark service returned an invalid/i);
    }
  });
}

test("invalid or relative API URLs cannot fall back to the frontend", async (t) => {
  const fetchMock = t.mock.method(globalThis, "fetch", async () => {
    throw new Error("Fetch must not be called with an invalid API URL");
  });

  for (const value of ["/", "/benchmarks", "not-a-url", "ftp://example.test", "https://example.test?query=1", "https://example.test#fragment"]) {
    process.env.NEXT_PUBLIC_BENCHMARK_API_URL = value;
    await assert.rejects(() => launchBenchmark(defaultConfig()), /service URL is invalid/);
  }

  assert.equal(fetchMock.mock.callCount(), 0);
});

test("launch uses the configured API path and accepts the Lambda's text/plain JSON", async (t) => {
  process.env.NEXT_PUBLIC_BENCHMARK_API_URL = " https://benchmarks.example.test/stage/// ";
  const config = defaultConfig();
  const fetchMock = t.mock.method(globalThis, "fetch", async () => new Response(
    JSON.stringify(launched),
    { headers: { "Content-Type": "text/plain; charset=utf-8" } },
  ));

  assert.deepEqual(await launchBenchmark(config, "tester@example.test"), launched);
  const [url, options] = fetchMock.mock.calls[0].arguments;
  assert.equal(url, "https://benchmarks.example.test/stage/benchmarks");
  assert.equal(options.method, "POST");
  assert.equal(options.headers["Content-Type"], "application/json");
  assert.deepEqual(JSON.parse(options.body), {
    config,
    requested_by: "tester@example.test",
  });
});

test("cancellation posts the job ID to the cancellation endpoint", async (t) => {
  const cancelled = { jobId: "job-123", status: "cancelled" };
  const fetchMock = t.mock.method(globalThis, "fetch", async () => Response.json(cancelled));

  assert.deepEqual(await cancelBenchmark(cancelled.jobId), cancelled);
  const [url, options] = fetchMock.mock.calls[0].arguments;
  assert.equal(url, "https://benchmarks.example.test/benchmarks/cancel");
  assert.equal(options.method, "POST");
  assert.deepEqual(JSON.parse(options.body), { jobId: cancelled.jobId });
});

test("API and gateway error messages are preserved", async (t) => {
  let body;
  t.mock.method(globalThis, "fetch", async () => Response.json(body, { status: 429 }));

  for (body of [{ error: "Maximum 5 concurrent benchmark jobs." }, { message: "Too many requests" }]) {
    await assert.rejects(() => launchBenchmark(defaultConfig()), {
      message: body.error ?? body.message,
    });
  }
});
