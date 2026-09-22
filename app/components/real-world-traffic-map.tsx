"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Download, Globe2, LocateFixed, Minus, Network, Pause, Play, Plus, Server } from "lucide-react";
import { Badge } from "@/app/components/ui/badge";
import { Button } from "@/app/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/app/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/app/components/ui/select";
import { clusterRegions, fitTopology, mapCopies, mapPointCopies, mapViewport, MAX_MAP_ZOOM, realWorldTopology, REGION_LOCATIONS, trafficPath, WORLD_CAMERA, type MapCamera } from "@/lib/aws-region-map";
import { realWorldTrafficPhase, type RealWorldJob } from "@/lib/real-world";
import { WorldMapTiles } from "@/app/components/world-map-tiles";
import { useMapWheelPan } from "@/app/components/use-map-wheel-pan";
import { cn } from "@/lib/utils";

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
  const topology = useMemo(() => realWorldTopology(job), [job]);
  const viewport = mapViewport(camera ?? fitTopology(topology.markers, size), size);
  const clusters = clusterRegions(topology.markers, viewport.scale);
  const phase = realWorldTrafficPhase(job, Math.max(now, receivedAt), receivedAt, interrupted);
  const animated = phase.active && !paused;
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
    const wrapped = mapViewport(next, size);
    setCamera({ x: wrapped.x, y: wrapped.y, zoom: wrapped.zoom });
  }
  useMapWheelPan(canvas, viewport, move);
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
      <p className="text-sm text-muted-foreground">Server → shared bottleneck → {job.config.receivers.length === 1 ? "receiver" : `${job.config.receivers.length} receivers`}.</p>
      <div className="hidden flex-wrap gap-x-5 gap-y-2 text-xs dark:flex" aria-label="Map legend">
        <span className="flex items-center gap-2 text-primary"><Server aria-hidden="true" className="size-3.5" />Server</span>
        <span className="flex items-center gap-2 text-highlight"><Network aria-hidden="true" className="size-3.5" />Bottleneck</span>
        <span className="flex items-center gap-2 text-success"><Download aria-hidden="true" className="size-3.5" />Receiver</span>
      </div>
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
          <Button type="button" variant="outline" size="sm" aria-pressed={paused}
            onClick={() => setPaused((value) => !value)}>{paused ? <Play /> : <Pause />}{paused ? "Resume animation" : "Pause animation"}</Button>
        </div>
        <div ref={canvas} role="group" aria-label="Interactive traffic map" tabIndex={0}
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
            <WorldMapTiles viewport={viewport} />
            <g fill="none">
              {topology.links.map((link) => {
                const geometry = trafficPath(link.source, link.target, viewport.scale);
                const highlighted = selected === "all" || selected === "server" || selected === "bottleneck" || link.flows.some((flow) => flow.to === selected || flow.from === "server");
                return <g key={link.key} className={cn("text-primary",
                  !link.flows.some((flow) => flow.from === "server") && "dark:text-success",
                  !highlighted && "opacity-20")} data-route={link.key}>
                  {mapCopies(geometry.bounds, viewport, 5).map((copy) => <g key={copy.key} transform={`translate(${copy.x} ${copy.y})`}>
                    <path d={geometry.path} stroke="currentColor" strokeWidth="1.5" strokeOpacity="0.45" vectorEffect="non-scaling-stroke" />
                    <path d={geometry.path} stroke="currentColor" strokeWidth="3" strokeLinecap="round" pathLength="100" strokeDasharray="1 19"
                      vectorEffect="non-scaling-stroke" className="traffic-flow dark:drop-shadow-[0_0_3px_currentColor]" style={{ opacity: phase.active ? 1 : 0, animationPlayState: animated ? "running" : "paused" }} />
                    <path d="M-4 -4L3 0L-4 4" stroke="currentColor" strokeWidth="1.5" transform={`translate(${geometry.arrow.x} ${geometry.arrow.y}) rotate(${geometry.arrow.angle}) scale(${1 / viewport.scale})`} />
                  </g>)}
                </g>;
              })}
            </g>
          </svg>
          {clusters.flatMap((cluster) => mapPointCopies(cluster, viewport).map((copy) => {
            const x = (copy.x - viewport.left) * viewport.scale, y = (copy.y - viewport.top) * viewport.scale;
            const grouped = cluster.regions.length > 1;
            const members = topology.nodes.filter((node) => cluster.regions.some((region) => region.region === node.region));
            const active = members.some((node) => node.name === selected);
            const role = members.some((node) => node.role === "server") ? "server" : members.some((node) => node.role === "bottleneck") ? "bottleneck" : "receiver";
            const Icon = role === "server" ? Server : role === "bottleneck" ? Network : Download;
            const description = grouped ? `Zoom to ${cluster.regions.length} Regions: ${cluster.regions.map((region) => region.name).join(", ")}`
              : `Inspect ${cluster.regions[0].name}: ${members.map((node) => machineLabel(node.name)).join(", ")}`;
            return <div key={`${cluster.regions.map((region) => region.region).join(",")}:${copy.key}`} className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2"
              style={{ left: `${x / size.width * 100}%`, top: `${y / size.height * 100}%` }}>
              <Button type="button" variant={active ? "default" : "outline"} size="icon-sm" title={description} aria-label={description} aria-pressed={grouped ? undefined : active}
                className={cn("pointer-events-auto relative rounded-full border-primary text-primary shadow-sm aria-pressed:text-primary-foreground",
                  active && "dark:text-primary-foreground",
                  role === "bottleneck" && "dark:border-highlight",
                  role === "bottleneck" && (active ? "dark:bg-highlight dark:text-primary-foreground" : "dark:text-highlight"),
                  role === "receiver" && "dark:border-success",
                  role === "receiver" && (active ? "dark:bg-success dark:text-primary-foreground" : "dark:text-success"))}
                onClick={() => {
                  if (grouped) { move({ x: cluster.x, y: cluster.y, zoom: viewport.zoom * 2 }); canvas.current?.focus({ preventScroll: true }); }
                  else setSelected(members[0].name);
                }}>
                <Icon />{members.length > 1 && <span aria-hidden="true" className="absolute -right-2 -top-2 rounded-full border bg-background px-1 text-[10px] leading-4 text-foreground">{members.length}</span>}
              </Button>
              {!grouped && <span className="absolute left-1/2 top-full mt-1 -translate-x-1/2 whitespace-nowrap rounded bg-background/90 px-1 text-[10px] font-medium">{cluster.regions[0].name}</span>}
            </div>;
          }))}
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
