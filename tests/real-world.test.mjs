import assert from "node:assert/strict";
import { test } from "node:test";
import { defaultRealWorldConfig, emptyPlacement, isRealWorldTerminal, isRealWorldZoneAvailable, placementWithAvailableZone, placementWithInstanceType, REAL_WORLD_INSTANCE_TYPES, updateRealWorldPlacement, validateRealWorldConfig } from "../lib/real-world.ts";

function valid() {
  const config = defaultRealWorldConfig();
  for (const node of [config.server, config.bottleneck, ...config.receivers]) {
    Object.assign(node, { region: "us-east-1", zone_id: "use1-az1", instance_type: "t3.medium" });
  }
  return config;
}
test("every real-world machine requires a resolved placement", () => {
  assert.match(validateRealWorldConfig(defaultRealWorldConfig()), /every machine/);
  const config = valid();
  assert.equal(validateRealWorldConfig(config), null);
  config.receivers[1].zone_id = "";
  assert.match(validateRealWorldConfig(config), /every machine/);
  assert.equal(config.server.zone_id, "use1-az1");
});
test("every machine defaults to t3.medium and only the three supported sizes are accepted for every role", () => {
  const defaults = defaultRealWorldConfig();
  for (const machine of [defaults.server, defaults.bottleneck, ...defaults.receivers, emptyPlacement()]) {
    assert.equal(machine.instance_type, "t3.medium");
  }
  for (let index = 0; index < 4; index++) {
    for (const type of REAL_WORLD_INSTANCE_TYPES) {
      const config = valid();
      [config.server, config.bottleneck, ...config.receivers][index].instance_type = type;
      assert.equal(validateRealWorldConfig(config), null);
    }
    for (const type of ["c6i.large", "m6i.large", "t3.micro", "t3.xlarge", ""]) {
      const config = valid();
      [config.server, config.bottleneck, ...config.receivers][index].instance_type = type;
      assert.match(validateRealWorldConfig(config), /must use t3.small, t3.medium, or t3.large/);
    }
  }
});
test("zones must offer the selected supported type, even with an older catalog", () => {
  for (const type of REAL_WORLD_INSTANCE_TYPES) {
    assert.equal(isRealWorldZoneAvailable({ available: true, instance_types: [type] }, type), true);
    assert.equal(isRealWorldZoneAvailable({ available: false, instance_types: [type] }, type), false);
    assert.equal(isRealWorldZoneAvailable({ available: true, instance_types: [] }, type), false);
  }
  assert.equal(isRealWorldZoneAvailable({ available: true, instance_types: ["t3.medium"] }, "t3.small"), false);
  assert.equal(isRealWorldZoneAvailable({ available: true, instance_types: ["c6i.large"] }, "c6i.large"), false);
});
test("changing instance type preserves only a zone that offers the new type", () => {
  const value = valid().server;
  const zones = [{ zone_id: value.zone_id, available: true, instance_types: ["t3.medium", "t3.small"] }];
  assert.deepEqual(placementWithInstanceType(value, "t3.small", zones), { ...value, instance_type: "t3.small" });
  assert.deepEqual(placementWithInstanceType(value, "t3.large", zones), { ...value, instance_type: "t3.large", zone_id: "" });
  assert.equal(placementWithInstanceType(value, "t3.medium", []), value);
  assert.equal(placementWithInstanceType(value, "c6i.large", zones), value);
  assert.equal(placementWithInstanceType(value, "t3.small", []).zone_id, "");
  assert.equal(placementWithInstanceType(value, "t3.small", [{ ...zones[0], available: false }]).zone_id, "");
  assert.equal(value.zone_id, "use1-az1");
});
test("random zone selection covers eligible zones and excludes unavailable or incompatible zones for every type", () => {
  for (const instance_type of REAL_WORLD_INSTANCE_TYPES) {
    const value = { region: "us-east-1", zone_id: "", instance_type };
    const zones = [
      { zone_id: "unavailable", available: false, instance_types: [instance_type] },
      { zone_id: "wrong-type", available: true, instance_types: REAL_WORLD_INSTANCE_TYPES.filter(type => type !== instance_type) },
      { zone_id: "use1-az1", available: true, instance_types: [instance_type] },
      { zone_id: "use1-az2", available: true, instance_types: [instance_type] },
    ];
    for (const [sample, expected] of [[0, "use1-az1"], [0.499, "use1-az1"], [0.5, "use1-az2"], [0.999999, "use1-az2"]]) {
      assert.deepEqual(placementWithAvailableZone(value, value.region, zones, sample), { ...value, zone_id: expected });
    }
    assert.equal(value.zone_id, "");
  }
});
test("valid manual, copied, and automatic zones are preserved across repeated updates", () => {
  const value = valid().server;
  const zones = [value.zone_id, "use1-az2"].map(zone_id => ({ zone_id, available: true, instance_types: ["t3.medium"] }));
  for (const sample of [0, 0.99]) {
    assert.equal(placementWithAvailableZone(value, value.region, zones, sample), value);
  }
  const first = placementWithAvailableZone({ ...value, zone_id: "" }, value.region, zones, 0.99);
  assert.equal(first.zone_id, "use1-az2");
  assert.equal(placementWithAvailableZone(first, first.region, zones, 0), first);
});
test("empty catalogs never invent a zone and stale catalogs cannot change another Region", () => {
  const value = { ...valid().server, zone_id: "" };
  assert.equal(placementWithAvailableZone(value, value.region, [], 0.5), value);
  const zones = [{ zone_id: "use1-az1", available: false, instance_types: ["t3.medium"] }];
  assert.equal(placementWithAvailableZone(value, value.region, zones, 0.5), value);
  const moved = { ...value, region: "eu-west-1" };
  assert.equal(placementWithAvailableZone(moved, value.region, [{ ...zones[0], available: true }], 0), moved);
  assert.equal(placementWithAvailableZone({ ...value, zone_id: "stale-zone" }, value.region, zones, 0).zone_id, "");
});
test("zone selection uses the latest instance size and fills a cleared incompatible selection", () => {
  const value = valid().server;
  const zones = [
    { zone_id: value.zone_id, available: true, instance_types: ["t3.medium"] },
    { zone_id: "use1-az2", available: true, instance_types: ["t3.small"] },
  ];
  const changed = placementWithInstanceType(value, "t3.small", zones);
  assert.equal(changed.zone_id, "");
  assert.deepEqual(placementWithAvailableZone(changed, value.region, zones, 0), { ...changed, zone_id: "use1-az2" });
});
test("concurrent zone updates preserve other receivers and cannot restore a removed receiver", () => {
  let config = valid();
  config.receivers = config.receivers.map(receiver => ({ ...receiver, zone_id: "" }));
  const original = config;
  const zones = ["use1-az1", "use1-az2"].map(zone_id => ({ zone_id, available: true, instance_types: ["t3.medium"] }));
  const firstLookup = latest => placementWithAvailableZone(latest, "us-east-1", zones, 0);
  const secondLookup = latest => placementWithAvailableZone(latest, "us-east-1", zones, 0.99);
  config = updateRealWorldPlacement(config, 0, firstLookup);
  config = updateRealWorldPlacement(config, 1, secondLookup);
  assert.deepEqual(config.receivers.map(receiver => receiver.zone_id), ["use1-az1", "use1-az2"]);
  assert.deepEqual(original.receivers.map(receiver => receiver.zone_id), ["", ""]);
  assert.equal(config.server, original.server);
  assert.equal(config.bottleneck, original.bottleneck);
  assert.equal(validateRealWorldConfig(config), null);
  assert.equal(updateRealWorldPlacement(config, 0, secondLookup), config);
  const removed = { ...config, receivers: config.receivers.slice(0, 1) };
  assert.equal(updateRealWorldPlacement(removed, 1, secondLookup), removed);
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
