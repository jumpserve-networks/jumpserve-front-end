"use client";

import { useEffect, useState } from "react";
import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";
import { Textarea } from "@/app/components/ui/textarea";
import { RealWorldPlacement } from "@/app/components/real-world-placement";
import { realWorldRequest } from "@/lib/real-world-api";
import { emptyPlacement, updateRealWorldPlacement, type AwsRegion, type RealWorldConfig } from "@/lib/real-world";
import { ResearchSelect } from "./select";

const CCAS = ["cubic", "bbr", "bbr2", "bbr3", "reno", "vegas", "htcp", "highspeed", "scalable", "westwood"];
type Values = Record<string, unknown>;
export function NetworkingFields({ runner, text, disabled, onChange, onValidityChange }: { runner: string; text: string; disabled: boolean; onChange: (update: (previous: Values) => Values) => void; onValidityChange: (valid: boolean) => void }) {
  const [regions, setRegions] = useState<AwsRegion[]>([]); const [regionError, setRegionError] = useState("");
  const [parameters, setParameters] = useState<string | null>(null); const [parameterError, setParameterError] = useState("");
  useEffect(() => {
    if (runner !== "real-world-iperf-v1") return;
    let active = true;
    realWorldRequest<{ regions: AwsRegion[] }>("/regions").then(value => { if (active) { setRegions(value.regions); setRegionError(""); } }).catch(error => { if (active) setRegionError(error instanceof Error ? error.message : "Region availability could not be loaded."); });
    return () => { active = false; };
  }, [runner]);
  let value: Values;
  try { value = JSON.parse(text); if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(); }
  catch { return <p className="text-sm">The configuration needs valid fields. Open the full configuration below to correct it; it cannot be compiled until valid.</p>; }
  function numeric(key: string, label: string, min: number, max: number, step = 1) {
    return <label key={key} className="block space-y-1"><span>{label}</span><Input aria-label={label} type="number" min={min} max={max} step={step} required disabled={disabled} value={typeof value[key] === "number" ? Number(value[key]) : ""} onChange={event => { const n = event.target.valueAsNumber; onChange(previous => ({ ...previous, [key]: Number.isFinite(n) ? n : null })); }} /></label>;
  }
  if (runner === "emulated-netem-v1") {
    if (value.script === "netem_multi_bottleneck.py") return <p className="text-sm">This saved configuration has multiple bottlenecks. Preserve its topology using the full configuration editor below.</p>;
    const count = typeof value.num_clients === "number" && Number.isInteger(value.num_clients) ? Math.min(10, Math.max(1, value.num_clients)) : 1;
    return <div className="space-y-4 rounded-md border p-3"><p>Model a controlled network on one host. Choose clients, algorithms, workload size and bottleneck settings. These editable defaults must match your proposed comparison.</p>
      <label className="block space-y-1"><span>Number of clients</span><Input aria-label="Number of clients" type="number" min={1} max={10} required disabled={disabled} value={count} onChange={event => { const n = event.target.valueAsNumber; if (!Number.isInteger(n) || n < 1 || n > 10) return; onChange(previous => ({ ...previous, num_clients: n, ...Object.fromEntries([["client_delays_ms", 10], ["client_ccas", "cubic"], ["client_file_sizes_mbytes", 1], ...(previous.client_start_delays_ms ? [["client_start_delays_ms", 0]] : [])].map(([key, fallback]) => [String(key), Array.from({ length: n }, (_, i) => (previous[String(key)] as unknown[])?.[i] ?? fallback)])) })); }} /></label>
      <div className="grid gap-3 sm:grid-cols-2">{numeric("bottleneck_all_client_rate_mbit", "Bottleneck rate (Mbit/s)", 1, 10000)}{numeric("bottleneck_buffer_kbytes", "Bottleneck buffer (kB)", 0, 100000)}</div>
      {Array.from({ length: count }, (_, index) => <fieldset key={index} disabled={disabled} className="space-y-3 rounded-md border p-3"><legend className="px-1 font-medium">Client {index + 1}</legend><ResearchSelect label={`Client ${index + 1} congestion control`} value={String((value.client_ccas as string[])?.[index] ?? "")} onChange={cca => { if (!disabled) onChange(previous => ({ ...previous, client_ccas: (previous.client_ccas as string[]).map((old, i) => i === index ? cca : old) })); }} options={CCAS.map(cca => ({ value: cca, label: cca.toUpperCase() }))} />{[["client_delays_ms", "Configured delay (ms)", 0, 5000, 1], ["client_file_sizes_mbytes", "File size (MB)", 0.1, 1000, 0.1]].map(([key, label, min, max, step]) => <label key={String(key)} className="block space-y-1"><span>{String(label)}</span><Input aria-label={`Client ${index + 1} ${String(label).toLowerCase()}`} disabled={disabled} type="number" required min={Number(min)} max={Number(max)} step={Number(step)} value={Number((value[String(key)] as number[])?.[index] ?? 0)} onChange={event => { const n = event.target.valueAsNumber; onChange(previous => ({ ...previous, [String(key)]: (previous[String(key)] as unknown[]).map((old, i) => i === index ? Number.isFinite(n) ? n : null : old) })); }} /></label>)}</fieldset>)}
    </div>;
  }
  if (runner === "real-world-iperf-v1") {
    const config = value as unknown as RealWorldConfig;
    if (!config.server || !config.bottleneck || !Array.isArray(config.receivers)) return <p>Correct the saved topology in the full configuration editor below.</p>;
    return <div className="space-y-4 rounded-md border p-3"><p>Choose each actual EC2 placement. Available zones and instance types come from the existing networking service; a selected city or Region is not a measurement of the traffic path.</p>{regionError ? <p role="alert">{regionError} You can keep editing the plan; actual placement must be verified before launch.</p> : null}<ResearchSelect label="Server congestion control" value={config.cca} onChange={cca => { if (!disabled) onChange(previous => ({ ...previous, cca })); }} options={["cubic", "bbr", "reno"].map(cca => ({ value: cca, label: cca.toUpperCase() }))} /><div className="grid gap-3 sm:grid-cols-2">{numeric("duration_seconds", "Transfer duration (seconds)", 10, 600)}{numeric("rate_mbit", "Shared rate (Mbit/s)", 1, 1000)}{numeric("buffer_kbytes", "Queue buffer (kB)", 2, 10000)}</div>
      {(["server", "bottleneck", ...config.receivers.map((_, i) => i)] as const).map(machine => <RealWorldPlacement key={String(machine)} label={typeof machine === "number" ? `Receiver ${machine + 1}` : machine === "server" ? "Server" : "Bottleneck"} value={typeof machine === "number" ? config.receivers[machine] : config[machine]} regions={regions} disabled={disabled || !regions.length} onChange={update => onChange(previous => updateRealWorldPlacement(previous as unknown as RealWorldConfig, machine, update) as unknown as Values)} />)}
      <div className="flex flex-wrap gap-2"><Button type="button" variant="outline" size="sm" disabled={disabled || config.receivers.length >= 16} onClick={() => onChange(previous => ({ ...previous, receivers: [...(previous.receivers as unknown[]), emptyPlacement()] }))}>Add receiver</Button><Button type="button" variant="outline" size="sm" disabled={disabled || config.receivers.length <= 1} onClick={() => onChange(previous => ({ ...previous, receivers: (previous.receivers as unknown[]).slice(0, -1) }))}>Remove last receiver</Button></div>
    </div>;
  }
  return <div className="space-y-3 rounded-md border p-3"><p>Choose this for experiments beyond the built-in topology, such as controlled CDN probes. Upload a versioned implementation and declare its endpoints and parameters. Required origin or VPN credentials belong in private inputs below.</p><ResearchSelect label="Custom experiment environment" value={String(value.mode ?? "")} onChange={mode => { if (!disabled) onChange(previous => ({ ...previous, mode })); }} options={[{ value: "emulated", label: "Emulated network on an isolated host" }, { value: "real-world", label: "Real network measurements from an isolated host" }]} /><label className="block space-y-1"><span>Experiment parameters JSON</span><Textarea aria-label="Experiment parameters JSON" disabled={disabled} className="min-h-28 font-mono text-xs" value={parameters ?? JSON.stringify(value.parameters ?? {}, null, 2)} onChange={event => { setParameters(event.target.value); try { const parsed = JSON.parse(event.target.value); if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error(); setParameterError(""); onValidityChange(true); onChange(previous => ({ ...previous, parameters: parsed })); } catch { setParameterError("Enter a valid JSON object for the package parameters. Compilation is blocked until corrected."); onValidityChange(false); } }} /></label>{parameterError ? <p role="alert" className="text-destructive">{parameterError}</p> : null}<p className="text-xs text-muted-foreground">Parameters must match the uploaded implementation. The full configuration below preserves its original text and supports container images and command arguments.</p></div>;
}

