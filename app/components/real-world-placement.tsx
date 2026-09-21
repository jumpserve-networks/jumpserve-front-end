"use client";

import { useEffect, useId, useState } from "react";
import { Label } from "@/app/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/app/components/ui/select";
import { Button } from "@/app/components/ui/button";
import { AwsRegionMap } from "@/app/components/aws-region-map";
import { placementInRegion } from "@/lib/aws-region-map";
import { realWorldRequest } from "@/lib/real-world-api";
import type { AwsRegion, AwsZone, Placement } from "@/lib/real-world";

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

export function RealWorldPlacement({ label, value, regions, onChange, showRegionMap = false, disabled = false }: {
  label: string; value: Placement; regions: AwsRegion[]; onChange: (value: Placement) => void;
  showRegionMap?: boolean; disabled?: boolean;
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
  const current = catalog?.region === value.region ? catalog : null;
  const zones = current?.zones ?? [];
  const zone = zones.find((item) => item.zone_id === value.zone_id);
  function selectRegion(region: string) {
    if (disabled) return;
    const next = placementInRegion(value, region, regions);
    if (next !== value) onChange(next);
  }
  return <fieldset disabled={disabled} className="min-w-0 space-y-3 rounded-md border p-4">
    <legend className="px-1 text-sm font-semibold">{label}</legend>
    <div className="grid gap-4 md:grid-cols-3">
      <Choice label={`${label} Region`} value={value.region} items={regions.map((r) => ({ value: r.region,
        label: `${r.region}${r.enabled ? "" : " · requires account opt-in"}`, disabled: !r.enabled }))}
        onChange={selectRegion} disabled={disabled} />
      <Choice label={`${label} Availability Zone`} value={value.zone_id} disabled={!zones.length}
        items={zones.map((z) => ({ value: z.zone_id, label: `${z.name} (${z.zone_id})${z.reason ? ` · ${z.reason}` : ""}`, disabled: !z.available }))}
        onChange={(zone_id) => onChange({ ...value, zone_id, instance_type: "" })} />
      <Choice label={`${label} instance type`} value={value.instance_type} disabled={!zone?.available}
        items={(zone?.instance_types ?? []).map((type) => ({ value: type, label: type }))}
        onChange={(instance_type) => onChange({ ...value, instance_type })} />
    </div>
    {showRegionMap && <AwsRegionMap regions={regions} value={value.region} onChange={selectRegion} disabled={disabled} />}
    {value.region && !current && <p className="text-xs text-muted-foreground" role="status">Loading AWS zones…</p>}
    {current?.error && <div role="alert" className="text-sm text-destructive">{current.error} <Button type="button" variant="outline" size="sm" onClick={() => setRetry((n) => n + 1)}>Retry locations</Button></div>}
    {current && !current.error && !zones.some((z) => z.available) && <p className="text-sm text-muted-foreground">No compatible zones are currently available in this Region.</p>}
  </fieldset>;
}
