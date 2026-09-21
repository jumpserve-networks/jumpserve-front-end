"use client";

import { useEffect, useId, useState } from "react";
import { Label } from "@/app/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/app/components/ui/select";
import { Button } from "@/app/components/ui/button";
import { AwsRegionMap } from "@/app/components/aws-region-map";
import { realWorldRequest } from "@/lib/real-world-api";
import type { AwsRegion, AwsZone, Placement, PlacementUpdate } from "@/lib/real-world";
import { isRealWorldZoneAvailable, placementInRegion, placementWithAvailableZone, placementWithInstanceType, REAL_WORLD_INSTANCE_TYPES } from "@/lib/real-world";

export function Choice({ label, value, items, onChange, disabled = false }: {
  label: string; value: string; items: { value: string; label: string; disabled?: boolean }[];
  onChange: (value: string) => void; disabled?: boolean;
}) {
  const id = useId();
  return <div className="min-w-0 space-y-2">
    <Label htmlFor={id}>{label}</Label>
    <Select value={value || null} onValueChange={(next) => { if (next !== null) onChange(next); }} items={items} disabled={disabled}>
      <SelectTrigger id={id} className="w-full"><SelectValue placeholder="Select…" /></SelectTrigger>
      <SelectContent>{items.map((item) => <SelectItem key={item.value} value={item.value} disabled={item.disabled}>{item.label}</SelectItem>)}</SelectContent>
    </Select>
  </div>;
}

export function RealWorldPlacement({ label, value, regions, onChange, disabled = false }: {
  label: string; value: Placement; regions: AwsRegion[]; onChange: (update: PlacementUpdate) => void;
  disabled?: boolean;
}) {
  const [catalog, setCatalog] = useState<{ region: string; zones: AwsZone[]; error?: string } | null>(null);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!value.region) return;
    const controller = new AbortController();
    realWorldRequest<{ zones: AwsZone[] }>(`/locations?${new URLSearchParams({ region: value.region })}`, { signal: controller.signal })
      .then(({ zones }) => { if (!controller.signal.aborted) setCatalog({ region: value.region, zones }); })
      .catch((error: Error) => { if (!controller.signal.aborted) setCatalog({ region: value.region, zones: [], error: error.message }); });
    return () => controller.abort();
  }, [value.region, retry]);
  useEffect(() => {
    if (disabled || !catalog || catalog.error || catalog.region !== value.region) return;
    if (catalog.zones.some((zone) => zone.zone_id === value.zone_id && isRealWorldZoneAvailable(zone, value.instance_type))) return;
    // Sample outside the updater: React may replay it, and another machine may
    // finish its zone lookup before this update is applied.
    const sample = Math.random();
    onChange((latest) => placementWithAvailableZone(latest, catalog.region, catalog.zones, sample));
  }, [catalog, disabled, onChange, value]);
  const current = catalog?.region === value.region ? catalog : null;
  const zones = (current?.zones ?? []).filter((zone) => isRealWorldZoneAvailable(zone, value.instance_type));
  function selectRegion(region: string) {
    if (disabled) return;
    onChange((latest) => placementInRegion(latest, region, regions));
  }
  return <fieldset disabled={disabled} className="min-w-0 space-y-3 rounded-md border p-4">
    <legend className="px-1 text-sm font-semibold">{label}</legend>
    <div className="grid gap-4 md:grid-cols-3">
      <Choice label={`${label} Region`} value={value.region} items={regions.map((r) => ({ value: r.region,
        label: `${r.region}${r.enabled ? "" : " · requires account opt-in"}`, disabled: !r.enabled }))}
        onChange={selectRegion} disabled={disabled} />
      <Choice label={`${label} Availability Zone`} value={value.zone_id} disabled={disabled || !zones.length}
        items={zones.map((z) => ({ value: z.zone_id, label: `${z.name} (${z.zone_id})` }))}
        onChange={(zone_id) => {
          onChange((latest) => current?.region === latest.region &&
            current.zones.some((zone) => zone.zone_id === zone_id && isRealWorldZoneAvailable(zone, latest.instance_type))
            ? { ...latest, zone_id } : latest);
        }} />
      <Choice label={`${label} instance type`} value={value.instance_type} disabled={disabled}
        items={REAL_WORLD_INSTANCE_TYPES.map((type) => ({ value: type,
          label: `${type} · 2 vCPUs · ${{ "t3.small": 2, "t3.medium": 4, "t3.large": 8 }[type]} GiB RAM` }))}
        onChange={(instanceType) => onChange((latest) => placementWithInstanceType(latest, instanceType,
          current?.region === latest.region ? current.zones : []))} />
    </div>
    <AwsRegionMap label={`${label} Region map`} regions={regions} value={value.region} onChange={selectRegion} disabled={disabled} />
    {value.region && !current && <p className="text-xs text-muted-foreground" role="status">Loading AWS zones…</p>}
    {current?.error && <div role="alert" className="text-sm text-destructive">{current.error} <Button type="button" variant="outline" size="sm" onClick={() => setRetry((n) => n + 1)}>Retry locations</Button></div>}
    {current && !current.error && !zones.length && <p className="text-sm text-muted-foreground">No zones offering {value.instance_type} are currently available in this Region.</p>}
  </fieldset>;
}