export function NetworkingMetricFields({ text, disabled, onChange }: { text: string; disabled: boolean; onChange: (text: string) => void }) {
  let metrics: Values[];
  try { metrics = JSON.parse(text); if (!Array.isArray(metrics) || metrics.some(m => !m || typeof m !== "object")) throw new Error(); }
  catch { return <p>Correct the metric declarations in the full editor below.</p>; }
  function edit(index: number, key: string, value: string) {
    onChange(JSON.stringify(metrics.map((metric, i) => {
      if (i !== index) return metric;
      const next = { ...metric }; if (key === "planned_observations") { if (!value) delete next[key]; else next[key] = Number(value); } else next[key] = value;
      return next;
    }), null, 2));
  }
  return <div className="space-y-3 rounded-md border p-3"><h3 className="font-medium">What the executor should record</h3><p>Names and units must match the implementation and your analysis. Set an expected count per invocation when known; leave it empty if genuinely unknown.</p>{metrics.map((metric, index) => <div key={index} className="grid gap-3 rounded-md border p-3 sm:grid-cols-3">{[["name", "Metric name"], ["units", "Metric units"], ["planned_observations", "Expected records per invocation"]].map(([key, label]) => <label key={key} className="block space-y-1"><span>{label}</span><Input aria-label={`${label} ${index + 1}`} disabled={disabled} required={key !== "planned_observations"} type={key === "planned_observations" ? "number" : "text"} min={key === "planned_observations" ? 1 : undefined} max={key === "planned_observations" ? 10000 : undefined} value={String(metric[key] ?? "")} onChange={event => edit(index, key, event.target.value)} /></label>)}<Button type="button" variant="ghost" size="sm" disabled={disabled || metrics.length <= 1} onClick={() => onChange(JSON.stringify(metrics.filter((_, i) => i !== index), null, 2))}>Remove metric {index + 1}</Button></div>)}<Button type="button" variant="outline" size="sm" disabled={disabled || metrics.length >= 20} onClick={() => onChange(JSON.stringify([...metrics, { name: "", units: "" }], null, 2))}>Add another metric</Button></div>;
}
