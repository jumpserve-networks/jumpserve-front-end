"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/app/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/app/components/ui/card";
import { Input } from "@/app/components/ui/input";
import { Label } from "@/app/components/ui/label";
import { Textarea } from "@/app/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/app/components/ui/table";
import { Choice, RealWorldPlacement } from "@/app/components/real-world-placement";
import { defaultRealWorldConfig, emptyPlacement, REAL_WORLD_CCAS, REAL_WORLD_STAGES, validateRealWorldConfig,
  type AwsRegion, type RealWorldConfig, type RealWorldJob } from "@/lib/real-world";
import { realWorldRequest } from "@/lib/real-world-api";

export function RealWorldTests() {
  const router = useRouter();
  const [config, setConfig] = useState(defaultRealWorldConfig);
  const [regions, setRegions] = useState<AwsRegion[]>([]);
  const [tests, setTests] = useState<RealWorldJob[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const request = useRef<{ id: string; config: string } | null>(null);
  const load = useCallback(() => {
    return Promise.all([
      realWorldRequest<{ regions: AwsRegion[] }>("/regions").then((data) => { setRegions(data.regions); setError(""); }).catch((e: Error) => setError(e.message)),
      realWorldRequest<{ tests: RealWorldJob[]; cursor: string | null }>("/tests").then((data) => { setTests(data.tests); setCursor(data.cursor); setHistoryError(""); }).catch((e: Error) => setHistoryError(e.message)),
    ]).then(() => setLoading(false));
  }, []);
  useEffect(() => { void load(); }, [load]);
  function update(patch: Partial<RealWorldConfig>) { setConfig((old) => ({ ...old, ...patch })); }
  async function launch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    const problem = validateRealWorldConfig(config);
    if (problem) { setError(problem); return; }
    const serialized = JSON.stringify(config);
    if (!request.current || request.current.config !== serialized) request.current = { id: crypto.randomUUID(), config: serialized };
    setSubmitting(true); setError("");
    try {
      const job = await realWorldRequest<RealWorldJob>("/tests", { method: "POST", body: JSON.stringify({ config, request_id: request.current.id }) });
      router.push(`/real-world/${job.job_id}`);
    } catch (e) { setError(e instanceof Error ? e.message : "Launch failed."); setSubmitting(false); }
  }
  async function more() {
    setHistoryError("");
    try {
      const data = await realWorldRequest<{ tests: RealWorldJob[]; cursor: string | null }>(`/tests?${new URLSearchParams({ cursor: cursor ?? "" })}`);
      setTests((old) => [...old, ...data.tests.filter((job) => !old.some((item) => item.job_id === job.job_id))]); setCursor(data.cursor);
    } catch (e) { setHistoryError(e instanceof Error ? e.message : "Could not load tests."); }
  }
  return <div className="mt-6 space-y-6">
    <Card><CardHeader><CardTitle>New real-world test</CardTitle></CardHeader><CardContent>
      <form onSubmit={launch} className="space-y-6">
        <p className="text-sm text-muted-foreground">One server → one shared bottleneck → {config.receivers.length} receivers. Each machine is a fresh EC2 instance. Test traffic and acknowledgments travel through the bottleneck.</p>
        <fieldset disabled={submitting || loading} className="min-w-0 space-y-5">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Choice label="Server congestion control" value={config.cca} items={REAL_WORLD_CCAS.map((cca) => ({ value: cca, label: cca.toUpperCase() }))} onChange={(cca) => update({ cca: cca as RealWorldConfig["cca"] })} />
            {([ ["duration_seconds", "Duration (seconds)", 10, 600], ["rate_mbit", "Shared rate (Mbit/s)", 1, 1000], ["buffer_kbytes", "Queue buffer (kB)", 2, 10000] ] as const).map(([key, label, min, max]) =>
              <div key={key} className="space-y-2"><Label htmlFor={key}>{label}</Label><Input id={key} type="number" min={min} max={max} step={1} required value={Number.isNaN(config[key]) ? "" : config[key]} onChange={(e) => update({ [key]: e.target.valueAsNumber })} /></div>)}
          </div>
          <p className="text-xs text-muted-foreground">One TCP stream per receiver, starting together. Buffer sizes use decimal kB (1,000 bytes). BBR uses the stock Linux implementation recorded with the results.</p>
          <p className="text-xs text-muted-foreground">Choose t3.small, t3.medium, or t3.large for each machine. T3 CPU and network bandwidth are burstable; instance limits can affect measurements at high rates.</p>
          <RealWorldPlacement label="Server" value={config.server} regions={regions} onChange={(server) => update({ server })}
            showRegionMap disabled={submitting || loading} />
          <Button type="button" variant="outline" size="sm" className="h-auto max-w-full whitespace-normal py-2 text-left" disabled={!config.server.region || !config.server.zone_id} onClick={() => update({ bottleneck: { ...config.server }, receivers: config.receivers.map(() => ({ ...config.server })) })}>Use server placement and instance type for all machines</Button>
          <RealWorldPlacement label="Bottleneck" value={config.bottleneck} regions={regions} onChange={(bottleneck) => update({ bottleneck })} />
          {config.receivers.map((receiver, index) => <RealWorldPlacement key={index} label={`Receiver ${index + 1}`} value={receiver} regions={regions}
            onChange={(placement) => update({ receivers: config.receivers.map((item, i) => i === index ? placement : item) })} />)}
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" disabled={config.receivers.length >= 16} onClick={() => update({ receivers: [...config.receivers, emptyPlacement()] })}>Add receiver</Button>
            <Button type="button" variant="outline" size="sm" disabled={config.receivers.length <= 1} onClick={() => update({ receivers: config.receivers.slice(0, -1) })}>Remove last receiver</Button>
          </div>
          <p className="text-xs text-muted-foreground">AWS publishes Regions and Availability Zones rather than individual data centers. Locations are fetched from AWS for this account; disabled entries explain availability restrictions.</p>
          <div className="space-y-2"><Label htmlFor="real-world-notes">Hypothesis / notes</Label><Textarea id="real-world-notes" maxLength={4000} value={config.notes} onChange={(e) => update({ notes: e.target.value })} /></div>
        </fieldset>
        {loading && <p role="status" className="text-sm text-muted-foreground">Loading AWS locations and test history…</p>}
        {error && <div role="alert" className="space-y-2 text-sm text-destructive"><p>{error}</p>{!regions.length && <Button type="button" variant="outline" onClick={() => void load()}>Retry</Button>}</div>}
        <div className="flex flex-wrap items-center gap-4">
          <Button type="submit" disabled={submitting || loading || !regions.length}>{submitting ? "Creating test…" : `Launch test · ${config.receivers.length + 2} instances`}</Button>
          <p className="max-w-xl text-xs text-muted-foreground">EC2, public IPv4, and data-transfer charges apply. Instances and test networks are removed after completion or cancellation. A 45-minute deadline limits each test.</p>
        </div>
      </form>
    </CardContent></Card>
    <Card><CardHeader className="flex flex-row items-center justify-between"><CardTitle>Your tests</CardTitle><Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>Refresh</Button></CardHeader><CardContent>
      {historyError && <p role="alert" className="mb-3 text-sm text-destructive">{historyError}</p>}
      {!loading && !tests.length && !historyError ? <p className="text-sm text-muted-foreground">No real-world tests yet.</p> : <Table><TableHeader><TableRow><TableHead>Created</TableHead><TableHead>CCA</TableHead><TableHead>Receivers</TableHead><TableHead>Status</TableHead><TableHead>Results</TableHead></TableRow></TableHeader><TableBody>
        {tests.map((job) => <TableRow key={job.job_id}><TableCell>{new Date(job.created_at * 1000).toLocaleString()}</TableCell><TableCell>{job.config.cca.toUpperCase()}</TableCell><TableCell>{job.config.receivers.length}</TableCell><TableCell>{REAL_WORLD_STAGES[job.status] ?? job.status}</TableCell><TableCell><Link className="text-primary underline underline-offset-4" href={`/real-world/${job.job_id}`}>Open test</Link></TableCell></TableRow>)}
      </TableBody></Table>}
      {cursor && <Button className="mt-4" variant="outline" size="sm" onClick={() => void more()}>Load older tests</Button>}
    </CardContent></Card>
  </div>;
}
