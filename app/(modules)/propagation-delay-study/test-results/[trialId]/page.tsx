import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { StudyHeader } from "@/app/components/delay-study/header";
import { GoodputTrace } from "@/app/components/delay-study/charts";
import { Button } from "@/app/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/app/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/app/components/ui/table";
import { ccaName, familyName, formatStudyNumber as fmt, treatmentName } from "@/lib/delay-study";
import { getStudyTrial } from "@/lib/delay-study-server";
import { DELAY_STUDY_MODULE_PATH } from "@/lib/test-modules";

export const metadata: Metadata = { title: "Propagation delay study — individual trial" };
export const dynamic = "force-dynamic";
export default async function StudyTrialPage({ params }: { params: Promise<{ trialId: string }> }) {
  const data = await getStudyTrial((await params).trialId);
  if (!data) notFound();
  const { trial, configuration: c, paired, flows, samples } = data;
  return <main className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6"><StudyHeader title={`Trial ${trial.id.slice(0, 8)}`} description={`${familyName(c.family)} · ${treatmentName(c.treatment)} · replicate ${trial.replicate}`} />
    <Card><CardHeader><CardTitle className="capitalize">{trial.status}</CardTitle><CardDescription>{trial.id}</CardDescription></CardHeader><CardContent className="space-y-4 text-sm"><dl className="grid gap-4 sm:grid-cols-3"><div><dt className="text-muted-foreground">Configured bottleneck</dt><dd>{c.capacity_mbps} Mbps · {c.queue_packets} packets</dd></div><div><dt className="text-muted-foreground">Duration / warm-up</dt><dd>{c.duration_seconds} s / {c.warmup_seconds} s</dd></div><div><dt className="text-muted-foreground">Sender start order</dt><dd>{trial.start_order.join(" → ")}</dd></div><div><dt className="text-muted-foreground">Started (UTC)</dt><dd>{trial.started_at ? new Date(trial.started_at).toISOString().replace("T", " ") : "Not run"}</dd></div><div><dt className="text-muted-foreground">Finished (UTC)</dt><dd>{trial.finished_at ? new Date(trial.finished_at).toISOString().replace("T", " ") : "—"}</dd></div><div><dt className="text-muted-foreground">Worker</dt><dd>{trial.attempt_id}</dd></div></dl>
      <div className="flex flex-wrap items-center gap-4">
        {paired && <Link className="inline-block text-primary underline underline-offset-4" href={`${DELAY_STUDY_MODULE_PATH}/test-results/${paired.id}`}>Matched comparison trial · {paired.status}</Link>}
        <Button variant="outline" size="sm" nativeButton={false} render={<a href={`${DELAY_STUDY_MODULE_PATH}/test-results/${trial.id}/data`} />}>Download trial measurements (JSON)</Button>
      </div>
      {(trial.error || trial.validation_errors.length > 0) && <div className="rounded-md border border-destructive/40 p-3"><p className="font-medium">Validation failed</p><p>{trial.error}</p>{trial.validation_errors.map(error => <p key={error}>{error}</p>)}</div>}
    </CardContent></Card>
    <Card><CardHeader><CardTitle>Receiver goodput</CardTitle><CardDescription>Observed payload delivery, in Mbps. The steady-state estimate uses whole receiver intervals after warm-up.</CardDescription></CardHeader><CardContent className="overflow-x-auto"><GoodputTrace samples={samples} warmupSeconds={c.warmup_seconds} /></CardContent></Card>
    <Card><CardHeader><CardTitle>Per-flow measurements</CardTitle><CardDescription>Configured delay is a round-trip increment. Unloaded ICMP calibration is distinct from TCP RTT under load.</CardDescription></CardHeader><CardContent><Table><TableHeader><TableRow><TableHead>Flow / CCA</TableHead><TableHead>Configured RTT</TableHead><TableHead>Natural minimum</TableHead><TableHead>Added ACK delay</TableHead><TableHead>Effective minimum</TableHead><TableHead>Steady goodput</TableHead><TableHead>Covered duration</TableHead><TableHead>Retransmits</TableHead></TableRow></TableHeader><TableBody>{flows.map(f => <TableRow key={f.flow_index}><TableCell>{f.flow_index} · {ccaName(f.cca)}</TableCell><TableCell>{fmt(f.configured_base_rtt_ms)} ms</TableCell><TableCell>{fmt(f.natural_min_rtt_ms)} ms</TableCell><TableCell>{fmt(f.added_ack_delay_ms)} ms</TableCell><TableCell>{fmt(f.effective_min_rtt_ms)} ms</TableCell><TableCell>{fmt(f.goodput_mbps)} Mbps</TableCell><TableCell>{fmt(f.measured_seconds)} s</TableCell><TableCell>{f.retransmits ?? "—"}</TableCell></TableRow>)}</TableBody></Table>{!flows.length && <p className="mt-4 text-sm text-muted-foreground">No flow measurements recorded.</p>}</CardContent></Card>
    <p className="break-all text-xs text-muted-foreground">Kernel: {trial.kernel_release ?? "not recorded"}<br />Runner SHA-256: {trial.runner_sha256 ?? "not recorded"}</p>
  </main>;
}
