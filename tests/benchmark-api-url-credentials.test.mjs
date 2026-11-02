import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import {
  cancelBenchmark,
  defaultConfig,
  getBenchmarkLogs,
  launchBenchmark,
} from "../lib/benchmark-api.ts";

const originalApiUrl = process.env.NEXT_PUBLIC_BENCHMARK_API_URL;
const operations = [
  ["launch", () => launchBenchmark(defaultConfig(), "verified-session")],
  ["cancel", () => cancelBenchmark("job-123", "verified-session")],
  ["logs", () => getBenchmarkLogs("job-123")],
];

afterEach(() => {
  if (originalApiUrl === undefined) {
    delete process.env.NEXT_PUBLIC_BENCHMARK_API_URL;
  } else {
    process.env.NEXT_PUBLIC_BENCHMARK_API_URL = originalApiUrl;
  }
});

test("credential-bearing API URLs are rejected before any request", async (t) => {
  const fetchMock = t.mock.method(globalThis, "fetch", async () => {
    throw new Error("Fetch must not be called with URL credentials");
  });

  for (const value of [
    "https://operator@example.test",
    "https://:fixture-pass@example.test",
    "https://operator:fixture-pass@example.test/stage",
    "https://operator%40example.test:fixture%3Apass@example.test",
  ]) {
    process.env.NEXT_PUBLIC_BENCHMARK_API_URL = value;
    for (const [, request] of operations) {
      await assert.rejects(request, (error) => {
        assert.equal(error.message,
          "The benchmark service URL is invalid. Please contact the site administrator.");
        return true;
      });
    }
  }

  assert.equal(fetchMock.mock.callCount(), 0);
});
