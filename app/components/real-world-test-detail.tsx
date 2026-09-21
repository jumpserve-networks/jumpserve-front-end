"use client";

import { REAL_WORLD_MODULE_PATH } from "@/lib/test-modules";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/app/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/app/components/ui/card";
import { Badge } from "@/app/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/app/components/ui/table";
import { isRealWorldTerminal, REAL_WORLD_STAGES, type RealWorldJob } from "@/lib/real-world";
import { realWorldRequest } from "@/lib/real-world-api";
import { RealWorldTrafficMap } from "@/app/components/real-world-traffic-map";
import { RealWorldStatusTimeline } from "@/app/components/real-world-status-timeline";

export function RealWorldTestDetail({ jobId }: { jobId: string }) {
  const [job, setJob] = useState<RealWorldJob | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [receivedAt, setReceivedAt] = useState(0);
  const [artifacts, setArtifacts] = useState<{ name: string; url: string }[]>([]);
  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      let terminal = false;
      try {
        const data = await realWorldRequest<RealWorldJob>(`/tests/${jobId}`, { signal: controller.signal });
        if (!controller.signal.aborted) {
          setJob((current) => current?.cancel_requested ? { ...data, cancel_requested: true } : data);
          setReceivedAt(Date.now()); setError(""); terminal = isRealWorldTerminal(data.status);
        }
      } catch (e) { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : "Could not load test."); }
      if (!controller.signal.aborted && !terminal) timer = setTimeout(poll, 5000);
    };
    void poll();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [jobId]);
  async function cancel() {
    setBusy(true);
    try { setJob(await realWorldRequest<RealWorldJob>(`/tests/${jobId}/cancel`, { method: "POST", body: "{}" })); setReceivedAt(Date.now()); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not cancel test."); }
    finally { setBusy(false); }
  }
  async function download() {
    setBusy(true);
    try { setArtifacts((await realWorldRequest<{ artifacts: { name: string; url: string }[] }>(`/tests/${jobId}/artifacts`)).artifacts); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not load artifacts."); }
    finally { setBusy(false); }
  }
  return <div className="mt-6 space-y-6">
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {!job ? <p role="status" className="text-sm text-muted-foreground">Loading test…</p> : <>
      <Card><CardHeader><CardTitle>Test status</CardTitle></CardHeader><CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-3"><Badge variant="secondary">{job.status}</Badge><p role="status" className="text-sm">{REAL_WORLD_STAGES[job.status] ?? job.status}</p></div>
        <p className="break-all font-mono text-xs text-muted-foreground">{job.job_id}</p>
        {job.cancel_requested && !isRealWorldTerminal(job.status) && <p className="text-sm">Cancellation requested. Waiting for resource cleanup.</p>}
        {job.error && <p role="alert" className="whitespace-pre-wrap break-words text-sm text-destructive">{job.error}</p>}
        {job.cleanup_error && <p role="alert" className="text-sm text-destructive">Cleanup is retrying: {job.cleanup_error}</p>}
        <RealWorldStatusTimeline job={job} />
        {job.can_manage && !isRealWorldTerminal(job.status) && <Button variant="outline" disabled={busy || job.cancel_requested || job.status === "cleaning"} onClick={() => void cancel()}>Cancel test and terminate instances</Button>}
      </CardContent></Card>
      <RealWorldTrafficMap job={job} receivedAt={receivedAt} interrupted={Boolean(error) || busy} />
      <Card><CardHeader><CardTitle>Configuration</CardTitle></CardHeader><CardContent className="space-y-4">
        <dl className="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">{[
          ["Server CCA", job.config.cca.toUpperCase()], ["Duration", `${job.config.duration_seconds} s`],
          ["Shared bottleneck", `${job.config.rate_mbit} Mbit/s`], ["Queue buffer", `${job.config.buffer_kbytes} kB`],
        ].map(([label, value]) => <div key={label}><dt className="text-muted-foreground">{label}</dt><dd className="mt-1 font-medium">{value}</dd></div>)}</dl>
        {job.config.notes && <div><h2 className="text-sm font-medium">Hypothesis / notes</h2><p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{job.config.notes}</p></div>}
        <Table><TableHeader><TableRow>{["Machine", "Region / zone", "Instance type", "EC2 instance", "State"].map((h) => <TableHead key={h}>{h}</TableHead>)}</TableRow></TableHeader><TableBody>
          {job.nodes.map((node) => <TableRow key={node.name}><TableCell>{node.name}</TableCell><TableCell>{node.region}<br /><span className="text-xs text-muted-foreground">{node.zone_id}</span></TableCell><TableCell>{node.instance_type}</TableCell><TableCell className="font-mono text-xs">{node.instance_id ?? "Pending"}</TableCell><TableCell>{node.state ?? "Pending"}</TableCell></TableRow>)}
        </TableBody></Table>
      </CardContent></Card>
      {(job.results || isRealWorldTerminal(job.status)) && <Card><CardHeader><CardTitle>Measurements</CardTitle></CardHeader><CardContent className="space-y-4">
        {job.results?.length ? <Table><TableHeader><TableRow><TableHead>Receiver</TableHead><TableHead>Throughput (Mbit/s)</TableHead><TableHead>Received (MB)</TableHead><TableHead>Duration (s)</TableHead></TableRow></TableHeader><TableBody>
          {job.results.map((result) => <TableRow key={result.receiver}><TableCell>{result.receiver}</TableCell><TableCell>{result.received_mbit_per_second.toFixed(3)}</TableCell><TableCell>{(result.received_bytes / 1_000_000).toFixed(3)}</TableCell><TableCell>{result.seconds.toFixed(3)}</TableCell></TableRow>)}
        </TableBody></Table> : <p className="text-sm text-muted-foreground">This test did not produce a complete set of measurements.</p>}
        <p className="text-xs text-muted-foreground">Results reflect the observed AWS paths, instance capacity, and tunnel overhead. A single test is one replication; it does not establish a difference between algorithms. Raw reports include kernel and iperf versions, route checks, TCP samples, and queue counters.</p>
        <div className="flex flex-wrap gap-3"><Button size="sm" nativeButton={false} render={<Link href={`${REAL_WORLD_MODULE_PATH}/test-results/${jobId}`} />}>View test results</Button><Button variant="outline" size="sm" disabled={busy} onClick={() => void download()}>Get raw report links</Button></div>
        {artifacts.length > 0 && <div className="flex flex-wrap gap-4">{artifacts.map((artifact) => <a key={artifact.name} href={artifact.url} target="_blank" rel="noreferrer" className="text-sm text-primary underline underline-offset-4">{artifact.name}</a>)}</div>}
        <p className="text-xs text-muted-foreground">Download links expire after five minutes. Runtime revision: <span className="break-all font-mono">{job.runtime_revision}</span></p>
      </CardContent></Card>}
    </>}
  </div>;
}
