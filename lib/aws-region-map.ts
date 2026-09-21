import type { AwsRegion, RealWorldJob } from "./real-world";

// Representative geographic locations, not AWS facility coordinates.
// Availability always comes from /real-world/regions, never this display metadata.
export const REGION_LOCATIONS: Record<string, { name: string; latitude: number; longitude: number }> = {
  "us-east-1": { name: "Northern Virginia", latitude: 38.9, longitude: -77.4 },
  "us-east-2": { name: "Ohio", latitude: 40, longitude: -83 },
  "us-west-1": { name: "Northern California", latitude: 37.4, longitude: -121.9 },
  "us-west-2": { name: "Oregon", latitude: 45.8, longitude: -119.7 },
  "af-south-1": { name: "Cape Town", latitude: -33.9, longitude: 18.4 },
  "ap-east-1": { name: "Hong Kong", latitude: 22.3, longitude: 114.2 },
  "ap-east-2": { name: "Taipei", latitude: 25, longitude: 121.6 },
  "ap-south-1": { name: "Mumbai", latitude: 19.1, longitude: 72.9 },
  "ap-south-2": { name: "Hyderabad", latitude: 17.4, longitude: 78.5 },
  "ap-southeast-1": { name: "Singapore", latitude: 1.3, longitude: 103.8 },
  "ap-southeast-2": { name: "Sydney", latitude: -33.9, longitude: 151.2 },
  "ap-southeast-3": { name: "Jakarta", latitude: -6.2, longitude: 106.8 },
  "ap-southeast-4": { name: "Melbourne", latitude: -37.8, longitude: 145 },
  "ap-southeast-5": { name: "Malaysia", latitude: 3.1, longitude: 101.7 },
  "ap-southeast-6": { name: "New Zealand", latitude: -36.8, longitude: 174.8 },
  "ap-southeast-7": { name: "Thailand", latitude: 13.8, longitude: 100.5 },
  "ap-northeast-1": { name: "Tokyo", latitude: 35.7, longitude: 139.7 },
  "ap-northeast-2": { name: "Seoul", latitude: 37.6, longitude: 127 },
  "ap-northeast-3": { name: "Osaka", latitude: 34.7, longitude: 135.5 },
  "ca-central-1": { name: "Canada (Central)", latitude: 45.5, longitude: -73.6 },
  "ca-west-1": { name: "Calgary", latitude: 51, longitude: -114.1 },
  "eu-central-1": { name: "Frankfurt", latitude: 50.1, longitude: 8.7 },
  "eu-central-2": { name: "Zurich", latitude: 47.4, longitude: 8.5 },
  "eu-west-1": { name: "Ireland", latitude: 53.3, longitude: -6.3 },
  "eu-west-2": { name: "London", latitude: 51.5, longitude: -0.1 },
  "eu-west-3": { name: "Paris", latitude: 48.9, longitude: 2.4 },
  "eu-south-1": { name: "Milan", latitude: 45.5, longitude: 9.2 },
  "eu-south-2": { name: "Spain", latitude: 41.7, longitude: -0.9 },
  "eu-north-1": { name: "Stockholm", latitude: 59.3, longitude: 18.1 },
  "il-central-1": { name: "Tel Aviv", latitude: 32.1, longitude: 34.8 },
  "mx-central-1": { name: "Mexico (Central)", latitude: 20.6, longitude: -100.4 },
  "me-south-1": { name: "Bahrain", latitude: 26.2, longitude: 50.6 },
  "me-central-1": { name: "United Arab Emirates", latitude: 24.5, longitude: 54.4 },
  "sa-east-1": { name: "São Paulo", latitude: -23.6, longitude: -46.6 },
};

export type Point = { x: number; y: number };
export type MapSize = { width: number; height: number };
export type MapCamera = Point & { zoom: number };
export type RegionMarker = AwsRegion & Point & { name: string };
export type RegionCluster = Point & { regions: RegionMarker[] };
export type MapBounds = { left: number; top: number; right: number; bottom: number };
export const WORLD_WIDTH = 1000;
export const WORLD_HEIGHT = 500;
export const WORLD_CAMERA: MapCamera = { x: 500, y: 250, zoom: 1 };
export const MAX_MAP_ZOOM = 64;

