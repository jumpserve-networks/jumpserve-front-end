"use client";

import { REAL_WORLD_MODULE_PATH } from "@/lib/test-modules";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Button } from "@/app/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/app/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/app/components/ui/table";
import { Choice } from "@/app/components/real-world-placement";
import { compareRealWorldReports, displayNumber, reportCsv, REPORT_METRICS, REPORT_MIN_REPEATS, REPORT_BOOTSTRAP_SAMPLES,
  type RealWorldReport, type ReportMetric, type ReportBlock, type ReportInterval } from "@/lib/real-world-reports";
import { downloadReportFile } from "@/lib/report-download";

function intervalLabel(interval: ReportInterval | null) {
  return interval ? `[${displayNumber(interval.low)}, ${displayNumber(interval.high)}]` : "Insufficient repetitions";
}
function ConfigurationLabel({ report }: { report: RealWorldReport }) {
  const c = report.job.config;
  return <span>{c.rate_mbit} Mbit/s · {c.buffer_kbytes} kB · {c.duration_seconds} s · {c.receivers.length} receivers<br /><span className="text-xs text-muted-foreground">{c.server.region} → {c.bottleneck.region} → {[...new Set(c.receivers.map(r => r.region))].join(", ")}</span></span>;
}
function CohortPlot({ block, baseline, comparison, unit }: { block: ReportBlock; baseline: string; comparison: string; unit: string }) {
  const cohorts = [block.baseline, block.comparison];
  const max = Math.max(.001, ...cohorts.flatMap(c => [...c.values, c.interval?.high ?? 0])) * 1.05;
  const x = (n: number) => 100 + n / max * 520;
  return <svg viewBox="0 0 660 125" role="img" aria-label={`Independent test observations and median confidence intervals in ${unit}; numerical values follow in the table.`} className="w-full">
    {cohorts.map((cohort, i) => <g key={i}>
      <text x="90" y={30 + i * 42} textAnchor="end" fontSize="12" fill="var(--foreground)">{[baseline, comparison][i].toUpperCase()} · n={cohort.count}</text>
      <line x1="100" x2="620" y1={27 + i * 42} y2={27 + i * 42} stroke="var(--border)" />
      {cohort.values.map((value, j) => <circle key={j} cx={x(value)} cy={27 + i * 42 + (j % 5 - 2) * 3} r="3" fill={`var(--chart-${i + 1})`} opacity=".65" />)}
      {cohort.interval && <line x1={x(cohort.interval.low)} x2={x(cohort.interval.high)} y1={27 + i * 42} y2={27 + i * 42} stroke={`var(--chart-${i + 1})`} strokeWidth="3" />}
      {cohort.median !== null && <line x1={x(cohort.median)} x2={x(cohort.median)} y1={16 + i * 42} y2={38 + i * 42} stroke="var(--foreground)" strokeWidth="2" />}
    </g>)}
    {[0, .25, .5, .75, 1].map(f => <text key={f} x={x(max * f)} y="103" textAnchor="middle" fontSize="11" fill="var(--muted-foreground)">{displayNumber(max * f, max < 2 ? 2 : 1)}</text>)}
    <text x="360" y="123" textAnchor="middle" fontSize="11" fill="var(--muted-foreground)">{unit}</text>
  </svg>;
}

