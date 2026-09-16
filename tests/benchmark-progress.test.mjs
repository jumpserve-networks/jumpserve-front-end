import assert from "node:assert/strict";
import { test } from "node:test";
import { benchmarkSteps, benchmarkStatusMessage, isBenchmarkTerminal } from "../lib/benchmark-progress.ts";

const states = (status, error_message = null) => benchmarkSteps({ status, error_message }).map((step) => step.state);

test("active phases follow reported progress and allow prebuilt images to skip cloning", () => {
  assert.deepEqual(states("pending"), ["complete", "current", "waiting", "waiting", "waiting"]);
  assert.deepEqual(states("launching"), states("pending"));
  assert.deepEqual(states("installing"), ["complete", "complete", "current", "waiting", "waiting"]);
  assert.deepEqual(states("cloning"), states("installing"));
  assert.deepEqual(states("running"), ["complete", "complete", "complete", "current", "waiting"]);
  assert.deepEqual(states("completed"), Array(5).fill("complete"));
});

test("failures identify the reported phase without claiming later steps finished", () => {
  assert.deepEqual(states("failed", "Benchmark failed during installing (exit 1)"),
    ["complete", "complete", "failed", "waiting", "waiting"]);
  assert.deepEqual(states("failed", "Benchmark failed during running (exit 1)"),
    ["complete", "complete", "complete", "failed", "waiting"]);
  assert.deepEqual(states("failed", "Benchmark failed during bootstrapping (exit 1)"),
    ["complete", "failed", "waiting", "waiting", "waiting"]);
});

test("cancellations and failures with no phase do not invent completed steps", () => {
  for (const status of ["cancelled", "terminated", "failed", "new-backend-status", "constructor"]) {
    assert.deepEqual(states(status), ["complete", "unconfirmed", "unconfirmed", "unconfirmed", "unconfirmed"]);
  }
});

test("only known terminal statuses stop status polling", () => {
  for (const status of ["completed", "failed", "cancelled", "terminated"]) assert.equal(isBenchmarkTerminal(status), true);
  for (const status of ["pending", "launching", "installing", "cloning", "running", "new-backend-status"]) assert.equal(isBenchmarkTerminal(status), false);
});

test("completion distinguishes linked results from missing results", () => {
  assert.match(benchmarkStatusMessage({ status: "completed", parent_run_id: 42 }), /results are ready/);
  assert.match(benchmarkStatusMessage({ status: "completed", parent_run_id: null }), /No results were linked/);
  assert.match(benchmarkStatusMessage({ status: "cancelled", parent_run_id: null }), /termination was requested/);
});
