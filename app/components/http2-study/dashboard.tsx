"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/app/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/app/components/ui/select";
import { Table } from "@/app/components/ui/table";
import { HTTP2_STUDY_MODULE_PATH as PATH } from "@/lib/test-modules";
import { OUTCOMES, descriptiveCount, type Http2Data, type Measurement } from "@/lib/http2-study";
const COLORS = ["text-primary", "text-amber-600 dark:text-amber-400", "text-lime-600 dark:text-lime-400"];
function Bars({ rows, title, max = 156 }: { rows: { label: string; values: (number | null)[] }[]; title: string; max?: number }) {
  const width = 680, height = rows.length * 46 + 25;
  return <svg role="img" aria-label={title} viewBox={`0 0 ${width} ${height}`} className="w-full min-w-0">
    <title>{`${title}. Counts in designed test cases; no confidence intervals.`}</title>
    {rows.map((row, i) => <g key={row.label}>
      <text x="0" y={i * 46 + 16} fill="currentColor" fontSize="12">{row.label}</text>
      {row.values.map((value, j) => <g key={j} className={COLORS[j % COLORS.length]}>
        {value === null ? <text x="175" y={i * 46 + 9 + j * 13} fill="currentColor" fontSize="10">unreported</text> : <>
          <rect x="175" y={i * 46 + j * 13} width={Math.max(0, value / max * 440)} height="8" fill="currentColor" opacity="0.8" />
          <text x={180 + value / max * 440} y={i * 46 + 8 + j * 13} fill="currentColor" fontSize="10">{value}</text>
        </>}
      </g>)}
    </g>)}
  </svg>;
}
export function Http2Dashboard({ data }: { data: Http2Data }) {
  const [all, setAll] = useState(false);
  const visible = data.summaries.filter(s => all || s.published_counts !== null);
  const [selected, setSelected] = useState(visible[0]?.configuration_id ?? "");
  const summary = visible.find(s => s.configuration_id === selected) ?? visible[0];
  const config = data.configurations.find(c => c.id === summary?.configuration_id);
  const run = data.runs.find(r => r.id === summary?.run_id);
  const [evidence, setEvidence] = useState<{ runId: string | null; rows: Measurement[]; error: string | null }>({ runId: null, rows: [], error: null });
  const runId = summary?.run_id;
  const planned = summary?.planned;
  const loading = evidence.runId !== runId;
  const measurements = loading ? [] : evidence.rows;
  const error = loading ? null : evidence.error;
  useEffect(() => {
    if (!runId) return;
    const abort = new AbortController();
    fetch(`${PATH}/api/measurements?runId=${encodeURIComponent(runId)}`, { signal: abort.signal }).then(async r => {
      if (!r.ok) throw new Error(`Measurements unavailable (HTTP ${r.status})`);
      const body = await r.json();
      if (!Array.isArray(body.measurements) || body.measurements.length !== planned) throw new Error("Per-test coverage mismatch");
      if (!abort.signal.aborted) setEvidence({ runId, rows: body.measurements, error: null });
    }).catch(e => { if (!abort.signal.aborted) setEvidence({ runId, rows: [], error: e.message }); });
    return () => abort.abort();
  }, [runId, planned]);
  if (!summary || !config) return <p>No recorded configuration is available.</p>;
  const main = data.summaries.filter(s => s.published_counts !== null);
  const primaryUnknown = main.reduce((sum, s) => sum + s.unknown, 0);
  return <div className="space-y-6">
    <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-4 text-sm">
      <strong>Assessment complete within the declared scope; reproduction coverage is partial.</strong> Table 5 counts and rounded Figures 5–6 match the archived data under the original classifier. Figures 7–8 have documented discrepancies. Full physical proxy/cloud replication remains untested.
    </div>
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{[["Published subset", "15 datasets · 1,950 cases"], ["Full archive", `${data.campaign.recorded_runs} datasets · ${data.campaign.planned_measurements.toLocaleString()} cases`], ["Unknown evidence", `${primaryUnknown} / 1,950 primary cases`], ["Uncertainty", "Descriptive counts; no CIs"]].map(([label, value]) => <div key={label} className="rounded-lg border p-4"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 text-sm font-medium">{value}</p></div>)}</div>
    <p className="text-sm text-muted-foreground">These are archived empirical protocol observations, not simulations. The 72 fresh loopback endpoint measurements are a separate follow-up. Rejection (1,745 / 1,950) includes 856 drops; it is not a compliance rate. Accepted: 205 / 1,950.</p>
    <div className="flex flex-wrap items-end gap-4">
      <div className="space-y-1 text-sm"><label id="http2-configuration-label" className="block">Recorded configuration</label><Select value={summary.configuration_id} onValueChange={value => { if (value) setSelected(value); }} items={visible.map(s => ({ value: s.configuration_id, label: s.configuration_id }))}><SelectTrigger aria-labelledby="http2-configuration-label" className="max-w-full"><SelectValue /></SelectTrigger><SelectContent>{visible.map(s => <SelectItem key={s.configuration_id} value={s.configuration_id}>{s.configuration_id}</SelectItem>)}</SelectContent></Select></div>
      <Button variant="outline" onClick={() => setAll(v => !v)} aria-pressed={all}>{all ? "Show published subset" : "Show all archived versions"}</Button>
      <a className="text-sm underline underline-offset-4" href={`${PATH}/api/results`}>Download all evidence (JSON)</a>
      <a className="text-sm underline underline-offset-4" href={`${PATH}/api/results?format=csv`}>Archive measurements (CSV)</a>
    </div>
    <div className="grid gap-4 lg:grid-cols-2">
      <section className="rounded-lg border p-4"><h2 className="font-medium">Published numerical comparison</h2><p className="my-2 text-xs text-muted-foreground"><span className="text-primary">Original reanalysis</span> · <span className="text-amber-600 dark:text-amber-400">Paper Table 5</span>. Unit: cases; denominator {summary.planned}. Zero is shown only for recorded categories; unreported published categories stay absent.</p>
        <Bars title="Published versus archived original counts" max={summary.planned} rows={OUTCOMES.filter(k => k !== "unknown").map(k => ({ label: k === "500" ? "HTTP rejection (E)" : k, values: [descriptiveCount(summary, k, false), summary.published_counts?.[k] ?? null] }))} />
      </section>
      <section className="rounded-lg border p-4"><h2 className="font-medium">Classification sensitivity</h2><p className="my-2 text-xs text-muted-foreground"><span className="text-primary">Original classifier</span> · <span className="text-amber-600 dark:text-amber-400">Evidence preserved</span>. {summary.recoded} recoded / {summary.planned} cases; this difference is not a confidence interval.</p>
        <Bars title="Original versus evidence-preserving outcome counts" max={summary.planned} rows={OUTCOMES.map(k => ({ label: k, values: [descriptiveCount(summary, k, false), descriptiveCount(summary, k, true)] }))} />
      </section>
    </div>
    <section className="rounded-lg border p-4"><h2 className="font-medium">Configuration, counts and comparison limits</h2>
      <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3">{[["Proxy version", `${config.proxy} · ${config.version ?? "unavailable"}`], ["Mode / TLS", `${config.mode} · TLS ${config.tls === null ? "unavailable" : config.tls ? "yes" : "no"}`], ["Recorded / planned", `${summary.recorded} / ${summary.planned}`], ["Missing / unknown", `${summary.missing} / ${summary.unknown}`], ["Observed scope / incompatible", `${summary.scope_observed} / ${summary.scope_mismatches}`], ["Worker resources", config.actual_resources ? JSON.stringify(config.actual_resources) : "unavailable"], ["Original execution UTC", run?.original_execution_at ?? "unavailable"], ["Mirrored pairs", summary.comparisons.paired_cases === null ? "not applicable: client only" : `${summary.comparisons.author_pair_differences} / 61 original differences; ${summary.comparisons.known_pairs} known pairs after recoding`]].map(([key, value]) => <div key={key}><dt className="text-xs text-muted-foreground">{key}</dt><dd>{value}</dd></div>)}</dl>
      <p className="mt-3 text-xs text-muted-foreground">A stream error may escalate to GOAWAY; generic HTTP rejection does not validate an HTTP/2 error code. No causal estimate compares these historical versions. Unlabelled TLS and missing deployment fields prevent controlled TLS attribution.</p>
      <details className="mt-3 text-sm"><summary className="cursor-pointer">Recorded configuration and source hashes</summary><pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap break-all text-xs">{JSON.stringify({ configuration: config, run }, null, 2)}</pre></details>
      <Link className="mt-3 inline-block text-sm underline underline-offset-4" href={`${PATH}/chat?configuration=${encodeURIComponent(config.id)}`}>Prepare a question about this configuration</Link>
    </section>
    <section className="rounded-lg border p-4"><h2 className="font-medium">Figure 8: corrected matched acceptance changes</h2><p className="my-2 text-xs text-muted-foreground">78 identical client cases. Published bar values versus corrected H2H1 − H2EE accepted counts; a negative value means fewer accepted messages. The released bar generator mislabels accepted H2EE messages as dropped.</p>
      <div className="overflow-x-auto"><Table className="w-full text-left text-sm"><thead><tr><th className="p-2">Configuration</th><th className="p-2">Published</th><th className="p-2">Corrected</th></tr></thead><tbody>{main.filter(s => s.comparisons.translation?.published_accepted_change != null).map(s => <tr key={s.run_id} className="border-t"><td className="p-2">{s.configuration_id}</td><td className="p-2">+{s.comparisons.translation!.published_accepted_change}</td><td className="p-2">{s.comparisons.translation!.corrected_accepted_change > 0 ? "+" : ""}{s.comparisons.translation!.corrected_accepted_change} cases</td></tr>)}</tbody></Table></div>
    </section>
    <section className="rounded-lg border p-4"><h2 className="font-medium">Independent loopback controls</h2><p className="my-2 text-sm text-muted-foreground">Node 24.4.1 endpoint, macOS arm64, cleartext TCP loopback. Nine-octet frames verify framing. This is an endpoint control, not a proxy, cloud, historical Node 20.16.0 or simulator replication. Three process restarts on one host are correlated; no confidence interval is reported.</p>
      {data.followups.map(f => <div className="mt-3" key={f.id}><p className="text-xs font-medium">{f.id} · {f.recorded} / {f.planned} recorded</p><Bars max={f.planned} title={`${f.id} expected code agreements and mismatches`} rows={[{ label: "Agreement", values: [f.summary.agreement] }, { label: "Code mismatch", values: [f.summary.disagreement] }, { label: "Unknown / failed", values: [f.summary.unknown_or_failed] }]} /></div>)}
      <p className="text-xs text-muted-foreground">All positive controls passed. Five malformed cases returned code 2 instead of the planned code 1, consistently at 0.25 and 1 second. Elapsed time is observation duration, not measured network latency.</p>
    </section>
    <section className="rounded-lg border p-4"><h2 className="font-medium">Per-test evidence · {config.id}</h2><p className="my-2 text-xs text-muted-foreground">Unknowns, reasons and expected semantics are preserved; {summary.planned} designed cases are not independent random replications.</p>
      {loading && <p role="status">Loading recorded cases…</p>}{error && <p role="alert">{error}</p>}
      <div className="max-h-96 overflow-auto"><Table className="w-full text-left text-xs"><thead className="sticky top-0 bg-background"><tr>{["Case", "Side", "Expected", "Original", "Preserved", "Code", "Evidence"].map(label => <th key={label} className="p-2">{label}</th>)}</tr></thead><tbody>{measurements.map(m => <tr key={m.test_id} className="border-t"><td className="p-2">{m.test_id}</td><td className="p-2">{m.side}</td><td className="p-2">{m.expected} {m.expected_scope ?? ""}</td><td className="p-2">{m.author_outcome}</td><td className="p-2">{m.outcome}</td><td className="p-2">{m.error_code ?? "unavailable"}</td><td className="min-w-52 p-2">{m.description}<br /><span className="text-muted-foreground">{m.reason ?? m.status}</span></td></tr>)}</tbody></Table></div>
    </section>
  </div>;
}
