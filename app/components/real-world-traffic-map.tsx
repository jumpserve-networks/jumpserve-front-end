"use client";

import { useEffect, useId, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Download, Globe2, LocateFixed, Minus, Network, Pause, Play, Plus, Server } from "lucide-react";
import { Badge } from "@/app/components/ui/badge";
import { Button } from "@/app/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/app/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/app/components/ui/select";
import { clusterRegions, fitTopology, mapViewport, MAX_MAP_ZOOM, realWorldTopology, REGION_LOCATIONS, trafficPath, WORLD_CAMERA, type MapCamera } from "@/lib/aws-region-map";
import { realWorldTrafficPhase, type RealWorldJob } from "@/lib/real-world";
import landPaths from "@/lib/maps/world-land.json";
import { cn } from "@/lib/utils";

const land = <g className="fill-muted-foreground/15 stroke-muted-foreground/30" strokeWidth="0.6">
  {landPaths.map((path, index) => <path key={index} d={path} fillRule="evenodd" vectorEffect="non-scaling-stroke" />)}
</g>;
const motionQuery = "(prefers-reduced-motion: reduce)";
function subscribeMotion(listener: () => void) {
  const query = window.matchMedia(motionQuery);
  query.addEventListener("change", listener);
  return () => query.removeEventListener("change", listener);
}
function motionSnapshot() { return window.matchMedia(motionQuery).matches; }
function serverMotionSnapshot() { return false; }
function machineLabel(name: string) { return name === "server" ? "Server" : name === "bottleneck" ? "Bottleneck" : name.replace("receiver-", "Receiver "); }