function wrap(value: number, period: number) { return ((value % period) + period) % period; }
function wrappedDelta(value: number, period: number) { return wrap(value + period / 2, period) - period / 2; }

export function projectRegion(latitude: number, longitude: number): Point {
  return { x: (longitude + 180) / 360 * 1000, y: (90 - latitude) / 180 * 500 };
}

export function regionMarkers(regions: AwsRegion[]): RegionMarker[] {
  return regions.flatMap((region) => {
    const location = REGION_LOCATIONS[region.region];
    return location ? [{ ...region, name: location.name, ...projectRegion(location.latitude, location.longitude) }] : [];
  });
}

export function mapViewport(camera: MapCamera, size: MapSize) {
  const zoom = Math.max(1, Math.min(MAX_MAP_ZOOM, camera.zoom));
  const scale = Math.min(size.width / 1000, size.height / 500) * zoom;
  const width = size.width / scale;
  const height = size.height / scale;
  // Normalize coordinates to avoid precision loss after repeated world crossings.
  // The world repeats on both axes, so normalization never limits panning.
  const x = wrap(camera.x, WORLD_WIDTH);
  const y = wrap(camera.y, WORLD_HEIGHT);
  return { x, y, zoom, width, height, left: x - width / 2, top: y - height / 2, scale };
}

export type MapViewport = ReturnType<typeof mapViewport>;

// Only render copies whose bounds intersect the viewport. Padding is in pixels
// so markers, strokes, and arrowheads can remain visible at the canvas edges.
export function mapCopies(bounds: MapBounds, viewport: MapViewport, padding = 0) {
  const margin = padding / viewport.scale;
  const firstColumn = Math.floor((viewport.left - margin - bounds.right) / WORLD_WIDTH) + 1;
  const lastColumn = Math.ceil((viewport.left + viewport.width + margin - bounds.left) / WORLD_WIDTH) - 1;
  const firstRow = Math.floor((viewport.top - margin - bounds.bottom) / WORLD_HEIGHT) + 1;
  const lastRow = Math.ceil((viewport.top + viewport.height + margin - bounds.top) / WORLD_HEIGHT) - 1;
  const copies: (Point & { key: string })[] = [];
  for (let row = firstRow; row <= lastRow; row++) {
    for (let column = firstColumn; column <= lastColumn; column++) {
      copies.push({ x: column * WORLD_WIDTH, y: row * WORLD_HEIGHT, key: `${column}:${row}` });
    }
  }
  return copies;
}

export function mapPointCopies(point: Point, viewport: MapViewport) {
  return mapCopies({ left: point.x, right: point.x, top: point.y, bottom: point.y }, viewport, 20)
    .map((copy) => ({ ...copy, x: point.x + copy.x, y: point.y + copy.y }));
}

// Connected components in screen space avoid overlapping hit targets at every
// viewport size. Membership/order is stable across live-catalog order changes.
export function clusterRegions(markers: RegionMarker[], scale: number): RegionCluster[] {
  const remaining = [...markers].sort((a, b) => a.region.localeCompare(b.region));
  const clusters: RegionCluster[] = [];
  while (remaining.length) {
    const members = [remaining.shift()!];
    for (let member = 0; member < members.length; member++) {
      for (let i = remaining.length - 1; i >= 0; i--) {
        if (Math.hypot(wrappedDelta(members[member].x - remaining[i].x, WORLD_WIDTH),
          wrappedDelta(members[member].y - remaining[i].y, WORLD_HEIGHT)) * scale < 38) {
          members.push(remaining.splice(i, 1)[0]);
        }
      }
    }
    const anchor = members[0];
    clusters.push({ regions: members,
      x: wrap(anchor.x + members.reduce((sum, r) => sum + wrappedDelta(r.x - anchor.x, WORLD_WIDTH), 0) / members.length, WORLD_WIDTH),
      y: wrap(anchor.y + members.reduce((sum, r) => sum + wrappedDelta(r.y - anchor.y, WORLD_HEIGHT), 0) / members.length, WORLD_HEIGHT) });
  }
  return clusters;
}

