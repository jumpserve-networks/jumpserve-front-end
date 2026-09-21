import assert from "node:assert/strict";
import { test } from "node:test";
import { clusterRegions, mapViewport, MAX_MAP_ZOOM, projectRegion, REGION_LOCATIONS, regionMarkers, WORLD_CAMERA } from "../lib/aws-region-map.ts";
import { placementInRegion, REAL_WORLD_INSTANCE_TYPES } from "../lib/real-world.ts";

const catalog = Object.keys(REGION_LOCATIONS).map((region) => ({ region, enabled: region !== "ap-east-1", opt_in_status: "fixture" }));

test("map joins display locations to the live catalog without enabling opt-in Regions", () => {
  const regions = [catalog.find((item) => item.region === "ap-east-1"), { region: "new-region-1", enabled: true }];
  const markers = regionMarkers(regions);
  assert.equal(markers.length, 1);
  assert.equal(markers[0].region, "ap-east-1");
  assert.equal(markers[0].enabled, false);
  assert.deepEqual(regionMarkers([]), []);
});

test("Region changes clear the stale zone and preserve each selected instance size", () => {
  for (const instance_type of REAL_WORLD_INSTANCE_TYPES) {
    const existing = { region: "us-east-1", zone_id: "use1-az1", instance_type };
    for (const region of ["us-east-1", "ap-east-1", "not-in-catalog"]) {
      assert.equal(placementInRegion(existing, region, catalog), existing);
    }
    assert.deepEqual(placementInRegion(existing, "eu-west-1", catalog), { region: "eu-west-1", zone_id: "", instance_type });
    const extended = [...catalog, { region: "new-region-1", enabled: true }];
    assert.deepEqual(placementInRegion(existing, "new-region-1", extended), { region: "new-region-1", zone_id: "", instance_type });
    assert.equal(existing.zone_id, "use1-az1");
  }
});

test("world view includes all catalog locations on mobile and desktop without distorting geography", () => {
  assert.deepEqual(projectRegion(90, -180), { x: 0, y: 0 });
  assert.deepEqual(projectRegion(-90, 180), { x: 1000, y: 500 });
  for (const size of [{ width: 210, height: 288 }, { width: 1200, height: 384 }]) {
    const viewport = mapViewport(WORLD_CAMERA, size);
    assert.ok(Math.abs(viewport.width / viewport.height - size.width / size.height) < 0.0001);
    for (const marker of regionMarkers(catalog)) {
      assert.ok(marker.x >= viewport.left && marker.x <= viewport.left + viewport.width, marker.region);
      assert.ok(marker.y >= viewport.top && marker.y <= viewport.top + viewport.height, marker.region);
    }
  }
});

test("zoom and pan are bounded, and each Region can be centered in a zoomed viewport", () => {
  const size = { width: 320, height: 288 };
  const outside = mapViewport({ x: -10000, y: 10000, zoom: 10000 }, size);
  assert.equal(outside.zoom, MAX_MAP_ZOOM);
  assert.equal(outside.left, 0);
  assert.equal(outside.top + outside.height, 500);
  assert.equal(mapViewport({ ...WORLD_CAMERA, zoom: 0.01 }, size).zoom, 1);
  for (const marker of regionMarkers(catalog)) {
    const viewport = mapViewport({ ...marker, zoom: 8 }, size);
    assert.ok(marker.x >= viewport.left && marker.x <= viewport.left + viewport.width);
    assert.ok(marker.y >= viewport.top && marker.y <= viewport.top + viewport.height);
  }
});

test("clustering preserves every live Region and all markers separate at maximum mobile zoom", () => {
  const markers = regionMarkers(catalog);
  const size = { width: 210, height: 288 };
  const clusters = clusterRegions(markers, mapViewport(WORLD_CAMERA, size).scale);
  assert.ok(clusters.some((cluster) => cluster.regions.length > 1));
  assert.deepEqual(clusters.flatMap((cluster) => cluster.regions.map((region) => region.region)).sort(), catalog.map((region) => region.region).sort());
  assert.deepEqual(clusterRegions([...markers].reverse(), mapViewport(WORLD_CAMERA, size).scale), clusters);
  const expanded = clusterRegions(markers, mapViewport({ ...WORLD_CAMERA, zoom: MAX_MAP_ZOOM }, size).scale);
  assert.ok(expanded.every((cluster) => cluster.regions.length === 1));
});
