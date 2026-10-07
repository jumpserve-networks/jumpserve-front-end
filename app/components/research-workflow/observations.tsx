import { recordText, valueLabel, type ResearchRecord } from "@/lib/research-workflow";

export function ObservationPlots({ rows }: { rows: ResearchRecord[] }) {
  const groups = new Map<string, ResearchRecord[]>();
  for (const row of rows) {
    const key = `${recordText(row, "metric")} / ${recordText(row, "units")}`;
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  return <div className="grid gap-4 xl:grid-cols-2">{[...groups].slice(0, 4).map(([metric, observations]) => {
    const cells = observations.map(row => {
      const details = row.details && typeof row.details === "object" ? row.details as Record<string, unknown> : {};
      const published = valueLabel(details.published) === "invalid" || details.published == null ? null : Number(details.published);
      const measured = row.status === "recorded" && valueLabel(row.value) !== "invalid" ? Number(row.value) : null;
      return { row, published, measured };
    });
    const values = cells.flatMap(cell => [cell.published, cell.measured]).filter((value): value is number => value !== null && Number.isFinite(value));
    if (!values.length) return <p key={metric} className="text-sm">{metric}: no finite values to plot; missing values remain missing.</p>;
    const minimum = Math.min(...values), maximum = Math.max(...values);
    const padding = maximum === minimum ? Math.max(Math.abs(maximum) * 0.05, 1) : (maximum - minimum) * 0.1;
    const lower = minimum - padding, upper = maximum + padding;
    if (![lower, upper, upper - lower].every(Number.isFinite)) return <p key={metric} className="text-sm">{metric}: values exceed the plot’s finite scaling range. Exact values remain in the table and export.</p>;
    const x = (index: number) => 64 + index * 460 / Math.max(cells.length - 1, 1);
    const y = (value: number) => 205 - (value - lower) * 165 / (upper - lower);
    return <figure key={metric} className="min-w-0 rounded-lg border p-3"><figcaption className="text-sm font-medium">{metric}</figcaption><svg role="img" aria-label={`Published and reproduced values for ${metric}`} viewBox="0 0 560 250" className="mt-2 w-full"><title>{`${metric}; ${cells.length} observation identities on this page. Points are descriptive; no confidence interval.`}</title>{[lower, (lower + upper) / 2, upper].map((tick, index) => <g key={index}><line x1="64" x2="524" y1={y(tick)} y2={y(tick)} stroke="currentColor" opacity="0.15" /><text x="58" y={y(tick) + 4} textAnchor="end" fontSize="11" fill="currentColor">{tick.toPrecision(3)}</text></g>)}{cells.map((cell, index) => <g key={cell.row.id}><title>{`${recordText(cell.row, "observation_id")} · ${recordText(cell.row, "configuration_identity")}: published ${valueLabel(cell.published)}, reproduced ${cell.measured === null ? recordText(cell.row, "status") : valueLabel(cell.measured)} ${recordText(cell.row, "units")}`}</title>{cell.published !== null ? <circle cx={x(index)} cy={y(cell.published)} r="4" fill="var(--chart-1)" /> : null}{cell.measured !== null ? <rect x={x(index) - 3} y={y(cell.measured) - 3} width="6" height="6" fill="var(--chart-2)" /> : null}</g>)}<text x="280" y="238" textAnchor="middle" fontSize="11" fill="currentColor">Observation identities in table order · not a time axis</text></svg><p className="text-xs text-muted-foreground">● Published · ■ Reproduced. Non-recorded observations have no measured point. Configuration identities and exact values appear in the table. Descriptive points; no inferential interval.</p></figure>;
  })}{groups.size > 4 ? <p className="text-xs">Showing four metric plots; filter a metric to examine another. Table and exports retain all records.</p> : null}</div>;
}
