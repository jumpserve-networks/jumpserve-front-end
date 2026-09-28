import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizeStudyData, formatStudyNumber } from "../lib/delay-study.ts";
import { readStudy, StudyQueryError } from "../lib/delay-study-read.ts";

test("study chart data converts nested Postgres numerics while preserving missingness and identifiers", () => {
  const raw = { id: "00123", baseline_delta: "0", treatment_delta: null, mean_share: "0.625",
    delay_study_config_flows: [{ flow_index: "2", configured_base_rtt_ms: "54" }],
    goodput_mbps: "not-a-number", citation: "1981", protocol_sha256: "012345" };
  assert.deepEqual(normalizeStudyData(raw), { id: "00123", baseline_delta: 0, treatment_delta: null,
    mean_share: 0.625, delay_study_config_flows: [{ flow_index: 2, configured_base_rtt_ms: 54 }],
    goodput_mbps: null, citation: "1981", protocol_sha256: "012345" });
  assert.equal(raw.baseline_delta, "0");
  assert.equal(formatStudyNumber(null), "—");
  assert.equal(formatStudyNumber(Infinity), "—");
  assert.equal(formatStudyNumber(0), "0.00");
});

test("measurement reads recover from transport failure and stop after three attempts", async () => {
  let attempts = 0;
  assert.deepEqual(await readStudy(async () => {
    if (++attempts === 1) throw new StudyQueryError("TypeError: fetch failed", 0);
    return { measured: 0, missing: null };
  }), { measured: 0, missing: null });
  assert.equal(attempts, 2);
  attempts = 0;
  await assert.rejects(readStudy(async () => {
    attempts += 1;
    throw new StudyQueryError("Service unavailable", 503);
  }), /Service unavailable/);
  assert.equal(attempts, 3);
});

test("measurement reads do not retry permission errors or incomplete schedules", async () => {
  for (const error of [new StudyQueryError("Permission denied", 403), new Error("Incomplete schedule")]) {
    let attempts = 0;
    await assert.rejects(readStudy(async () => { attempts += 1; throw error; }), error);
    assert.equal(attempts, 1);
  }
});
