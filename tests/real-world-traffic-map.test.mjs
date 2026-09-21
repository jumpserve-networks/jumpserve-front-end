import assert from "node:assert/strict";
import { test } from "node:test";
import { fitTopology, mapCopies, mapViewport, realWorldTopology, trafficPath, WORLD_CAMERA } from "../lib/aws-region-map.ts";
import { realWorldTrafficPhase } from "../lib/real-world.ts";

const placement = (region) => ({ region, zone_id: `${region}-az1`, instance_type: "t3.medium" });
const job = {
  job_id: "topology-test", status: "starting", start_epoch: 1000, nodes: [],
  config: { server: placement("us-east-1"), bottleneck: placement("eu-west-1"), receivers: [placement("ap-northeast-1"), placement("ap-southeast-6")], duration_seconds: 60 },
};

test("animation follows the recorded transfer window even while the controller is starting", () => {
  assert.deepEqual(realWorldTrafficPhase(job, 999_001, 999_000), { active: false, label: "Transfers scheduled in 1 s" });
  assert.deepEqual(realWorldTrafficPhase(job, 1_000_000, 1_000_000), { active: true, label: "Scheduled transfer · 60 s remaining" });
  assert.equal(realWorldTrafficPhase(job, 1_059_999, 1_059_000).active, true);
  assert.deepEqual(realWorldTrafficPhase(job, 1_060_000, 1_059_000), { active: false, label: "Collecting measurements" });
  assert.equal(realWorldTrafficPhase({ ...job, status: "running" }, 1_070_000, 1_070_000).active, false);
});

test("cancellation, terminal states, errors, and stale or hung polling stop the animation", () => {
  for (const status of ["provisioning", "bootstrapping", "configuring", "checking", "cleaning", "completed", "cancelled", "failed"]) {
    assert.equal(realWorldTrafficPhase({ ...job, status }, 1_010_000, 1_010_000).active, false, status);
  }
  assert.equal(realWorldTrafficPhase({ ...job, cancel_requested: true }, 1_010_000, 1_010_000).active, false);
  assert.equal(realWorldTrafficPhase(job, 1_010_000, 1_010_000, true).active, false);
  assert.equal(realWorldTrafficPhase(job, 1_014_999, 1_000_000).active, true);
  assert.deepEqual(realWorldTrafficPhase(job, 1_015_000, 1_000_000), { active: false, label: "Status updates unavailable" });
  assert.equal(realWorldTrafficPhase(job, 1_015_000, 1_015_000).active, true, "successful polling restores the active phase");
  assert.equal(realWorldTrafficPhase({ ...job, status: "completed" }, 2_000_000, 1_000_000).label, "Completed · resources removed");
});

test("older jobs without recorded timing never imply active transfers", () => {
  for (const start_epoch of [undefined, null, 0, NaN, Infinity]) {
    assert.deepEqual(realWorldTrafficPhase({ ...job, start_epoch }, 1_010_000, 1_010_000), { active: false, label: "Transfer timing unavailable" });
  }
});

test("planned machines remain visible during provisioning and every receiver is reached through the bottleneck", () => {
  const topology = realWorldTopology(job);
  assert.equal(topology.nodes.length, 4);
  assert.equal(topology.markers.length, 4);
  assert.deepEqual(topology.links.flatMap((link) => link.flows), [
    { from: "server", to: "bottleneck" }, { from: "bottleneck", to: "receiver-1" }, { from: "bottleneck", to: "receiver-2" },
  ]);
  const actual = { ...job.config.receivers[0], name: "receiver-1", role: "receiver", instance_id: "i-test", state: "running" };
  assert.equal(realWorldTopology({ ...job, nodes: [actual] }).nodes.find((node) => node.name === "receiver-1").instance_id, "i-test");
});

test("sixteen co-located receivers preserve all seventeen directed hops in one geographic loop", () => {
  const topology = realWorldTopology({ ...job, config: { ...job.config, bottleneck: job.config.server, receivers: Array.from({ length: 16 }, () => job.config.server) } });
  assert.equal(topology.nodes.length, 18);
  assert.equal(topology.markers.length, 1);
  assert.equal(topology.links.length, 1);
  assert.equal(topology.links[0].flows.length, 17);
  const geometry = trafficPath(topology.links[0].source, topology.links[0].target, 2);
  assert.ok(geometry.path.includes("C"));
  assert.ok(geometry.arrow.y < topology.markers[0].y);
});

test("unknown Region coordinates never bypass the bottleneck or hide machines from the inspector", () => {
  const topology = realWorldTopology({ ...job, config: { ...job.config, bottleneck: placement("new-region-1") } });
  assert.equal(topology.nodes.length, 4);
  assert.equal(topology.unmapped.length, 1);
  assert.equal(topology.links.length, 0);
  const missingReceiver = realWorldTopology({ ...job, config: { ...job.config, receivers: [placement("new-region-1")] } });
  assert.deepEqual(missingReceiver.links.flatMap((link) => link.flows), [{ from: "server", to: "bottleneck" }]);
});

test("Pacific paths wrap across the dateline in both directions with correctly directed arrows", () => {
  const east = trafficPath({ x: 980, y: 250 }, { x: 170, y: 180 }, 1);
  const viewport = mapViewport(WORLD_CAMERA, { width: 1000, height: 500 });
  assert.ok(east.path.endsWith("1170 180"));
  assert.deepEqual(mapCopies(east.bounds, viewport, 5).map(copy => copy.x), [-1000, 0]);
  assert.ok(Math.abs(east.arrow.angle) < 90, "eastbound arrow points right");
  const west = trafficPath({ x: 170, y: 180 }, { x: 980, y: 250 }, 1);
  assert.ok(west.path.endsWith("-20 250"));
  assert.ok(Math.abs(west.arrow.angle) > 90, "westbound arrow points left");
  assert.deepEqual(mapCopies(west.bounds, viewport, 5).map(copy => copy.x), [0, 1000]);
  assert.deepEqual(mapCopies(trafficPath({ x: 300, y: 200 }, { x: 550, y: 160 }, 1).bounds, viewport, 5).map(copy => copy.x), [0]);
});

test("traffic paths repeat vertically and keep local loops visible across an edge", () => {
  const loop = trafficPath({ x: 500, y: 20 }, { x: 500, y: 20 }, 1);
  const viewport = mapViewport(WORLD_CAMERA, { width: 1000, height: 500 });
  assert.deepEqual(mapCopies(loop.bounds, viewport, 5).map(copy => copy.y), [0, 500]);
  const tallViewport = mapViewport(WORLD_CAMERA, { width: 210, height: 320 });
  const ordinary = trafficPath({ x: 300, y: 200 }, { x: 550, y: 160 }, tallViewport.scale);
  assert.ok(new Set(mapCopies(ordinary.bounds, tallViewport, 5).map(copy => copy.y)).size >= 3);
});

test("fit topology keeps every location visible on desktop and mobile, including single-Region tests", () => {
  for (const size of [{ width: 280, height: 320 }, { width: 1050, height: 416 }]) {
    for (const points of [realWorldTopology(job).markers, [{ x: 285, y: 142 }], [], [{ x: 985, y: 350 }, { x: 30, y: 100 }]]) {
      const camera = fitTopology(points, size);
      assert.ok(camera.zoom >= 1 && camera.zoom <= 8);
      const viewport = mapViewport(camera, size);
      for (const point of points) {
        assert.ok(point.x >= viewport.left && point.x <= viewport.left + viewport.width);
        assert.ok(point.y >= viewport.top && point.y <= viewport.top + viewport.height);
      }
    }
  }
});
