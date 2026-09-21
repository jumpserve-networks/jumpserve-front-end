"use client";

import { REAL_WORLD_MODULE_PATH } from "@/lib/test-modules";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/app/components/ui/button";
import { Checkbox } from "@/app/components/ui/checkbox";
import { Badge } from "@/app/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/app/components/ui/card";
import { Input } from "@/app/components/ui/input";
import { Label } from "@/app/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/app/components/ui/table";
import { Choice } from "@/app/components/real-world-placement";
import { RealWorldReportComparison } from "@/app/components/real-world-report-comparison";
import { realWorldRequest } from "@/lib/real-world-api";
import { REAL_WORLD_CCAS, type RealWorldJob } from "@/lib/real-world";
import { dateUtc, displayNumber, filterReportJobs, parseReportSelection, MAX_REPORT_SELECTION, REPORT_METRICS,
  type RealWorldReport, type ReportMetric } from "@/lib/real-world-reports";

type History = { tests: RealWorldJob[]; cursor: string | null };
export function RealWorldReports() {
  const params = useSearchParams();
  const selected = useMemo(() => parseReportSelection(params.get("selected")), [params]);
  const selectionKey = [...selected].sort().join(",");
  const filters = { search: params.get("search") ?? "", cca: params.get("cca") ?? "", region: params.get("region") ?? "", status: params.get("status") ?? "", from: params.get("from") ?? "", to: params.get("to") ?? "" };
  const baseline = REAL_WORLD_CCAS.find(cca => cca === params.get("baseline")) ?? "cubic";
  const comparison = REAL_WORLD_CCAS.find(cca => cca === params.get("comparison")) ?? "bbr";
  const metric: ReportMetric = params.get("metric") === "jain_fairness" ? "jain_fairness" : "combined_mean_mbit_per_second";
  const [jobs, setJobs] = useState<RealWorldJob[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [building, setBuilding] = useState(false);
  const [progress, setProgress] = useState(0);
  const [copied, setCopied] = useState("");
  const [analysis, setAnalysis] = useState<{ key: string; reports: RealWorldReport[]; errors: string[] } | null>(null);
  const controller = useRef<AbortController | null>(null);
  const cache = useRef(new Map<string, RealWorldReport>());
  function query(patch: Record<string, string>) {
    const next = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(patch)) { if (value) next.set(key, value); else next.delete(key); }
    window.history.replaceState(null, "", `${REAL_WORLD_MODULE_PATH}/real-world-reports${next.size ? `?${next}` : ""}`);
  }
  const load = useCallback(async (pageCursor?: string, signal?: AbortSignal) => {
    setLoading(true); setError("");
    try {
      const data = await realWorldRequest<History>(`/reports${pageCursor ? `?${new URLSearchParams({ cursor: pageCursor })}` : ""}`, { signal });
      if (signal?.aborted) return;
      setJobs(old => pageCursor ? [...old, ...data.tests.filter(job => !old.some(prior => prior.job_id === job.job_id))] : data.tests);
      setCursor(data.cursor);
      if (!pageCursor) cache.current.clear();
    } catch (e) { if (!signal?.aborted) setError(e instanceof Error ? e.message : "Could not load saved tests."); }
    finally { if (!signal?.aborted) setLoading(false); }
  }, []);
  useEffect(() => {
    const request = new AbortController();
    void load(undefined, request.signal);
    return () => { request.abort(); controller.current?.abort(); };
  }, [load]);
  const visible = filterReportJobs(jobs, filters);
  const regions = [...new Set(jobs.flatMap(job => [job.config.server, job.config.bottleneck, ...job.config.receivers].map(n => n.region)))].sort();
  function toggle(id: string, checked: boolean) {
    query({ selected: (checked ? [...new Set([...selected, id])].slice(0, MAX_REPORT_SELECTION) : selected.filter(item => item !== id)).join(",") });
  }
  async function buildComparison() {
    controller.current?.abort();
    const request = new AbortController();
    controller.current = request;
    setBuilding(true); setProgress(0);
    const reports: RealWorldReport[] = [], errors: string[] = [];
    let next = 0, finished = 0;
    // Bound S3-backed report requests and authenticate every fetch.
    await Promise.all(Array.from({ length: Math.min(4, selected.length) }, async () => {
      while (next < selected.length && !request.signal.aborted) {
        const id = selected[next++];
        try {
          const report = cache.current.get(id) ?? await realWorldRequest<RealWorldReport>(`/reports/${id}?summary=1`, { signal: request.signal });
          if (!request.signal.aborted) { cache.current.set(id, report); reports.push(report); }
        } catch (e) { if (!request.signal.aborted) errors.push(`${id.slice(0, 8)}: ${e instanceof Error ? e.message : "Test results unavailable"}`); }
        if (!request.signal.aborted) setProgress(++finished);
      }
    }));
    if (!request.signal.aborted) { setAnalysis({ key: selectionKey, reports, errors }); setBuilding(false); }
  }
  async function copyLink() {
    try { await navigator.clipboard.writeText(window.location.href); setCopied("Results link copied. Access requires sign-in."); }
    catch { setCopied("Copy the address from your browser to save this test selection."); }
  }
  const active = analysis?.key === selectionKey ? analysis : null;
  return <div className="mt-6 space-y-6">
    <div className="grid gap-4 sm:grid-cols-3">
      {[["Tests loaded", jobs.length], ["Completed", jobs.filter(job => job.status === "completed").length], ["Selected for comparison", selected.length]].map(([label, value]) => <Card key={label} className="gap-2"><CardHeader><CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle></CardHeader><CardContent><p className="text-2xl font-semibold tabular-nums">{value}</p></CardContent></Card>)}
    </div>
    <Card className="print:hidden"><CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3"><CardTitle>Saved test results</CardTitle><Button variant="outline" size="sm" disabled={loading || building} onClick={() => { setAnalysis(null); void load(); }}>Refresh</Button></CardHeader><CardContent className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-2"><Label htmlFor="report-search">Test ID or hypothesis</Label><Input id="report-search" value={filters.search} onChange={event => query({ search: event.target.value })} placeholder="Search saved tests" /></div>
        <Choice label="Algorithm filter" value={filters.cca || "all"} onChange={value => query({ cca: value === "all" ? "" : value })} items={[{ value: "all", label: "All algorithms" }, ...REAL_WORLD_CCAS.map(value => ({ value, label: value.toUpperCase() }))]} />
        <Choice label="Any machine’s Region" value={filters.region || "all"} onChange={value => query({ region: value === "all" ? "" : value })} items={[{ value: "all", label: "All loaded Regions" }, ...regions.map(value => ({ value, label: value }))]} />
        <Choice label="Test status" value={filters.status || "all"} onChange={value => query({ status: value === "all" ? "" : value })} items={[{ value: "all", label: "All statuses" }, ...["completed", "failed", "cancelled", "running", "cleaning"].map(value => ({ value, label: value }))]} />
        <div className="space-y-2"><Label htmlFor="report-from">From date (UTC)</Label><Input id="report-from" type="date" value={filters.from} onChange={event => query({ from: event.target.value })} /></div>
        <div className="space-y-2"><Label htmlFor="report-to">Through date (UTC)</Label><Input id="report-to" type="date" value={filters.to} onChange={event => query({ to: event.target.value })} /></div>
      </div>
      <p className="text-xs text-muted-foreground">Showing {visible.length} of {jobs.length} loaded tests. {loading ? "Reading history." : error ? "History could not be refreshed." : cursor ? "Older tests are available below; filters apply to the loaded history." : "All available history has been loaded."} Results are publicly accessible.</p>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {loading && <p role="status" className="text-sm text-muted-foreground">Loading test history…</p>}
      {!loading && !error && !visible.length ? <p className="py-6 text-sm text-muted-foreground">{jobs.length ? "No tests match these filters." : "No tests yet. Launch a real-world test to collect your first results."}</p> : visible.length > 0 ? <Table><TableHeader><TableRow>
        <TableHead>Select</TableHead><TableHead>Created (UTC) / test</TableHead><TableHead>CCA</TableHead><TableHead>Placement</TableHead><TableHead>Configuration</TableHead><TableHead>Status</TableHead><TableHead>Results</TableHead>
      </TableRow></TableHeader><TableBody>{visible.map(job => <TableRow key={job.job_id}>
        <TableCell><Checkbox aria-label={`Select test ${job.job_id}`} checked={selected.includes(job.job_id)} disabled={building || (!selected.includes(job.job_id) && selected.length >= MAX_REPORT_SELECTION)} onCheckedChange={checked => toggle(job.job_id, checked)} /></TableCell>
        <TableCell>{dateUtc(job.created_at).replace(" UTC", "")}<br /><span className="font-mono text-xs text-muted-foreground">{job.job_id.slice(0, 8)}</span>{job.config.notes && <p className="mt-1 max-w-xs truncate text-xs text-muted-foreground" title={job.config.notes}>{job.config.notes}</p>}</TableCell>
        <TableCell>{job.config.cca.toUpperCase()}</TableCell><TableCell className="text-xs">{job.config.server.region} → {job.config.bottleneck.region}<br />→ {[...new Set(job.config.receivers.map(r => r.region))].join(", ")}</TableCell>
        <TableCell className="text-xs">{job.config.receivers.length} receivers · {job.config.duration_seconds} s<br />{job.config.rate_mbit} Mbit/s · {job.config.buffer_kbytes} kB</TableCell>
        <TableCell><Badge variant="secondary">{job.status}</Badge></TableCell><TableCell><Link href={`${REAL_WORLD_MODULE_PATH}/real-world-reports/${job.job_id}`} className="text-primary underline underline-offset-4">View results</Link></TableCell>
      </TableRow>)}</TableBody></Table> : null}
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" disabled={!visible.length || building} onClick={() => query({ selected: [...new Set([...selected, ...visible.map(job => job.job_id)])].slice(0, MAX_REPORT_SELECTION).join(",") })}>Select filtered tests</Button>
        <Button variant="outline" size="sm" disabled={!selected.length || building} onClick={() => query({ selected: "" })}>Clear selection</Button>
        <Button variant="outline" size="sm" disabled={!Object.values(filters).some(Boolean)} onClick={() => query({ search: "", cca: "", region: "", status: "", from: "", to: "" })}>Clear filters</Button>
        {cursor && <Button variant="outline" size="sm" disabled={loading} onClick={() => void load(cursor)}>Load older tests</Button>}
      </div>
    </CardContent></Card>
    <Card><CardHeader><CardTitle>Compare recorded configurations</CardTitle></CardHeader><CardContent className="space-y-4">
      <p className="text-sm text-muted-foreground">Select up to {MAX_REPORT_SELECTION} tests. The analysis separates configurations, reports replication counts, and withholds confidence intervals when repetitions are insufficient.</p>
      <div className="grid gap-4 sm:grid-cols-3">
        <Choice label="Baseline algorithm" value={baseline} onChange={value => query({ baseline: value })} items={REAL_WORLD_CCAS.map(value => ({ value, label: value.toUpperCase() }))} />
        <Choice label="Comparison algorithm" value={comparison} onChange={value => query({ comparison: value })} items={REAL_WORLD_CCAS.map(value => ({ value, label: value.toUpperCase() }))} />
        <Choice label="Whole-test outcome" value={metric} onChange={value => query({ metric: value })} items={Object.entries(REPORT_METRICS).map(([value, item]) => ({ value, label: `${item.label} (${item.unit})` }))} />
      </div>
      {baseline === comparison && <p className="text-sm text-destructive">Choose two different algorithms.</p>}
      <div className="flex flex-wrap items-center gap-3 print:hidden"><Button disabled={selected.length < 2 || baseline === comparison || building} onClick={() => void buildComparison()}>{building ? `Reading results · ${progress} / ${selected.length}` : `Build comparison · ${selected.length} tests`}</Button><Button variant="outline" disabled={!selected.length} onClick={() => void copyLink()}>Copy results link</Button></div>
      {copied && <p role="status" className="text-xs text-muted-foreground">{copied}</p>}
      {building && <p role="status" className="text-sm text-muted-foreground">Checking saved measurements and provenance: {displayNumber(progress, 0)} tests read.</p>}
      {analysis && !active && <p className="text-sm text-muted-foreground">The selection changed. Build the comparison again to use these tests.</p>}
    </CardContent></Card>
    {active && active.errors.length > 0 && <Card><CardHeader><CardTitle>Some selected test results could not be read</CardTitle></CardHeader><CardContent><p className="mb-3 text-sm">Retry the comparison before interpreting results; unread test results have not been silently excluded.</p><ul role="alert" className="list-disc space-y-1 pl-5 text-sm text-destructive">{active.errors.map(e => <li key={e}>{e}</li>)}</ul></CardContent></Card>}
    {active && !active.errors.length && <RealWorldReportComparison reports={active.reports} baseline={baseline} comparison={comparison} metric={metric} />}
  </div>;
}
