"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/app/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/app/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/app/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/app/components/ui/table";
import { SensitivityChart } from "./charts";
import { DELAY_STUDY_MODULE_PATH } from "@/lib/test-modules";
import { assessmentName, ccaName, familyName, formatStudyNumber as fmt, treatmentName, type StudyData, type StudyConfig } from "@/lib/delay-study";

function delays(config: StudyConfig) {
  return [...config.delay_study_config_flows].sort((a, b) => a.flow_index - b.flow_index).map(f => f.configured_base_rtt_ms);
}
function Heatmap({ configs, title, onSelect }: { configs: StudyConfig[]; title: string; onSelect: (id: string) => void }) {
  const levels = [...new Set(configs.flatMap(delays))].sort((a, b) => a - b);
  return <div><h3 className="mb-3 text-sm font-medium">{title}</h3>
    <p className="mb-2 text-xs text-muted-foreground">Columns: flow 1 base RTT · rows: flow 2 base RTT (ms)</p>
    <Table><TableHeader><TableRow><TableHead>RTT</TableHead>{levels.map(d => <TableHead key={d} className="text-center">{d}</TableHead>)}</TableRow></TableHeader>
      <TableBody>{levels.map(d2 => <TableRow key={d2}><TableHead>{d2}</TableHead>{levels.map(d1 => {
        const config = configs.find(c => { const ds = delays(c); return ds[0] === d1 && ds[1] === d2; });
        const cell = config?.delay_study_cells.find(c => c.flow_index === 1);
        const share = cell?.mean_share;
        return <TableCell key={d1} className="p-1 text-center"><Button variant="ghost" disabled={!config} onClick={() => config && onSelect(config.id)} className="h-14 w-full min-w-14 flex-col gap-0 rounded-sm px-2 text-xs" style={share == null ? undefined : { background: `color-mix(in srgb, var(--chart-2) ${Math.round(10 + share * 65)}%, var(--card))` }} aria-label={`Flow 1 ${d1} ms, flow 2 ${d2} ms: ${share == null ? "no matched estimate" : `${fmt(share * 100, 1)} percent flow 1 share`}`}>
          <span className="font-semibold tabular-nums">{share == null ? "—" : `${fmt(share * 100, 1)}%`}</span><span className="opacity-80">n={cell?.matched_repetitions ?? 0}</span>
        </Button></TableCell>;
      })}</TableRow>)}</TableBody>
    </Table>
  </div>;
}

