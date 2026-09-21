"use client";

import { REAL_WORLD_MODULE_PATH } from "@/lib/test-modules";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "@/app/components/ui/button";
import { Badge } from "@/app/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/app/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/app/components/ui/table";
import { Choice } from "@/app/components/real-world-placement";
import { RealWorldReportChart } from "@/app/components/real-world-report-chart";
import { realWorldRequest } from "@/lib/real-world-api";
import { dateUtc, displayNumber, receiversCsv, tracesCsv, type RealWorldReport as Report } from "@/lib/real-world-reports";
import { downloadReportFile } from "@/lib/report-download";

export function RealWorldReport({ jobId }: { jobId: string }) {
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const [queueMetric, setQueueMetric] = useState("queue_delay_ms");
  const [artifacts, setArtifacts] = useState<{ name: string; url: string }[]>([]);
  const [downloading, setDownloading] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    realWorldRequest<Report>(`/reports/${jobId}`, { signal: controller.signal }).then(data => {
      if (!controller.signal.aborted) { setReport(data); setError(""); }
    }).catch((e: Error) => { if (!controller.signal.aborted) setError(e.message); });
    return () => controller.abort();
  }, [jobId, revision]);
  async function rawReports() {
    setDownloading(true);
    try { setArtifacts((await realWorldRequest<{ artifacts: { name: string; url: string }[] }>(`/reports/${jobId}/artifacts`)).artifacts); }
    catch (e) { setError(e instanceof Error ? e.message : "Raw reports are unavailable."); }
    finally { setDownloading(false); }
  }
  if (!report) return <div className="mt-6">{error ? <div role="alert" className="space-y-3"><p className="text-sm text-destructive">{error}</p><Button variant="outline" onClick={() => setRevision(r => r + 1)}>Retry loading results</Button></div> : <p role="status" className="text-sm text-muted-foreground">Reading saved measurements and checking provenance…</p>}</div>;
  const { job, summary } = report;
  const issues = [...report.comparison.exclusions, ...report.warnings];
  const queueUnit = queueMetric === "queue_delay_ms" ? "ms" : queueMetric === "backlog_bytes" ? "kB" : "packets";
  const queueTitle = queueMetric === "queue_delay_ms" ? "Estimated queue drain time" : queueMetric === "backlog_bytes" ? "Shared queue backlog" : "Cumulative queue drops";
  return <article className="real-world-report mt-6 space-y-6">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex flex-wrap items-center gap-3"><Badge variant="secondary">{job.status}</Badge><span className="text-sm text-muted-foreground">{dateUtc(job.created_at)}</span></div>
      <div className="flex flex-wrap gap-2 print:hidden">
        <Button variant="outline" size="sm" onClick={() => downloadReportFile(`${jobId}-receivers.csv`, receiversCsv(report), "text/csv;charset=utf-8")}>Receiver CSV</Button>
        <Button variant="outline" size="sm" onClick={() => downloadReportFile(`${jobId}-traces.csv`, tracesCsv(report), "text/csv;charset=utf-8")}>Trace CSV</Button>
        <Button variant="outline" size="sm" onClick={() => downloadReportFile(`${jobId}-report.json`, JSON.stringify(report, null, 2), "application/json")}>Results JSON</Button>
        <Button variant="outline" size="sm" onClick={() => window.print()}>Print / PDF</Button>
      </div>
    </div>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    <p className="break-all font-mono text-xs text-muted-foreground">Test {job.job_id}</p>
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {[
        ["Combined average throughput", displayNumber(summary.combined_mean_mbit_per_second), "Mbit/s · sum of receiver averages"],
        ["Jain fairness", displayNumber(summary.jain_fairness), "Computed from flow averages; 1 is equal"],
        ["Sampled queue drain time · p95", displayNumber(summary.queue_delay.p95), `ms · ${summary.queue_delay.samples} queue samples`],
        ["Total received", displayNumber(summary.received_bytes === null ? null : summary.received_bytes / 1_000_000), "MB · decimal units"],
      ].map(([label, value, caption]) => <Card key={label} className="gap-2"><CardHeader><CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle></CardHeader><CardContent><p className="text-2xl font-semibold tabular-nums">{value}</p><p className="mt-2 text-xs text-muted-foreground">{caption}</p></CardContent></Card>)}
    </div>
    <Card><CardHeader><CardTitle>Measurement checks</CardTitle></CardHeader><CardContent className="space-y-3 text-sm">
      <p>{report.comparison.eligible ? "This test has the complete measurement and provenance records required for configuration-matched comparisons." : "This test is excluded from comparisons for the reasons below."}</p>
      {issues.length > 0 && <ul className="list-disc space-y-1 pl-5 text-muted-foreground">{issues.map((issue, i) => <li key={i}>{issue}</li>)}</ul>}
      <p className="text-muted-foreground">One test is one replication. Trace samples and receiver flows do not provide independent repetitions. These observations do not establish a causal algorithm effect.</p>
      <p className="text-xs text-muted-foreground">Measurement-process start skew: {displayNumber(summary.start_skew_ms)} ms. This measures the process barrier, not exact TCP transfer-start synchronization.</p>
    </CardContent></Card>
    <Card><CardHeader><CardTitle>Experiment configuration</CardTitle></CardHeader><CardContent className="space-y-4">
      <dl className="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">{[
        ["Server CCA", job.config.cca.toUpperCase()], ["Transfer duration", `${job.config.duration_seconds} s`],
        ["Shared rate", `${job.config.rate_mbit} Mbit/s`], ["FIFO buffer", `${job.config.buffer_kbytes} kB`],
      ].map(([label, value]) => <div key={label}><dt className="text-muted-foreground">{label}</dt><dd className="mt-1 font-medium">{value}</dd></div>)}</dl>
      {job.config.notes && <div><h2 className="text-sm font-medium">Hypothesis / notes</h2><p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{job.config.notes}</p></div>}
      <Table><TableHeader><TableRow>{["Machine", "Region", "Zone ID", "Instance type", "Image", "Kernel / iperf"].map(h => <TableHead key={h}>{h}</TableHead>)}</TableRow></TableHeader><TableBody>
        {job.nodes.map(node => { const p = report.provenance.find(p => p.name === node.name); return <TableRow key={node.name}><TableCell>{node.name}</TableCell><TableCell>{node.region}</TableCell><TableCell>{node.zone_id}</TableCell><TableCell>{node.instance_type}</TableCell><TableCell className="font-mono text-xs">{node.image_id ?? "Unavailable"}</TableCell><TableCell className="text-xs">{p?.kernel ?? "Unavailable"}<br />{p?.iperf_version ?? "Unavailable"}</TableCell></TableRow>; })}
      </TableBody></Table>
    </CardContent></Card>
    <Card><CardHeader><CardTitle>Receiver measurements</CardTitle></CardHeader><CardContent>
      <Table><TableHeader><TableRow>{["Receiver", "Throughput (Mbit/s)", "Received (MB)", "Duration (s)", "Sender RTT median (ms)", "RTT samples", "Preflight ping avg (ms)", "Retransmits"].map(h => <TableHead key={h}>{h}</TableHead>)}</TableRow></TableHeader><TableBody>
        {report.receivers.map(r => <TableRow key={r.name}><TableCell>{r.name}</TableCell><TableCell>{displayNumber(r.mean_mbit_per_second)}</TableCell><TableCell>{displayNumber(r.received_bytes === null ? null : r.received_bytes / 1_000_000)}</TableCell><TableCell>{displayNumber(r.duration_seconds)}</TableCell><TableCell>{displayNumber(r.rtt.median)}</TableCell><TableCell>{r.rtt.samples}</TableCell><TableCell>{displayNumber(r.preflight_rtt_ms)}</TableCell><TableCell>{displayNumber(r.retransmits, 0)}</TableCell></TableRow>)}
      </TableBody></Table>
      <p className="mt-3 text-xs leading-5 text-muted-foreground">Throughput is receiver bytes × 8 / actual transfer seconds. RTT is the median of valid sender data-socket estimates during the scheduled test window. Preflight ping is diagnostic; it is not subtracted from RTT to infer queue delay.</p>
    </CardContent></Card>
    <div className="grid gap-6 lg:grid-cols-2">
      <RealWorldReportChart title="Receiver throughput" unit="Mbit/s" clock="Seconds into each receiver’s transfer" description="Interval averages, shown as steps. Each receiver has its own transfer clock; traces are not synchronized or summed." series={report.receivers.map(r => ({ label: r.name, points: (r.throughput ?? []).flatMap((p, i, points) => [
        ...(i && p.start - points[i - 1].seconds > .02 ? [{ x: p.start, y: null }] : []), { x: p.start, y: p.mbit_per_second }, { x: p.seconds, y: p.mbit_per_second },
      ]) }))} />
      <RealWorldReportChart scheduledEnd={job.config.duration_seconds} title="Sender RTT" unit="ms" clock="Seconds since scheduled start" description="Linux smoothed RTT from the exact iperf data socket. Control and management sockets are excluded; missing samples remain gaps." series={report.receivers.map(r => ({ label: r.name, points: (r.tcp ?? []).map(p => ({ x: p.seconds, y: p.rtt_ms })) }))} />
      <RealWorldReportChart scheduledEnd={job.config.duration_seconds} title="Sender congestion window" unit="kB" clock="Seconds since scheduled start" description="Data-socket cwnd × MSS, converted to decimal kB. The trace includes the recorded interval after the scheduled transfer window." series={report.receivers.map(r => ({ label: r.name, points: (r.tcp ?? []).map(p => ({ x: p.seconds, y: p.cwnd_bytes === null ? null : p.cwnd_bytes / 1000 })) }))} />
      <div className="min-w-0 space-y-3">
        <div className="max-w-xs print:hidden"><Choice label="Shared queue metric" value={queueMetric} onChange={setQueueMetric} items={[{ value: "queue_delay_ms", label: "Estimated drain time" }, { value: "backlog_bytes", label: "Backlog" }, { value: "drops", label: "Cumulative drops" }]} /></div>
        <RealWorldReportChart key={queueMetric} scheduledEnd={job.config.duration_seconds} title={queueTitle} unit={queueUnit} clock="Seconds since scheduled start" description="The one shared FIFO (10:). Drain time is backlog bytes × 8 / configured rate, an estimate rather than a measured packet waiting time."
          series={[{ label: "Shared bottleneck", points: (report.queue ?? []).map(p => { const value = p[queueMetric as "queue_delay_ms" | "backlog_bytes" | "drops"]; return { x: p.seconds, y: value !== null && queueMetric === "backlog_bytes" ? value / 1000 : value }; }) }]} />
      </div>
    </div>
    <Card><CardHeader><CardTitle>Provenance and exports</CardTitle></CardHeader><CardContent className="space-y-3 text-sm">
      <p>Analysis: <span className="font-mono text-xs">{report.analysis_version}</span></p>
      <p className="break-all">Measurement runtime: <span className="font-mono text-xs">{job.runtime_revision}</span></p>
      <p className="text-muted-foreground">CSV exports preserve units and clock definitions. Report JSON includes configurations, eligibility checks, sample counts, and source checksums. Legacy version IDs are retained for imported measurements. Raw links expire after five minutes; anyone holding a link can use it until expiry.</p>
      <Table><TableHeader><TableRow><TableHead>Source</TableHead><TableHead>SHA-256</TableHead><TableHead>Legacy version</TableHead></TableRow></TableHeader><TableBody>{report.sources.map(source => <TableRow key={source.name}><TableCell>{source.name}</TableCell><TableCell className="max-w-xs break-all whitespace-normal font-mono text-xs">{source.sha256}</TableCell><TableCell className="max-w-xs break-all whitespace-normal font-mono text-xs">{source.version_id ?? "—"}</TableCell></TableRow>)}</TableBody></Table>
      <div className="flex flex-wrap gap-3 print:hidden"><Button variant="outline" size="sm" disabled={downloading} onClick={() => void rawReports()}>Get raw report links</Button>{report.can_manage && <Button variant="outline" size="sm" nativeButton={false} render={<Link href={`${REAL_WORLD_MODULE_PATH}/run-a-test/${jobId}`} />}>Manage test</Button>}<Button variant="outline" size="sm" nativeButton={false} render={<Link href={`${REAL_WORLD_MODULE_PATH}/test-results?selected=${jobId}`} />}>Add to comparison</Button></div>
      {artifacts.map(artifact => <a key={artifact.name} href={artifact.url} target="_blank" rel="noreferrer" className="mr-4 inline-block text-primary underline underline-offset-4 print:hidden">{artifact.name}</a>)}
    </CardContent></Card>
  </article>;
}