export type TrafficLink = {
  key: string; source: Point; target: Point;
  flows: { from: string; to: string }[];
};

export function realWorldTopology(job: RealWorldJob) {
  const planned = [
    { ...job.config.server, name: "server", role: "server" },
    { ...job.config.bottleneck, name: "bottleneck", role: "bottleneck" },
    ...job.config.receivers.map((placement, index) => ({ ...placement, name: `receiver-${index + 1}`, role: "receiver" })),
  ];
  const nodes = planned.map((node) => ({ ...node, ...job.nodes.find((actual) => actual.name === node.name) }));
  const markers = regionMarkers([...new Set(nodes.map((node) => node.region))].map((region) => ({ region, enabled: true, opt_in_status: "" })));
  const flows = [{ from: "server", to: "bottleneck" }, ...nodes.filter((node) => node.role === "receiver").map((node) => ({ from: "bottleneck", to: node.name }))];
  const links = new Map<string, TrafficLink>();
  for (const flow of flows) {
    const source = markers.find((marker) => marker.region === nodes.find((node) => node.name === flow.from)?.region);
    const target = markers.find((marker) => marker.region === nodes.find((node) => node.name === flow.to)?.region);
    // An unmapped hop must never turn into a direct server-to-receiver path.
    if (!source || !target) continue;
    const key = `${source.region}:${target.region}`;
    const existing = links.get(key);
    if (existing) existing.flows.push(flow);
    else links.set(key, { key, source, target, flows: [flow] });
  }
  return { nodes, markers, links: [...links.values()], unmapped: nodes.filter((node) => !REGION_LOCATIONS[node.region]) };
}

export function fitTopology(points: Point[], size: MapSize): MapCamera {
  if (!points.length) return WORLD_CAMERA;
  const minX = Math.min(...points.map((p) => p.x)), maxX = Math.max(...points.map((p) => p.x));
  const minY = Math.min(...points.map((p) => p.y)), maxY = Math.max(...points.map((p) => p.y));
  const base = Math.min(size.width / 1000, size.height / 500);
  const zoom = Math.max(1, Math.min(8, (size.width - 110) / Math.max(1, maxX - minX) / base,
    (size.height - 160) / Math.max(1, maxY - minY) / base));
  return { x: (minX + maxX) / 2, y: (minY + maxY) / 2, zoom };
}

export function trafficPath(source: Point, target: Point, scale: number) {
  if (source.x === target.x && source.y === target.y) {
    const w = 55 / scale, h = 85 / scale;
    return { path: `M${source.x} ${source.y}C${source.x - w} ${source.y - h} ${source.x + w} ${source.y - h} ${source.x} ${source.y}`,
      arrow: { x: source.x, y: source.y - h * 0.75, angle: 0 },
      bounds: { left: source.x - w, right: source.x + w, top: source.y - h, bottom: source.y } };
  }
  // Draw the shortest longitudinal path and repeat across the world boundary.
  const delta = target.x - source.x;
  const end = { x: target.x + (delta > 500 ? -1000 : delta < -500 ? 1000 : 0), y: target.y };
  const dx = end.x - source.x, dy = end.y - source.y;
  const length = Math.hypot(dx, dy);
  const bend = Math.min(65 / scale, length * 0.25);
  const control = { x: (source.x + end.x) / 2 + dy / length * bend, y: (source.y + end.y) / 2 - dx / length * bend };
  const t = 0.65, u = 1 - t;
  const arrow = { x: u * u * source.x + 2 * u * t * control.x + t * t * end.x,
    y: u * u * source.y + 2 * u * t * control.y + t * t * end.y,
    angle: Math.atan2(u * (control.y - source.y) + t * (end.y - control.y), u * (control.x - source.x) + t * (end.x - control.x)) * 180 / Math.PI };
  return { path: `M${source.x} ${source.y}Q${control.x} ${control.y} ${end.x} ${end.y}`, arrow,
    bounds: { left: Math.min(source.x, control.x, end.x), right: Math.max(source.x, control.x, end.x),
      top: Math.min(source.y, control.y, end.y), bottom: Math.max(source.y, control.y, end.y) } };
}
