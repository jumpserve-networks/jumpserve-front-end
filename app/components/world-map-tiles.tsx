"use client";

import { useId } from "react";
import { mapCopies, WORLD_HEIGHT, WORLD_WIDTH, type MapViewport } from "@/lib/aws-region-map";
import landPaths from "@/lib/maps/world-land.json";

const world = <>
  <g className="stroke-border/60" strokeWidth="0.5">
    {[0, 60, 120, 180, 240, 300, 360].map((longitude) => <path key={longitude} d={`M${longitude / 360 * WORLD_WIDTH} 0V${WORLD_HEIGHT}`} vectorEffect="non-scaling-stroke" />)}
    {[0, 30, 60, 90, 120, 150, 180].map((latitude) => <path key={latitude} d={`M0 ${latitude / 180 * WORLD_HEIGHT}H${WORLD_WIDTH}`} vectorEffect="non-scaling-stroke" />)}
  </g>
  <g className="fill-muted-foreground/15 stroke-muted-foreground/30" strokeWidth="0.6">
    {landPaths.map((path, index) => <path key={index} d={path} fillRule="evenodd" vectorEffect="non-scaling-stroke" />)}
  </g>
</>;

export function WorldMapTiles({ viewport }: { viewport: MapViewport }) {
  const id = useId();
  const copies = mapCopies({ left: 0, top: 0, right: WORLD_WIDTH, bottom: WORLD_HEIGHT }, viewport);
  return <>
    <defs><g id={id}>{world}</g></defs>
    {copies.map((copy) => <use key={copy.key} href={`#${id}`} x={copy.x} y={copy.y} />)}
  </>;
}
