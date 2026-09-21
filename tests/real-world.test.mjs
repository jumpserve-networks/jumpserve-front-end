import assert from "node:assert/strict";
import { test } from "node:test";
import { defaultRealWorldConfig, emptyPlacement, isRealWorldTerminal, isRealWorldZoneAvailable, validateRealWorldConfig } from "../lib/real-world.ts";

function valid() {
  const config = defaultRealWorldConfig();
  for (const node of [config.server, config.bottleneck, ...config.receivers]) {
    Object.assign(node, { region: "us-east-1", zone_id: "use1-az1", instance_type: "t3.medium" });
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
test("every machine defaults to t3.medium and other types are rejected for every role", () => {
  const defaults = defaultRealWorldConfig();
  for (const machine of [defaults.server, defaults.bottleneck, ...defaults.receivers, emptyPlacement()]) {
    assert.equal(machine.instance_type, "t3.medium");
  }
  for (let index = 0; index < 4; index++) {
    for (const type of ["c6i.large", "m6i.large", "t3.large", ""]) {
      const config = valid();
      [config.server, config.bottleneck, ...config.receivers][index].instance_type = type;
      assert.match(validateRealWorldConfig(config), /must use t3.medium/);
    }
  }
});
test("only available zones offering t3.medium can be selected, including with an older catalog", () => {
  assert.equal(isRealWorldZoneAvailable({ available: true, instance_types: ["t3.medium"] }), true);
  assert.equal(isRealWorldZoneAvailable({ available: true, instance_types: ["c6i.large", "m6i.large"] }), false);
  assert.equal(isRealWorldZoneAvailable({ available: false, instance_types: ["t3.medium"] }), false);
  assert.equal(isRealWorldZoneAvailable({ available: true, instance_types: [] }), false);
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
