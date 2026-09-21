import type { AwsRegion, Placement } from "./real-world";

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
export const WORLD_CAMERA: MapCamera = { x: 500, y: 250, zoom: 1 };
export const MAX_MAP_ZOOM = 64;

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
  const x = width >= 1000 ? 500 : Math.max(width / 2, Math.min(1000 - width / 2, camera.x));
  const y = height >= 500 ? 250 : Math.max(height / 2, Math.min(500 - height / 2, camera.y));
  return { x, y, zoom, width, height, left: x - width / 2, top: y - height / 2, scale };
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
        if (Math.hypot(members[member].x - remaining[i].x, members[member].y - remaining[i].y) * scale < 38) {
          members.push(remaining.splice(i, 1)[0]);
        }
      }
    }
    clusters.push({ regions: members, x: members.reduce((sum, r) => sum + r.x, 0) / members.length,
      y: members.reduce((sum, r) => sum + r.y, 0) / members.length });
  }
  return clusters;
}

export function placementInRegion(value: Placement, region: string, regions: AwsRegion[]): Placement {
  if (region === value.region || !regions.some((item) => item.region === region && item.enabled)) return value;
  return { region, zone_id: "", instance_type: "" };
}