export function RealWorldReportComparison({ reports, baseline, comparison, metric }: {
  reports: RealWorldReport[]; baseline: string; comparison: string; metric: ReportMetric;
}) {
  const result = useMemo(() => compareRealWorldReports(reports, baseline, comparison, metric), [reports, baseline, comparison, metric]);
  const [selectedBlock, setSelectedBlock] = useState("0");
  const block = result.blocks[Number(selectedBlock)] ?? result.blocks[0];
  const measure = REPORT_METRICS[metric];
  function exportCsv() {
    downloadReportFile("real-world-comparison.csv", reportCsv([
      ["configuration", "metric", "unit", "baseline", "comparison", "baseline_n", "comparison_n", "baseline_median", "comparison_median", "delta_comparison_minus_baseline", "delta_95ci_low", "delta_95ci_high", "baseline_test_ids", "comparison_test_ids", "configuration_json"],
      ...result.blocks.map((b, i) => [i + 1, metric, measure.unit, baseline, comparison, b.baseline.count, b.comparison.count, b.baseline.median, b.comparison.median, b.delta, b.interval?.low, b.interval?.high, b.baseline.ids.join(";"), b.comparison.ids.join(";"), b.key]),
    ]), "text/csv;charset=utf-8");
  }
  return <div className="space-y-6">
    <Card><CardHeader><CardTitle>Configuration-matched comparison</CardTitle></CardHeader><CardContent className="space-y-4">
      <p className="text-sm">{result.matchedBlocks} matched configurations · {result.excluded.length} excluded tests. Each row keeps the full placement, ordered receiver roles, instance types, rate, buffer, duration, image, kernel, iperf, and measurement runtime fixed. Only server CCA differs.</p>
      <p className="text-sm text-muted-foreground">Outcome: {measure.label.toLowerCase()} ({measure.unit}). Differences are always <strong>{comparison.toUpperCase()} minus {baseline.toUpperCase()}</strong>. Configurations are not pooled. Missing opposite-CCA trials remain visible.</p>
      {!result.blocks.length ? <p className="text-sm text-muted-foreground">No eligible configuration groups. Review the exclusions below or select additional completed tests.</p> : <Table><TableHeader><TableRow>
        <TableHead>Configuration</TableHead><TableHead>{baseline.toUpperCase()} n</TableHead><TableHead>{comparison.toUpperCase()} n</TableHead><TableHead>{baseline.toUpperCase()} median</TableHead><TableHead>{comparison.toUpperCase()} median</TableHead><TableHead>Difference ({measure.unit})</TableHead><TableHead>Difference 95% CI</TableHead>
      </TableRow></TableHeader><TableBody>{result.blocks.map((b, i) => <TableRow key={b.key}>
        <TableCell><Button size="sm" variant="ghost" className="h-auto whitespace-normal px-0 text-left" onClick={() => setSelectedBlock(String(i))}>Group {i + 1}</Button><div className="mt-1"><ConfigurationLabel report={b.example} /></div></TableCell>
        <TableCell>{b.baseline.count}</TableCell><TableCell>{b.comparison.count}</TableCell><TableCell>{displayNumber(b.baseline.median)}</TableCell><TableCell>{displayNumber(b.comparison.median)}</TableCell><TableCell>{b.delta === null ? "No matched contrast" : displayNumber(b.delta)}</TableCell><TableCell>{b.delta === null ? "Unavailable" : intervalLabel(b.interval)}</TableCell>
      </TableRow>)}</TableBody></Table>}
      <div className="flex flex-wrap gap-2 print:hidden"><Button variant="outline" size="sm" onClick={exportCsv} disabled={!result.blocks.length}>Comparison CSV</Button><Button variant="outline" size="sm" onClick={() => downloadReportFile("real-world-comparison.json", JSON.stringify({ analysis: "real-world-comparison-v1", metric, baseline, comparison, bootstrap_samples: REPORT_BOOTSTRAP_SAMPLES, minimum_repetitions: REPORT_MIN_REPEATS, result, reports }, null, 2), "application/json")}>Comparison JSON</Button><Button variant="outline" size="sm" onClick={() => window.print()}>Print / PDF</Button></div>
    </CardContent></Card>
    {block && <Card><CardHeader><CardTitle>Replication coverage</CardTitle></CardHeader><CardContent className="space-y-4">
      <div className="max-w-sm"><Choice label="Inspect configuration" value={String(result.blocks.indexOf(block))} onChange={setSelectedBlock} items={result.blocks.map((b, i) => ({ value: String(i), label: `Group ${i + 1} · ${b.baseline.count} / ${b.comparison.count} tests` }))} /></div>
      <CohortPlot block={block} baseline={baseline} comparison={comparison} unit={measure.unit} />
      <p className="text-xs text-muted-foreground">Each dot is a whole test. Vertical marks show medians; horizontal bars show exploratory 95% median intervals when enough independent repetitions exist.</p>
      <Table><TableHeader><TableRow><TableHead>Algorithm</TableHead><TableHead>Independent tests</TableHead><TableHead>Median ({measure.unit})</TableHead><TableHead>Median 95% CI</TableHead></TableRow></TableHeader><TableBody>
        {[[baseline, block.baseline], [comparison, block.comparison]].map(([name, cohort]) => { const c = cohort as ReportBlock["baseline"]; return <TableRow key={name as string}><TableCell>{(name as string).toUpperCase()}</TableCell><TableCell>{c.count}</TableCell><TableCell>{displayNumber(c.median)}</TableCell><TableCell>{intervalLabel(c.interval)}</TableCell></TableRow>; })}
      </TableBody></Table>
      {block.baseline.count !== block.comparison.count && <p className="text-sm text-muted-foreground">Replication counts are unbalanced. All observed tests are retained; the chart does not correct the collection imbalance.</p>}
      <dl className="grid gap-3 text-sm sm:grid-cols-2">{[block.example.job.config.server, block.example.job.config.bottleneck, ...block.example.job.config.receivers].map((p, i) => <div key={i}><dt className="text-muted-foreground">{i === 0 ? "Server" : i === 1 ? "Bottleneck" : `Receiver ${i - 1}`}</dt><dd>{p.region} · {p.zone_id} · {p.instance_type}</dd></div>)}</dl>
      <p className="text-xs text-muted-foreground">{block.example.job.config.duration_seconds} s · {block.example.job.config.rate_mbit} Mbit/s · {block.example.job.config.buffer_kbytes} kB. Full matching configuration and source provenance are included in the JSON export.</p>
      <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs">{[...block.baseline.ids, ...block.comparison.ids].map(id => <Link key={id} href={`${REAL_WORLD_MODULE_PATH}/test-results/${id}`} className="font-mono text-primary underline underline-offset-4">{id.slice(0, 8)}</Link>)}</div>
    </CardContent></Card>}
    {result.excluded.length > 0 && <Card><CardHeader><CardTitle>Excluded tests</CardTitle></CardHeader><CardContent><Table><TableHeader><TableRow><TableHead>Test</TableHead><TableHead>Reason</TableHead></TableRow></TableHeader><TableBody>{result.excluded.map((e, i) => <TableRow key={`${e.jobId}-${i}`}><TableCell><Link href={`${REAL_WORLD_MODULE_PATH}/test-results/${e.jobId}`} className="font-mono text-xs text-primary underline">{e.jobId.slice(0, 8)}</Link></TableCell><TableCell className="whitespace-normal">{e.reason}</TableCell></TableRow>)}</TableBody></Table></CardContent></Card>}
    <Card><CardHeader><CardTitle>Interpretation and method</CardTitle></CardHeader><CardContent className="space-y-2 text-sm text-muted-foreground">
      <p>Each algorithm’s estimate is the median of whole-test outcomes within one recorded configuration. Intervals use {REPORT_BOOTSTRAP_SAMPLES.toLocaleString()} deterministic percentile bootstrap resamples, independently within each algorithm. At least {REPORT_MIN_REPEATS} tests per algorithm are required for a difference interval; fewer tests retain descriptive estimates.</p>
      <p>Intervals are exploratory, pointwise, and assume independent tests. Sparse or constant samples may give unreliable intervals. Failed and incomplete tests are excluded, so estimates describe completed transfers. No randomized assignment or paired-trial identifier is recorded; no pairs or causal effects are inferred.</p>
      <p>Matching recorded AWS placements does not fix Internet routes, host contention, or time-of-day conditions. Combined throughput sums per-flow transfer averages; Jain’s index describes their balance, not instantaneous fairness. Trace samples are never counted as extra repetitions.</p>
    </CardContent></Card>
  </div>;
}
