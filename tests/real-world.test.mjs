import assert from "node:assert/strict";
import { test } from "node:test";
import { defaultRealWorldConfig, isRealWorldTerminal, validateRealWorldConfig } from "../lib/real-world.ts";

function valid() {
  const config = defaultRealWorldConfig();
  for (const node of [config.server, config.bottleneck, ...config.receivers]) {
    Object.assign(node, { region: "us-east-1", zone_id: "use1-az1", instance_type: "c6i.large" });
  }
  return config;
}
test("every real-world machine requires explicit placement", () => {
  assert.match(validateRealWorldConfig(defaultRealWorldConfig()), /every machine/);
  const config = valid();
  assert.equal(validateRealWorldConfig(config), null);
  config.receivers[1].zone_id = "";
  assert.match(validateRealWorldConfig(config), /every machine/);
  assert.equal(config.server.zone_id, "use1-az1");
});
test("invalid numeric values cannot create oversized or indefinite EC2 tests", () => {
  for (const [key, value] of [["duration_seconds", NaN], ["duration_seconds", 601], ["duration_seconds", 9], ["rate_mbit", 0], ["rate_mbit", 1.5], ["buffer_kbytes", 1], ["buffer_kbytes", Infinity]]) {
    assert.notEqual(validateRealWorldConfig({ ...valid(), [key]: value }), null);
  }
  assert.notEqual(validateRealWorldConfig({ ...valid(), receivers: [] }), null);
  assert.notEqual(validateRealWorldConfig({ ...valid(), receivers: Array(17).fill(valid().server) }), null);
  assert.notEqual(validateRealWorldConfig({ ...valid(), cca: "bbr3" }), null);
});
test("cleanup remains active until resources have actually been removed", () => {
  for (const status of ["provisioning", "running", "cleaning"]) assert.equal(isRealWorldTerminal(status), false);
  for (const status of ["completed", "failed", "cancelled"]) assert.equal(isRealWorldTerminal(status), true);
});
