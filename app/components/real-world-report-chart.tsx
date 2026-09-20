"use client";

import { useId, useState } from "react";
import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/app/components/ui/card";
import { displayNumber } from "@/lib/real-world-reports";

export type ReportSeries = { label: string; points: { x: number; y: number | null }[] };
const WIDTH = 700, HEIGHT = 250, LEFT = 64, RIGHT = 16, TOP = 14, BOTTOM = 36;
const color = (index: number) => `var(--chart-${index % 5 + 1})`;
const dash = (index: number) => [undefined, "7 3", "2 3", "9 3 2 3"][Math.floor(index / 5) % 4];

export function RealWorldReportChart({ title, unit, clock, description, series, scheduledEnd }: {
  title: string; unit: string; clock: string; description: string; series: ReportSeries[]; scheduledEnd?: number;
}) {
  const id = useId();
  const [hidden, setHidden] = useState<string[]>([]);
  const [cursor, setCursor] = useState<number | null>(null);
  const visible = series.filter(s => !hidden.includes(s.label));
  const timeline = visible.flatMap(s => s.points).filter(p => Number.isFinite(p.x));
  const points = timeline.filter(p => p.y !== null && Number.isFinite(p.y));
  const maxX = Math.max(1, scheduledEnd ?? 0, ...timeline.map(p => p.x));
  const maxY = Math.max(.001, ...points.map(p => p.y as number)) * 1.08;
  const x = (value: number) => LEFT + value / maxX * (WIDTH - LEFT - RIGHT);
  const y = (value: number) => TOP + (1 - value / maxY) * (HEIGHT - TOP - BOTTOM);
  const selectedX = cursor === null ? null : cursor / 1000 * maxX;
  function path(data: ReportSeries["points"]) {
    let drawing = false;
    return data.map(point => {
      if (point.y === null || !Number.isFinite(point.y) || !Number.isFinite(point.x)) { drawing = false; return ""; }
      const command = `${drawing ? "L" : "M"}${x(point.x).toFixed(2)},${y(point.y).toFixed(2)}`;
      drawing = true;
      return command;
    }).join(" ");
  }
  return <Card className="min-w-0 break-inside-avoid">
    <CardHeader><CardTitle>{title}</CardTitle><p className="text-xs leading-5 text-muted-foreground">{description}</p></CardHeader>
    <CardContent className="space-y-3">
      <div className="flex flex-wrap gap-1" aria-label={`${title} series`}>
        {series.map((s, i) => <Button key={s.label} type="button" variant="ghost" size="sm" aria-pressed={!hidden.includes(s.label)}
          className="h-7 gap-2 px-2 text-xs" onClick={() => setHidden(old => old.includes(s.label) ? old.filter(label => label !== s.label) : [...old, s.label])}>
          <svg aria-hidden="true" width="22" height="8" className="!h-2 !w-[22px]"><line x1="0" y1="4" x2="22" y2="4" stroke={color(i)} strokeWidth="2" strokeDasharray={dash(i)} /></svg>{s.label}
        </Button>)}
      </div>
      {!points.length ? <p className="flex h-48 items-center justify-center text-sm text-muted-foreground">No recorded samples for the selected series.</p> : <>
        <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-labelledby={`${id}-title ${id}-description`} className="block w-full overflow-visible"
          onPointerMove={event => { const rect = event.currentTarget.getBoundingClientRect(); const position = (event.clientX - rect.left) / rect.width * WIDTH; setCursor(Math.round(Math.max(0, Math.min(1, (position - LEFT) / (WIDTH - LEFT - RIGHT))) * 1000)); }}>
          <title id={`${id}-title`}>{title} ({unit})</title><desc id={`${id}-description`}>{description} Horizontal axis: {clock}. Values can be inspected with the time slider or downloaded as CSV.</desc>
          {Array.from({ length: 5 }, (_, i) => <g key={i}>
            <line x1={LEFT} x2={WIDTH - RIGHT} y1={y(maxY * i / 4)} y2={y(maxY * i / 4)} stroke="var(--border)" />
            <text x={LEFT - 9} y={y(maxY * i / 4) + 4} textAnchor="end" fill="var(--muted-foreground)" fontSize="11">{displayNumber(maxY * i / 4, maxY < 2 ? 2 : 1)}</text>
            <text x={x(maxX * i / 4)} y={HEIGHT - 12} textAnchor="middle" fill="var(--muted-foreground)" fontSize="11">{displayNumber(maxX * i / 4, 1)}</text>
          </g>)}
          <text x={LEFT} y={10} fill="var(--muted-foreground)" fontSize="10">{unit}</text>
          {scheduledEnd !== undefined && <g>
            <line x1={x(scheduledEnd)} x2={x(scheduledEnd)} y1={TOP} y2={HEIGHT - BOTTOM} stroke="var(--muted-foreground)" strokeDasharray="5 4" opacity=".6" />
            <text x={x(scheduledEnd) - 4} y={10} textAnchor="end" fill="var(--muted-foreground)" fontSize="10">Scheduled end</text>
          </g>}
          {series.map((s, index) => hidden.includes(s.label) ? null : <path key={s.label} d={path(s.points)} fill="none" stroke={color(index)} strokeWidth="1.8" strokeDasharray={dash(index)} />)}
          {series.map((s, index) => hidden.includes(s.label) ? null : s.points.map((point, i, data) =>
            point.y !== null && Number.isFinite(point.y) && Number.isFinite(point.x) && data[i - 1]?.y == null && data[i + 1]?.y == null
              ? <circle key={`${s.label}-${i}`} cx={x(point.x)} cy={y(point.y)} r="2.5" fill={color(index)} /> : null))}
          {selectedX !== null && <line x1={x(selectedX)} x2={x(selectedX)} y1={TOP} y2={HEIGHT - BOTTOM} stroke="var(--foreground)" opacity=".35" strokeDasharray="3 3" />}
        </svg>
        <p className="text-center text-xs text-muted-foreground">{clock}</p>
        <Input type="range" min={0} max={1000} step={1} value={cursor ?? 0} className="h-5 border-0 px-0 shadow-none print:hidden"
          aria-label={`Inspect ${title} at a time`} onChange={event => setCursor(Number(event.target.value))} />
        <div className="min-h-5 text-xs text-muted-foreground print:hidden" aria-live="polite">
          {selectedX === null ? "Move over the chart or use the time slider to inspect samples." : <div className="flex flex-wrap gap-x-4 gap-y-1">
            {visible.map(s => {
              const nearest = s.points.reduce<(typeof s.points)[number] | null>((best, point) => !best || Math.abs(point.x - selectedX) < Math.abs(best.x - selectedX) ? point : best, null);
              return <span key={s.label}>{s.label}: {displayNumber(nearest?.y)} {unit} at {displayNumber(nearest?.x, 2)} s</span>;
            })}
          </div>}
        </div>
      </>}
    </CardContent>
  </Card>;
}
