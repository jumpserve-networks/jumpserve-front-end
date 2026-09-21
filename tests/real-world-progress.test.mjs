import assert from "node:assert/strict";
import { test } from "node:test";
import { realWorldProgress, progressDuration, REAL_WORLD_STEPS } from "../lib/real-world-progress.ts";

const time = seconds => new Date(Date.UTC(2026, 8, 20, 12, 0, seconds)).toISOString();
const entry = (index, outcome = "completed") => ({ id: index + 1, status: REAL_WORLD_STEPS[index].status,
  started_at: time(index * 30), completed_at: outcome ? time((index + 1) * 30) : null, outcome });

test("active timeline retains completed times and identifies current and future steps", () => {
  const job = { status: "configuring", status_history: [entry(0), entry(1), entry(2, null)] };
  const steps = realWorldProgress(job);
  assert.deepEqual(steps.map(s => s.state), ["completed", "completed", "current", "upcoming", "upcoming", "upcoming", "upcoming", "upcoming"]);
  assert.equal(steps[0].completedAt, time(30));
  assert.equal(steps[0].durationSeconds, 30);
  assert.equal(steps[2].startedAt, time(60));
  assert.equal(steps[2].completedAt, null);
  assert.deepEqual(realWorldProgress(JSON.parse(JSON.stringify(job))), steps, "refresh preserves durable timings");
});

test("completed test shows all stages complete with recorded timestamps", () => {
  const history = REAL_WORLD_STEPS.map((_, i) => entry(i));
  history.push({ id: 8, status: "completed", started_at: time(210), completed_at: time(210), outcome: "completed" });
  const steps = realWorldProgress({ status: "completed", status_history: history.reverse() });
  assert.ok(steps.every(s => s.state === "completed" && s.completedAt));
  assert.equal(steps.at(-1).completedAt, time(210));
});

test("failure and cancellation distinguish interrupted work, skipped stages, and successful cleanup", () => {
  for (const outcome of ["failed", "cancelled"]) {
    const history = [entry(0), entry(1, outcome), entry(6, null)];
    const cleaning = realWorldProgress({ status: "cleaning", outcome, status_history: history });
    assert.deepEqual(cleaning.map(s => s.state), ["completed", outcome, "skipped", "skipped", "skipped", "skipped", "current", "upcoming"]);
    assert.equal(cleaning[1].completedAt, time(60));
    history[2] = entry(6);
    history.push({ id: 8, status: outcome, started_at: time(210), completed_at: time(210), outcome });
    const finished = realWorldProgress({ status: outcome, status_history: history });
    assert.equal(finished[6].state, "completed");
    assert.equal(finished[7].state, outcome);
    assert.equal(finished[7].completedAt, time(210));
  }
});

test("a cancellation request does not mark the active phase finished before the controller confirms it", () => {
  const steps = realWorldProgress({ status: "starting", cancel_requested: true,
    status_history: [entry(0), entry(1), entry(2), entry(3), entry(4, null)] });
  assert.equal(steps[4].state, "current");
  assert.equal(steps[4].completedAt, null);
  assert.equal(steps[6].state, "upcoming");
});

test("legacy success never invents completion times from created_at or updated_at", () => {
  const steps = realWorldProgress({ status: "completed", created_at: 1, updated_at: 2,
    status_history: [{ id: 1, status: "completed", started_at: null, completed_at: null, outcome: "completed" }] });
  assert.ok(steps.every(s => s.state === "completed" && s.completedAt === null && s.durationSeconds === null));
});

test("legacy failures do not claim unrecorded work completed or was skipped", () => {
  const steps = realWorldProgress({ status: "failed" });
  assert.ok(steps.slice(0, 6).every(s => s.state === "unknown"));
  assert.equal(steps[6].state, "completed", "terminal status confirms cleanup finished");
  assert.equal(steps[7].state, "failed");
  assert.ok(steps.every(s => s.completedAt === null));
});

test("history captured partway through an old test preserves new completions without inventing starts", () => {
  const steps = realWorldProgress({ status: "cleaning", outcome: "failed", status_history: [
    { id: 1, status: "checking", started_at: null, completed_at: time(60), outcome: "failed" }, entry(6, null),
  ] });
  assert.equal(steps[3].state, "failed");
  assert.equal(steps[3].completedAt, time(60));
  assert.equal(steps[3].durationSeconds, null);
  assert.equal(steps[0].state, "unknown");
  assert.equal(steps[4].state, "skipped");
  assert.equal(steps[5].state, "skipped");
});

test("invalid dates and unknown controller phases remain explicit", () => {
  const steps = realWorldProgress({ status: "new-stage", status_history: [{ ...entry(0), completed_at: "invalid" }] });
  assert.equal(steps[0].label, "new-stage");
  assert.equal(steps[0].state, "current");
  assert.equal(steps[1].completedAt, null);
  assert.equal(progressDuration(0), "0 s");
  assert.equal(progressDuration(125), "2 min 5 s");
  assert.equal(progressDuration(3725), "1 h 2 min 5 s");
});
