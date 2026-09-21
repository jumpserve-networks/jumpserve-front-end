import assert from "node:assert/strict";
import { test } from "node:test";
import { clusterRegions, mapCopies, mapPointCopies, mapViewport, MAX_MAP_ZOOM, projectRegion, REGION_LOCATIONS, regionMarkers, WORLD_CAMERA } from "../lib/aws-region-map.ts";
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

test("zoom stays bounded while panning wraps indefinitely on both axes", () => {
  const size = { width: 320, height: 288 };
  const outside = mapViewport({ x: -10000, y: 10000, zoom: 10000 }, size);
  assert.equal(outside.zoom, MAX_MAP_ZOOM);
  assert.equal(outside.x, 0);
  assert.equal(outside.y, 0);
  const baseline = mapViewport({ x: 225, y: 375, zoom: 2 }, size);
  for (const [worldsX, worldsY] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1_000_000, -1_000_000]]) {
    assert.deepEqual(mapViewport({ x: 225 + 1000 * worldsX, y: 375 + 500 * worldsY, zoom: 2 }, size), baseline);
  }
  assert.equal(mapViewport({ ...WORLD_CAMERA, zoom: 0.01 }, size).zoom, 1);
  for (const marker of regionMarkers(catalog)) {
    const viewport = mapViewport({ ...marker, zoom: 8 }, size);
    assert.ok(marker.x >= viewport.left && marker.x <= viewport.left + viewport.width);
    assert.ok(marker.y >= viewport.top && marker.y <= viewport.top + viewport.height);
  }
});

test("world copies cover every viewport edge without growing with pan distance", () => {
  const bounds = { left: 0, top: 0, right: 1000, bottom: 500 };
  for (const size of [{ width: 210, height: 288 }, { width: 1600, height: 384 }]) {
    for (const camera of [WORLD_CAMERA, { x: -5, y: -10, zoom: 1 }, { x: 1005, y: 505, zoom: 4 }, { x: 1e9, y: -1e9, zoom: 64 }]) {
      const viewport = mapViewport(camera, size);
      const copies = mapCopies(bounds, viewport);
      assert.ok(copies.length > 0 && copies.length <= 16);
      assert.equal(new Set(copies.map(copy => copy.key)).size, copies.length);
      for (const horizontal of [0, 0.25, 0.5, 0.75, 1]) {
        for (const vertical of [0, 0.25, 0.5, 0.75, 1]) {
          const x = viewport.left + viewport.width * horizontal;
          const y = viewport.top + viewport.height * vertical;
          assert.ok(copies.some(copy => x >= copy.x && x <= copy.x + 1000 && y >= copy.y && y <= copy.y + 500));
        }
      }
    }
  }
});

test("markers move continuously through horizontal and vertical seams", () => {
  const size = { width: 320, height: 288 };
  const point = { x: 0, y: 0 };
  const screenPoint = (viewport) => {
    const copy = mapPointCopies(point, viewport).find(copy => Math.abs(copy.x - viewport.x) < 1 && Math.abs(copy.y - viewport.y) < 1);
    assert.ok(copy);
    return { x: (copy.x - viewport.left) * viewport.scale, y: (copy.y - viewport.top) * viewport.scale };
  };
  const before = mapViewport({ x: 999.75, y: 499.75, zoom: 2 }, size);
  const after = mapViewport({ x: 0.25, y: 0.25, zoom: 2 }, size);
  assert.ok(Math.abs(screenPoint(after).x - screenPoint(before).x + 0.5 * before.scale) < 1e-8);
  assert.ok(Math.abs(screenPoint(after).y - screenPoint(before).y + 0.5 * before.scale) < 1e-8);
});

test("nearby markers cluster across either world seam with their original Regions intact", () => {
  const markers = [
    { region: "a", x: 5, y: 5, enabled: true },
    { region: "b", x: 985, y: 485, enabled: false },
  ];
  const [cluster] = clusterRegions(markers, 1);
  assert.equal(cluster.regions.length, 2);
  assert.equal(cluster.x, 995);
  assert.equal(cluster.y, 495);
  assert.deepEqual(cluster.regions.map(region => region.enabled), [true, false]);
  assert.equal(clusterRegions(markers, 64).length, 2);
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
