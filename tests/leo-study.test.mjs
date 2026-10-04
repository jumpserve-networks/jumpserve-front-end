import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizeLeoData, scenarioRows, isPrimaryConfiguration } from "../lib/leo-study.ts";
test("numeric strings convert, absent measurements remain absent, and invalid strings fail", () => {
  assert.deepEqual(normalizeLeoData({ capacity_gbps: "40.960", pages: null, second: "0", reading_status: "unread" }), { capacity_gbps: 40.96, pages: null, second: 0, reading_status: "unread" });
  for (const capacity_gbps of ["", "NaN", "Infinity"]) assert.throws(() => normalizeLeoData({ capacity_gbps }), /Invalid recorded/);
});
test("primary comparison requires all declared dimensions", () => {
  const config={ constellation:"starlink_5shells", requested_terminals:200000, placement:"gcb-0", beam_policy:"greedy-coordinated", ku_gbps:1.28, variant:"paper" };
  assert.equal(isPrimaryConfiguration(config),true);
  for (const [field,value] of Object.entries({constellation:"starlink_all",requested_terminals:100000,placement:"population",beam_policy:"greedy-uncoordinated",ku_gbps:2.5,variant:"artifact"})) assert.equal(isPrimaryConfiguration({...config,[field]:value}),false);
});
test("scenario joins preserve country boundaries and do not manufacture missing samples", () => {
  const data={ configurations:[{id:"a",country:"tonga"},{id:"b",country:"haiti"}], samples:[{id:"s1",configuration_id:"a",capacity_gbps:0},{id:"s2",configuration_id:"b",capacity_gbps:5},{id:"orphan",configuration_id:"missing"}] };
  assert.equal(scenarioRows(data,"tonga").length,1);
  assert.equal(scenarioRows(data,"tonga")[0].capacity_gbps,0);
  assert.deepEqual(scenarioRows(data,"ghana"),[]);
});
