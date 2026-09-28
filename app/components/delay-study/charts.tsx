import { ccaName, formatStudyNumber as fmt, type StudySummary, type StudySample } from "@/lib/delay-study";

export function SensitivityChart({ summaries }: { summaries: StudySummary[] }) {
  const width = 700, left = 125, right = 34, rowHeight = 78, height = summaries.length * rowHeight + 65;
  const max = Math.max(1, ...summaries.flatMap(s => [s.baseline_ci_high ?? 0, s.baseline_delta ?? 0, s.treatment_ci_high ?? 0, s.treatment_delta ?? 0]));
  const ceiling = Math.ceil(max * 1.1 * 2) / 2;
  const x = (value: number) => left + value / ceiling * (width - left - right);
  return <svg role="img" aria-label="Per-flow delay sensitivity with 95 percent whole-trial bootstrap confidence intervals" viewBox={`0 0 ${width} ${height}`} className="w-full min-w-80 text-xs">
    <title>Delay sensitivity, δ = log₂(maximum / minimum mean goodput)</title>
    {[0, 1, 2, 3, 4].map(tick => {
      const value = ceiling * tick / 4;
      return <g key={tick}><line x1={x(value)} x2={x(value)} y1={18} y2={height - 42} stroke="var(--border)" /><text x={x(value)} y={height - 24} textAnchor="middle" fill="var(--muted-foreground)">{fmt(value, 1)}</text></g>;
    })}
    {summaries.map((s, index) => <g key={s.flow_index}>
      <text x={left - 12} y={index * rowHeight + 42} textAnchor="end" fill="currentColor">{ccaName(s.cca)} · flow {s.flow_index}</text>
      {(["baseline", "treatment"] as const).map((condition, c) => {
        const estimate = s[`${condition}_delta`], lo = s[`${condition}_ci_low`], hi = s[`${condition}_ci_high`];
        const y = index * rowHeight + 28 + c * 25, color = `var(--chart-${c + 2})`;
        if (estimate == null) return <text key={condition} x={left + 10} y={y + 4} fill="var(--muted-foreground)">{s.unbounded ? "Unbounded / undefined" : "No estimate"}</text>;
        return <g key={condition}><title>{`${condition}: ${fmt(estimate)}, 95% CI ${fmt(lo)}–${fmt(hi)}`}</title>
          {lo != null && hi != null && <><line x1={x(lo)} x2={x(hi)} y1={y} y2={y} stroke={color} strokeWidth={2} /><line x1={x(lo)} x2={x(lo)} y1={y - 4} y2={y + 4} stroke={color} /><line x1={x(hi)} x2={x(hi)} y1={y - 4} y2={y + 4} stroke={color} /></>}
          {c === 0 ? <circle cx={x(estimate)} cy={y} r={5} fill={color} /> : <rect x={x(estimate) - 5} y={y - 5} width={10} height={10} fill={color} />}
        </g>;
      })}
    </g>)}
    <text x={(left + width - right) / 2} y={height - 3} textAnchor="middle" fill="var(--muted-foreground)">Delay sensitivity δ · lower is less sensitive</text>
  </svg>;
}

export function GoodputTrace({ samples, warmupSeconds }: { samples: StudySample[]; warmupSeconds: number }) {
  if (!samples.length) return <p className="text-sm text-muted-foreground">No receiver intervals have been recorded for this trial.</p>;
  const flows = [...new Set(samples.map(s => s.flow_index))].sort((a, b) => a - b);
  const width = 760, height = 310, left = 55, right = 15, top = 20, bottom = 45;
  const maxTime = Math.max(...samples.map(s => s.end_seconds));
  const maxRate = Math.max(1, ...samples.map(s => s.goodput_mbps)) * 1.05;
  const x = (v: number) => left + v / maxTime * (width - left - right);
  const y = (v: number) => height - bottom - v / maxRate * (height - top - bottom);
  return <div>
    <svg role="img" aria-label="Receiver goodput over time, by flow" viewBox={`0 0 ${width} ${height}`} className="w-full min-w-80 text-xs">
      <title>Per-second receiver goodput in Mbps; shaded region is excluded warm-up</title>
      <rect x={left} y={top} width={x(Math.min(warmupSeconds, maxTime)) - left} height={height - top - bottom} fill="var(--muted)" />
      {[0, 1, 2, 3, 4].map(t => <g key={t}>
        <line x1={left} x2={width - right} y1={y(maxRate * t / 4)} y2={y(maxRate * t / 4)} stroke="var(--border)" />
        <text x={left - 7} y={y(maxRate * t / 4) + 4} textAnchor="end" fill="var(--muted-foreground)">{fmt(maxRate * t / 4, 0)}</text>
        <text x={x(maxTime * t / 4)} y={height - 25} textAnchor="middle" fill="var(--muted-foreground)">{fmt(maxTime * t / 4, 0)}</text>
      </g>)}
      {flows.map(flow => <polyline key={flow} fill="none" stroke={`var(--chart-${flow})`} strokeWidth={1.6} points={samples.filter(s => s.flow_index === flow).sort((a, b) => a.end_seconds - b.end_seconds).map(s => `${x(s.end_seconds)},${y(s.goodput_mbps)}`).join(" ")} />)}
      <text x={left} y={12} fill="var(--muted-foreground)">Mbps</text><text x={width / 2} y={height - 3} textAnchor="middle" fill="var(--muted-foreground)">Elapsed seconds</text>
    </svg>
    <div className="mt-3 flex flex-wrap gap-4 text-xs">{flows.map(flow => <span key={flow} className="flex items-center gap-2"><span className="h-0.5 w-5" style={{ background: `var(--chart-${flow})` }} />Flow {flow}</span>)}<span className="text-muted-foreground">Warm-up: first {warmupSeconds} s excluded from estimates</span></div>
  </div>;
}