export function RealWorldTrafficMap({ job, receivedAt, interrupted }: {
  job: RealWorldJob; receivedAt: number; interrupted: boolean;
}) {
  const id = useId();
  const canvas = useRef<HTMLDivElement>(null);
  const drag = useRef<{ pointer: number; x: number; y: number; camera: MapCamera; scale: number } | null>(null);
  const [size, setSize] = useState({ width: 1000, height: 400 });
  const [camera, setCamera] = useState<MapCamera | null>(null);
  const [selected, setSelected] = useState("all");
  const [paused, setPaused] = useState(false);
  const [now, setNow] = useState(receivedAt);
  const reducedMotion = useSyncExternalStore(subscribeMotion, motionSnapshot, serverMotionSnapshot);
  const topology = useMemo(() => realWorldTopology(job), [job]);
  const viewport = mapViewport(camera ?? fitTopology(topology.markers, size), size);
  const clusters = clusterRegions(topology.markers, viewport.scale);
  const phase = realWorldTrafficPhase(job, Math.max(now, receivedAt), receivedAt, interrupted);
  const animated = phase.active && !paused && !reducedMotion;
  const machine = topology.nodes.find((node) => node.name === selected);
  const result = job.results?.find((item) => item.receiver === selected);
  const items = [{ value: "all", label: "All machines" }, ...topology.nodes.map((node) => ({ value: node.name, label: `${machineLabel(node.name)} · ${node.region}` }))];

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    if (!canvas.current) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry.contentRect.width && entry.contentRect.height) setSize({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(canvas.current);
    return () => observer.disconnect();
  }, []);

  function move(next: MapCamera) {
    const clamped = mapViewport(next, size);
    setCamera({ x: clamped.x, y: clamped.y, zoom: clamped.zoom });
  }
  function zoom(factor: number) { move({ x: viewport.x, y: viewport.y, zoom: viewport.zoom * factor }); }
  function inspect(name: string) {
    setSelected(name);
    if (name === "all") { setCamera(null); return; }
    const region = topology.nodes.find((node) => node.name === name)?.region;
    const marker = topology.markers.find((item) => item.region === region);
    if (marker) move({ ...marker, zoom: Math.max(4, viewport.zoom) });
  }

  return <Card>
    <CardHeader className="gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3"><CardTitle>Traffic topology</CardTitle>
        <Badge variant={phase.active ? "default" : "secondary"} data-testid="traffic-phase">{phase.label}</Badge></div>
      <p className="text-sm text-muted-foreground">Server → shared bottleneck → {job.config.receivers.length === 1 ? "receiver" : `${job.config.receivers.length} receivers`}. All test traffic traverses the bottleneck; acknowledgments return along the reverse path.</p>
    </CardHeader>
    <CardContent className="space-y-4">
      <div className="overflow-hidden rounded-md border">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-muted/30 p-2">
          <div className="flex flex-wrap items-center gap-1" role="group" aria-label="Traffic map controls">
            <Button type="button" variant="outline" size="icon-sm" aria-label="Zoom in" title="Zoom in" disabled={viewport.zoom >= MAX_MAP_ZOOM} onClick={() => zoom(2)}><Plus /></Button>
            <Button type="button" variant="outline" size="icon-sm" aria-label="Zoom out" title="Zoom out" disabled={viewport.zoom <= 1} onClick={() => zoom(0.5)}><Minus /></Button>
            <Button type="button" variant="outline" size="sm" onClick={() => setCamera(null)}><LocateFixed />Fit topology</Button>
            <Button type="button" variant="outline" size="sm" onClick={() => move(WORLD_CAMERA)}><Globe2 />World</Button>
          </div>
          <Button type="button" variant="outline" size="sm" disabled={reducedMotion} aria-pressed={paused || reducedMotion}
            onClick={() => setPaused((value) => !value)}>{paused || reducedMotion ? <Play /> : <Pause />}{reducedMotion ? "Reduced motion" : paused ? "Resume animation" : "Pause animation"}</Button>
        </div>
        <div ref={canvas} role="group" aria-label="Interactive traffic map" aria-describedby={`${id}-instructions`} tabIndex={0}
          className="relative h-80 touch-none overflow-hidden bg-background outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:h-[26rem] cursor-grab active:cursor-grabbing"
          onKeyDown={(event) => {
            if (event.target !== event.currentTarget) return;
            const step = 60 / viewport.scale;
            const directions: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
            if (directions[event.key]) {
              event.preventDefault();
              const [dx, dy] = directions[event.key];
              move({ x: viewport.x + dx, y: viewport.y + dy, zoom: viewport.zoom });
            } else if (["+", "=", "-", "Home"].includes(event.key)) {
              event.preventDefault();
              if (event.key === "Home") setCamera(null); else zoom(event.key === "-" ? 0.5 : 2);
            }
          }}
          onPointerDown={(event) => {
            if (!event.isPrimary || event.button !== 0 || (event.target as Element).closest("button")) return;
            event.currentTarget.focus({ preventScroll: true });
            event.currentTarget.setPointerCapture(event.pointerId);
            drag.current = { pointer: event.pointerId, x: event.clientX, y: event.clientY, camera: { x: viewport.x, y: viewport.y, zoom: viewport.zoom }, scale: viewport.scale };
          }}
          onPointerMove={(event) => {
            const start = drag.current;
            if (start?.pointer !== event.pointerId) return;
            move({ x: start.camera.x - (event.clientX - start.x) / start.scale, y: start.camera.y - (event.clientY - start.y) / start.scale, zoom: start.camera.zoom });
          }}
          onPointerUp={(event) => { if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); }}
          onLostPointerCapture={() => { drag.current = null; }}>
          <svg aria-hidden="true" className="pointer-events-none absolute inset-0 size-full" viewBox={`${viewport.left} ${viewport.top} ${viewport.width} ${viewport.height}`}>
            <defs><clipPath id={`${id}-world`}><rect width="1000" height="500" /></clipPath></defs>
            <g className="stroke-border/60" strokeWidth="0.5">
              {[0, 60, 120, 180, 240, 300, 360].map((longitude) => <path key={longitude} d={`M${longitude / 360 * 1000} 0V500`} vectorEffect="non-scaling-stroke" />)}
              {[30, 60, 90, 120, 150].map((latitude) => <path key={latitude} d={`M0 ${latitude / 180 * 500}H1000`} vectorEffect="non-scaling-stroke" />)}
            </g>
            {land}
            <g clipPath={`url(#${id}-world)`} fill="none">
              {topology.links.map((link) => {
                const geometry = trafficPath(link.source, link.target, viewport.scale);
                const highlighted = selected === "all" || selected === "server" || selected === "bottleneck" || link.flows.some((flow) => flow.to === selected || flow.from === "server");
                return <g key={link.key} className={cn("text-primary", !highlighted && "opacity-20")} data-route={link.key}>
                  {geometry.offsets.map((offset) => <g key={offset} transform={`translate(${offset} 0)`}>
                    <path d={geometry.path} stroke="currentColor" strokeWidth="1.5" strokeOpacity="0.45" vectorEffect="non-scaling-stroke" />
                    <path d={geometry.path} stroke="currentColor" strokeWidth="3" strokeLinecap="round" pathLength="100" strokeDasharray="1 19"
                      vectorEffect="non-scaling-stroke" className="traffic-flow" style={{ opacity: phase.active ? 1 : 0, animationPlayState: animated ? "running" : "paused" }} />
                    <path d="M-4 -4L3 0L-4 4" stroke="currentColor" strokeWidth="1.5" transform={`translate(${geometry.arrow.x} ${geometry.arrow.y}) rotate(${geometry.arrow.angle}) scale(${1 / viewport.scale})`} />
                  </g>)}
                </g>;
              })}
            </g>
          </svg>
          {clusters.map((cluster) => {
            const x = (cluster.x - viewport.left) * viewport.scale, y = (cluster.y - viewport.top) * viewport.scale;
            if (x < 0 || x > size.width || y < 0 || y > size.height) return null;
            const grouped = cluster.regions.length > 1;
            const members = topology.nodes.filter((node) => cluster.regions.some((region) => region.region === node.region));
            const active = members.some((node) => node.name === selected);
            const Icon = members.some((node) => node.role === "server") ? Server : members.some((node) => node.role === "bottleneck") ? Network : Download;
            const description = grouped ? `Zoom to ${cluster.regions.length} Regions: ${cluster.regions.map((region) => region.name).join(", ")}`
              : `Inspect ${cluster.regions[0].name}: ${members.map((node) => machineLabel(node.name)).join(", ")}`;
            return <div key={cluster.regions.map((region) => region.region).join(",")} className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2"
              style={{ left: `${x / size.width * 100}%`, top: `${y / size.height * 100}%` }}>
              <Button type="button" variant={active ? "default" : "outline"} size="icon-sm" title={description} aria-label={description} aria-pressed={grouped ? undefined : active}
                className="pointer-events-auto relative rounded-full border-primary text-primary shadow-sm aria-pressed:text-primary-foreground"
                onClick={() => {
                  if (grouped) { move({ x: cluster.x, y: cluster.y, zoom: viewport.zoom * 2 }); canvas.current?.focus({ preventScroll: true }); }
                  else setSelected(members[0].name);
                }}>
                <Icon />{members.length > 1 && <span aria-hidden="true" className="absolute -right-2 -top-2 rounded-full border bg-background px-1 text-[10px] leading-4 text-foreground">{members.length}</span>}
              </Button>
              {!grouped && <span className="absolute left-1/2 top-full mt-1 -translate-x-1/2 whitespace-nowrap rounded bg-background/90 px-1 text-[10px] font-medium">{cluster.regions[0].name}</span>}
            </div>;
          })}
        </div>
        <div className="space-y-1 border-t bg-muted/20 px-3 py-3 text-xs text-muted-foreground">
          <p id={`${id}-instructions`}>Drag to pan; use + / − to zoom. Keyboard: arrow keys pan, + / − zoom, Home fits the topology. Select a location to inspect its machines.</p>
          <p>Paths are schematic between approximate AWS Region locations; animation speed is illustrative. Loops represent traffic within one Region. Measured throughput appears after collection.</p>
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-[minmax(0,18rem)_1fr]">
        <div className="space-y-2"><label htmlFor={`${id}-machine`} className="text-sm font-medium">Inspect machine</label>
          <Select items={items} value={selected} onValueChange={(value) => { if (value) inspect(value); }}>
            <SelectTrigger id={`${id}-machine`} className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>{items.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div aria-live="polite" className="min-w-0 rounded-md border p-3 text-sm">
          {machine ? <>
            <p className="font-medium">{machineLabel(machine.name)} · {REGION_LOCATIONS[machine.region]?.name ?? machine.region}</p>
            <p className="mt-1 break-words text-xs text-muted-foreground">{machine.region} / {machine.zone_id} · {machine.instance_type}</p>
            <p className="mt-1 break-all text-xs text-muted-foreground">{machine.instance_id ?? "Instance pending"} · {machine.state ?? "Pending"}</p>
            {result && <p className="mt-2 font-medium">Measured throughput: {result.received_mbit_per_second.toFixed(3)} Mbit/s</p>}
            {topology.nodes.filter((node) => node.region === machine.region).length > 1 && <div className="mt-3 flex flex-wrap gap-1" role="group" aria-label="Machines in this Region">
              {topology.nodes.filter((node) => node.region === machine.region).map((node) => <Button key={node.name} type="button" size="xs" variant={node.name === selected ? "secondary" : "ghost"} aria-pressed={node.name === selected} onClick={() => setSelected(node.name)}>{machineLabel(node.name)}</Button>)}
            </div>}
          </> : <><p className="font-medium">{topology.nodes.length} machines · {new Set(topology.nodes.map((node) => node.region)).size} Regions</p>
            <p className="mt-1 text-xs text-muted-foreground">Select a machine to highlight its data path and inspect its placement. Machines in the same Region share a marker.</p></>}
        </div>
      </div>
      {topology.unmapped.length > 0 && <p className="text-xs text-muted-foreground">Map coordinates unavailable for {topology.unmapped.map((node) => `${machineLabel(node.name)} (${node.region})`).join(", ")}. These machines remain available in the inspector; their paths are omitted.</p>}
    </CardContent>
  </Card>;
}
