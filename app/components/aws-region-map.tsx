"use client";

import { useEffect, useId, useRef, useState } from "react";
import { LocateFixed, Minus, Plus, RotateCcw } from "lucide-react";
import { Button } from "@/app/components/ui/button";
import { clusterRegions, mapPointCopies, mapViewport, MAX_MAP_ZOOM, regionMarkers, WORLD_CAMERA } from "@/lib/aws-region-map";
import type { MapCamera } from "@/lib/aws-region-map";
import type { AwsRegion } from "@/lib/real-world";
import { WorldMapTiles } from "@/app/components/world-map-tiles";
import { useMapWheelPan } from "@/app/components/use-map-wheel-pan";
import { cn } from "@/lib/utils";

export function AwsRegionMap({ label, regions, value, onChange, disabled = false }: {
  label: string; regions: AwsRegion[]; value: string; onChange: (region: string) => void; disabled?: boolean;
}) {
  const instructionsId = useId();
  const canvas = useRef<HTMLDivElement>(null);
  const drag = useRef<{ pointer: number; x: number; y: number; camera: MapCamera; scale: number } | null>(null);
  const [size, setSize] = useState({ width: 1000, height: 384 });
  const [view, setView] = useState({ selection: value, camera: WORLD_CAMERA });
  const [inspected, setInspected] = useState<string | null>(null);
  const markers = regionMarkers(regions);
  const selected = markers.find((region) => region.region === value);
  // A dropdown selection recenters the map without an effect or resetting zoom.
  const camera = view.selection === value ? view.camera : {
    x: selected?.x ?? WORLD_CAMERA.x, y: selected?.y ?? WORLD_CAMERA.y, zoom: view.camera.zoom,
  };
  const viewport = mapViewport(camera, size);
  const clusters = clusterRegions(markers, viewport.scale);
  const inspection = markers.find((region) => region.region === inspected);

  useEffect(() => {
    if (!canvas.current) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry.contentRect.width && entry.contentRect.height) {
        setSize({ width: entry.contentRect.width, height: entry.contentRect.height });
      }
    });
    observer.observe(canvas.current);
    return () => observer.disconnect();
  }, []);

  function move(next: MapCamera) {
    if (disabled) return;
    const wrapped = mapViewport(next, size);
    setView({ selection: value, camera: { x: wrapped.x, y: wrapped.y, zoom: wrapped.zoom } });
  }

  useMapWheelPan(canvas, viewport, move, disabled);

  function zoom(factor: number) {
    move({ x: viewport.x, y: viewport.y, zoom: viewport.zoom * factor });
  }

  return <section aria-label={label} className="overflow-hidden rounded-md border">
    <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-muted/30 px-3 py-2">
      <p className="text-sm font-medium">{label}</p>
      <div className="flex items-center gap-1" role="group" aria-label={`${label} controls`}>
        <Button type="button" variant="outline" size="icon-sm" aria-label="Zoom in" title="Zoom in"
          disabled={disabled || viewport.zoom >= MAX_MAP_ZOOM} onClick={() => zoom(2)}><Plus /></Button>
        <Button type="button" variant="outline" size="icon-sm" aria-label="Zoom out" title="Zoom out"
          disabled={disabled || viewport.zoom <= 1} onClick={() => zoom(0.5)}><Minus /></Button>
        <Button type="button" variant="outline" size="icon-sm" aria-label="Reset world map" title="Reset world map"
          disabled={disabled} onClick={() => move(WORLD_CAMERA)}><RotateCcw /></Button>
        <Button type="button" variant="outline" size="sm" aria-label="Show selected" title="Show selected Region" disabled={disabled || !selected}
          onClick={() => { if (selected) move({ ...selected, zoom: Math.max(4, viewport.zoom) }); }}>
          <LocateFixed /><span className="hidden sm:inline">Show selected</span>
        </Button>
      </div>
    </div>
    <div ref={canvas} role="group" aria-label={`Interactive ${label}`} aria-describedby={instructionsId}
      aria-disabled={disabled || undefined} tabIndex={disabled ? -1 : 0}
      className={cn("relative h-72 overflow-hidden bg-background outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:h-96",
        !disabled && "touch-none cursor-grab active:cursor-grabbing")}
      onKeyDown={(event) => {
        if (disabled || event.target !== event.currentTarget) return;
        const step = 60 / viewport.scale;
        const directions: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
        if (directions[event.key]) {
          event.preventDefault();
          const [dx, dy] = directions[event.key];
          move({ x: viewport.x + dx, y: viewport.y + dy, zoom: viewport.zoom });
        } else if (["+", "=", "-", "Home"].includes(event.key)) {
          event.preventDefault();
          if (event.key === "Home") move(WORLD_CAMERA);
          else zoom(event.key === "-" ? 0.5 : 2);
        }
      }}
      onPointerDown={(event) => {
        if (disabled || !event.isPrimary || event.button !== 0 || (event.target as Element).closest("button")) return;
        event.currentTarget.focus({ preventScroll: true });
        event.currentTarget.setPointerCapture(event.pointerId);
        drag.current = { pointer: event.pointerId, x: event.clientX, y: event.clientY,
          camera: { x: viewport.x, y: viewport.y, zoom: viewport.zoom }, scale: viewport.scale };
      }}
      onPointerMove={(event) => {
        const start = drag.current;
        if (!start || start.pointer !== event.pointerId || disabled) return;
        move({ x: start.camera.x - (event.clientX - start.x) / start.scale,
          y: start.camera.y - (event.clientY - start.y) / start.scale, zoom: start.camera.zoom });
      }}
      onPointerUp={(event) => { if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); }}
      onLostPointerCapture={() => { drag.current = null; }}>
      <svg aria-hidden="true" className="pointer-events-none absolute inset-0 size-full" viewBox={`${viewport.left} ${viewport.top} ${viewport.width} ${viewport.height}`}>
        <WorldMapTiles viewport={viewport} />
      </svg>
      {clusters.flatMap((cluster) => mapPointCopies(cluster, viewport).map((copy) => {
        const x = (copy.x - viewport.left) * viewport.scale;
        const y = (copy.y - viewport.top) * viewport.scale;
        const grouped = cluster.regions.length > 1;
        const region = cluster.regions[0];
        const active = cluster.regions.some((item) => item.region === value);
        const available = cluster.regions.some((item) => item.enabled);
        const description = grouped ? `Zoom to ${cluster.regions.length} Regions: ${cluster.regions.map((item) => item.name).join(", ")}`
          : `${region.name} (${region.region})${region.enabled ? "" : " · requires account opt-in"}`;
        return <Button key={`${cluster.regions.map((item) => item.region).sort().join(",")}:${copy.key}`} type="button" size="icon-sm"
          variant={active ? "default" : "outline"} title={description}
          aria-label={grouped ? description : `${region.enabled ? "Select " : ""}${description}`}
          aria-pressed={grouped ? undefined : active} disabled={disabled || (!grouped && !available)}
          focusableWhenDisabled={!disabled && !grouped && !available}
          className={cn("absolute -translate-x-1/2 -translate-y-1/2 rounded-full border-2 text-xs tabular-nums shadow-sm transition-none focus-visible:z-20",
            active && "z-10 border-primary ring-2 ring-background",
            !active && available && "border-primary text-primary",
            !available && !active && "border-dashed border-muted-foreground/60 text-muted-foreground")}
          style={{ left: `${x / size.width * 100}%`, top: `${y / size.height * 100}%` }}
          onFocus={() => setInspected(grouped ? null : region.region)} onBlur={() => setInspected(null)}
          onMouseEnter={() => setInspected(grouped ? null : region.region)} onMouseLeave={() => setInspected(null)}
          onClick={() => {
            if (disabled) return;
            if (grouped) {
              move({ x: cluster.x, y: cluster.y, zoom: viewport.zoom * 2 });
              canvas.current?.focus({ preventScroll: true });
            } else if (region.enabled) onChange(region.region);
          }}>
          {grouped ? cluster.regions.length : <span aria-hidden="true" className={cn("size-2 rounded-full bg-current", !available && "rounded-none")} />}
        </Button>;
      }))}
      {!markers.length && <p className="absolute inset-x-4 top-4 rounded-md border bg-card p-3 text-sm text-muted-foreground">No Region locations are available.</p>}
    </div>
    <div className="space-y-2 border-t bg-muted/20 px-3 py-3 text-xs text-muted-foreground">
      <p role="status" className="text-sm text-foreground">
        {selected ? <><span className="font-medium">Selected:</span> {selected.name} <span className="font-mono text-xs">({value})</span></>
          : value ? <>Selected: {value}. Map location unavailable; use the Region dropdown.</> : "Select a marker or use the Region dropdown."}
      </p>
      <p className="min-h-4">{inspection ? `${inspection.name} · ${inspection.region}${inspection.enabled ? "" : " · requires account opt-in"}`
        : "Numbered markers group nearby Regions. Dashed markers require account opt-in."}</p>
      <p id={instructionsId}>Drag or scroll to pan in any direction; the world repeats at every edge. Use the controls to zoom. <span className="sr-only">Focus the map and use arrow keys to pan, plus or minus to zoom, and Home to reset. Tab to markers and press Enter to select or expand them. </span>Locations are approximate, not individual data centers.
        {" "}<a href="https://www.naturalearthdata.com/about/terms-of-use/" target="_blank" rel="noreferrer" className="underline underline-offset-2">Map: Natural Earth</a>
      </p>
    </div>
  </section>;
}