export function StudyDashboard({ data }: { data: StudyData }) {
  const router = useRouter();
  const groups = [...new Set(data.configurations.map(c => `${c.family}|${c.cca_group}`))].sort();
  const [group, setGroup] = useState(groups.find(g => g === "homogeneous_bbr|bbr/bbr") ?? groups[0]);
  const [configurationId, setConfigurationId] = useState<string | null>(null);
  const [trialPage, setTrialPage] = useState(0);
  const configs = data.configurations.filter(c => `${c.family}|${c.cca_group}` === group);
  const summaries = data.summaries.filter(c => `${c.family}|${c.cca_group}` === group);
  const family = configs[0]?.family;
  const selected = configs.find(c => c.id === configurationId);
  const configIds = new Set(configs.map(c => c.id));
  const relevantTrials = data.trials.filter(t => configIds.has(t.configuration_id) && (!selected || t.configuration_id === selected.id));
  const trials = [...relevantTrials].sort((a, b) => Number(a.status === "planned") - Number(b.status === "planned") || a.block_index - b.block_index);
  const counts = { completed: 0, invalid: 0, failed: 0, planned: 0 };
  for (const trial of data.trials) if (trial.status in counts) counts[trial.status as keyof typeof counts]++;
  const selectConfig = (id: string) => { setConfigurationId(id); setTrialPage(0); };
  return <div className="space-y-6">
    <div className="flex flex-wrap items-center justify-between gap-3 text-sm"><p className="capitalize">Campaign: <strong>{data.campaign.status}</strong></p><Button variant="outline" size="sm" onClick={() => router.refresh()}>Refresh measurements</Button></div>
    <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">{[
      ["Valid trials", `${counts.completed} / ${data.campaign.planned_trials}`], ["Invalid / failed", `${counts.invalid} / ${counts.failed}`], ["Awaiting measurements", counts.planned], ["Planned repetitions per cell", 5],
    ].map(([label, value]) => <Card key={label} className="gap-2 py-4"><CardHeader className="px-4"><CardDescription>{label}</CardDescription><CardTitle className="text-2xl tabular-nums">{value}</CardTitle></CardHeader></Card>)}</div>
    {(data.campaign.status !== "completed" || counts.completed !== data.campaign.planned_trials) && <p role="status" className="rounded-md border border-border bg-muted/40 p-4 text-sm">The campaign is not finalized. Available estimates are provisional; missing or invalid matched pairs are excluded together. A numerical pattern is not a completed replication.</p>}
    <Card><CardHeader><CardTitle>Delay sensitivity</CardTitle><CardDescription>For each identified flow, δ compares its highest and lowest mean goodput across the tested delay assignments. δ = 1 corresponds to a factor of two.</CardDescription></CardHeader><CardContent className="space-y-5">
      <div className="max-w-xl"><label htmlFor="study-group" className="mb-2 block text-sm font-medium">Experiment and algorithms</label><Select value={group} onValueChange={value => { if (value) { setGroup(value); setConfigurationId(null); setTrialPage(0); } }}><SelectTrigger id="study-group" className="w-full"><SelectValue>{familyName(family ?? "")} · {configs[0]?.cca_group.split("/").map(ccaName).join(" / ")}</SelectValue></SelectTrigger><SelectContent>{groups.map(g => { const [f, ccas] = g.split("|"); return <SelectItem key={g} value={g}>{familyName(f)} · {ccas.split("/").map(ccaName).join(" / ")}</SelectItem>; })}</SelectContent></Select></div>
      <div className="flex flex-wrap gap-5 text-xs"><span className="flex items-center gap-2"><span className="size-2.5 rounded-full bg-chart-2" />Baseline</span><span className="flex items-center gap-2"><span className="size-2.5 bg-chart-3" />{family === "homogeneous_bbr" ? "ACK equalization to 100 ms" : family === "common_shift" ? "Common shift +50 ms" : "Narrowed range 40 ± 5 ms"}</span><span className="text-muted-foreground">Whiskers: 95% bootstrap intervals</span></div>
      {summaries.length ? <><div className="overflow-x-auto"><SensitivityChart summaries={summaries} /></div><Table><TableHeader><TableRow><TableHead>Flow</TableHead><TableHead>Baseline δ [95% CI]</TableHead><TableHead>Intervention δ [95% CI]</TableHead><TableHead>Reduction [95% CI]</TableHead><TableHead>Matched pairs</TableHead><TableHead>Delay assignments</TableHead><TableHead>Assessment</TableHead></TableRow></TableHeader><TableBody>{summaries.map(s => <TableRow key={s.flow_index}><TableCell>{s.flow_index} · {ccaName(s.cca)}</TableCell><TableCell>{fmt(s.baseline_delta)} [{fmt(s.baseline_ci_low)}, {fmt(s.baseline_ci_high)}]</TableCell><TableCell>{fmt(s.treatment_delta)} [{fmt(s.treatment_ci_low)}, {fmt(s.treatment_ci_high)}]</TableCell><TableCell>{fmt(s.improvement)} [{fmt(s.improvement_ci_low)}, {fmt(s.improvement_ci_high)}]</TableCell><TableCell>{s.matched_pairs} / {s.expected_pairs}</TableCell><TableCell>{s.observed_assignments} / {s.expected_assignments}</TableCell><TableCell>{assessmentName(s.assessment)}{s.unbounded && " · unbounded"}</TableCell></TableRow>)}</TableBody></Table></> : <p className="py-8 text-sm text-muted-foreground">No complete matched pairs have been analyzed for this experiment yet.</p>}
      <p className="text-xs leading-5 text-muted-foreground">Intervals use {data.campaign.bootstrap_replicates.toLocaleString("en-US")} paired whole-trial resamples within each delay assignment. All flows are resampled together. Sensitivity estimates require every scheduled delay assignment; sensitivity intervals require all five matched repetitions. Cell intervals require at least two repetitions. These are pointwise intervals without adjustment for multiple comparisons; they describe variation on the sampled grid and do not bound every possible delay assignment.</p>
      {family === "homogeneous_bbr" && <p className="border-t pt-4 text-sm">Paper, Figure 4: {configs[0]?.cca_group.startsWith("bbr1") ? "BBRv1 δ 4.58 → 0.27" : "BBRv3 δ 4.90 → 0.38"}. These are published values from a different setup, not measurements from this campaign.</p>}
      {family === "imperfect_equalization" && <p className="border-t pt-4 text-sm">Figure 7b also claims δ &lt; 1 after imperfect equalization. {summaries.length ? summaries.map(s => `Flow ${s.flow_index}: ${s.assessment === "incomplete" ? "incomplete" : s.treatment_ci_high != null && s.treatment_ci_high < 1 ? "upper interval below 1" : s.treatment_ci_low != null && s.treatment_ci_low >= 1 ? "lower interval at or above 1" : "threshold unresolved"}`).join("; ") : "Awaiting estimates."}</p>}
    </CardContent></Card>
    <Card><CardHeader><CardTitle>{family === "homogeneous_bbr" ? "Throughput share across delay assignments" : "Matched configuration estimates"}</CardTitle><CardDescription>{configs[0]?.capacity_mbps} Mbps configured bottleneck · {configs[0]?.queue_packets.toLocaleString("en-US")} packet queue · {configs[0]?.duration_seconds} s transfers · first {configs[0]?.warmup_seconds} s excluded</CardDescription></CardHeader><CardContent className="space-y-5">
      {family === "homogeneous_bbr" && <><div className="grid gap-7 xl:grid-cols-2"><Heatmap title="Baseline" configs={configs.filter(c => c.treatment === "baseline")} onSelect={selectConfig} /><Heatmap title="ACK equalized to 100 ms" configs={configs.filter(c => c.treatment !== "baseline")} onSelect={selectConfig} /></div><p className="text-xs text-muted-foreground">Each cell shows flow 1’s mean share of total receiver goodput and matched repetitions. Both panels use the same 0–100% scale. Select a cell to inspect its estimates and trials.</p></>}
      <Select value={selected?.id ?? "all"} onValueChange={value => { setConfigurationId(value === "all" ? null : value); setTrialPage(0); }}><SelectTrigger className="max-w-full" aria-label="Configuration"><SelectValue>{selected ? `${treatmentName(selected.treatment)} · ${delays(selected).join(" / ")} ms` : "All configurations"}</SelectValue></SelectTrigger><SelectContent><SelectItem value="all">All configurations</SelectItem>{configs.map(c => <SelectItem key={c.id} value={c.id}>{treatmentName(c.treatment)} · {delays(c).join(" / ")} ms</SelectItem>)}</SelectContent></Select>
      {selected && <Table><TableHeader><TableRow><TableHead>Flow</TableHead><TableHead>Mean receiver goodput</TableHead><TableHead>95% CI</TableHead><TableHead>Mean share</TableHead><TableHead>Matched repetitions</TableHead></TableRow></TableHeader><TableBody>{[...selected.delay_study_config_flows].sort((a, b) => a.flow_index - b.flow_index).map(f => { const c = selected.delay_study_cells.find(c => c.flow_index === f.flow_index); return <TableRow key={f.flow_index}><TableCell>{f.flow_index} · {ccaName(f.cca)}</TableCell><TableCell>{fmt(c?.mean_goodput_mbps)} Mbps</TableCell><TableCell>{fmt(c?.ci_low_mbps)}–{fmt(c?.ci_high_mbps)} Mbps</TableCell><TableCell>{c?.mean_share == null ? "—" : `${fmt(c.mean_share * 100, 1)}%`}</TableCell><TableCell>{c?.matched_repetitions ?? 0} / 5</TableCell></TableRow>; })}</TableBody></Table>}
      <Table><TableHeader><TableRow><TableHead>Trial</TableHead><TableHead>Condition</TableHead><TableHead>Base RTTs (ms)</TableHead><TableHead>Replicate</TableHead><TableHead>Status</TableHead></TableRow></TableHeader><TableBody>{trials.slice(trialPage * 20, (trialPage + 1) * 20).map(t => { const c = configs.find(c => c.id === t.configuration_id)!; return <TableRow key={t.id}><TableCell><Link className="text-primary underline underline-offset-4" href={`${DELAY_STUDY_MODULE_PATH}/test-results/${t.id}`}>{t.id.slice(0, 8)}</Link></TableCell><TableCell>{treatmentName(c.treatment)}</TableCell><TableCell>{delays(c).join(" / ")}</TableCell><TableCell>{t.replicate}</TableCell><TableCell>{t.status}</TableCell></TableRow>; })}</TableBody></Table>
      <div className="flex items-center justify-between gap-3 text-xs"><span>{trials.length} scheduled trials in this selection</span><div className="flex gap-2"><Button variant="outline" size="sm" disabled={trialPage === 0} onClick={() => setTrialPage(p => p - 1)}>Previous</Button><Button variant="outline" size="sm" disabled={(trialPage + 1) * 20 >= trials.length} onClick={() => setTrialPage(p => p + 1)}>Next</Button></div></div>
    </CardContent></Card>
    <Card><CardHeader><CardTitle>Packet direction validation</CardTitle><CardDescription>1,000 uncongested UDP timestamp probes per condition and worker. ACK-side delay should increase RTT while preserving forward latency; forward-side delay is the positive control.</CardDescription></CardHeader><CardContent>{data.latency.length ? <Table><TableHeader><TableRow><TableHead>Worker</TableHead><TableHead>Condition</TableHead><TableHead>Received / sent</TableHead><TableHead>Median forward</TableHead><TableHead>Median RTT</TableHead><TableHead>Validation</TableHead></TableRow></TableHeader><TableBody>{data.latency.map(l => <TableRow key={`${l.worker_index}-${l.treatment}`}><TableCell>{l.worker_index}</TableCell><TableCell>{l.treatment.replaceAll("_", " ")}</TableCell><TableCell>{l.received_packets} / {l.sent_packets}</TableCell><TableCell>{fmt(l.median_forward_ms, 3)} ms</TableCell><TableCell>{fmt(l.median_rtt_ms, 3)} ms</TableCell><TableCell>{l.validation_passed ? "Passed" : "Failed"}</TableCell></TableRow>)}</TableBody></Table> : <p className="text-sm text-muted-foreground">Worker preflight measurements have not been ingested yet.</p>}</CardContent></Card>
  </div>;
}
