"use client";

import { useEffect, useState } from "react";
import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";
import { Textarea } from "@/app/components/ui/textarea";
import { ResearchSelect } from "./select";
import { researchRequest } from "@/lib/research-workflow-api";
import { executableCandidate, NETWORK_RUNNERS, type NetworkingCapabilities } from "@/lib/network-execution";
import type { IdeaDocument } from "@/lib/research-ideas";

const EMULATED = { num_clients: 1, client_delays_ms: [10], client_ccas: ["cubic"], client_file_sizes_mbytes: [1], bottleneck_all_client_rate_mbit: 100, bottleneck_buffer_kbytes: 125, script: "netem_cubic_benchmark_nines.py" };
function savedExecution(text: string) {
  try {
    const candidate = JSON.parse(text);
    if (!NETWORK_RUNNERS.some(item => item.id === candidate?.execution?.runner)) return null;
    const first = candidate.configurations?.[0];
    if (typeof first?.identity !== "string" || !first.details?.test_config) return null;
    return { runner: String(candidate.execution.runner), identity: first.identity as string, config: first.details.test_config, metrics: candidate.metrics,
      replications: Number(candidate.execution.replications), limits: candidate.execution.limits };
  } catch { return null; }
}

export function NetworkProtocolEditor({ studyId, document, protocol, onChange }: { studyId: string; document: IdeaDocument; protocol: string; onChange: (text: string) => void }) {
  const [initial] = useState(() => savedExecution(protocol));
  const [runner, setRunner] = useState<string>(initial?.runner ?? NETWORK_RUNNERS[0].id);
  const [identity, setIdentity] = useState(initial?.identity ?? "configuration-1");
  const [config, setConfig] = useState(JSON.stringify(initial?.config ?? EMULATED, null, 2));
  const [metrics, setMetrics] = useState(JSON.stringify(initial?.metrics ?? NETWORK_RUNNERS[0].units, null, 2));
  const [replications, setReplications] = useState(initial?.replications ?? 1);
  const [wall, setWall] = useState(Number(initial?.limits?.wall_seconds ?? 1800)); const [instances, setInstances] = useState(Number(initial?.limits?.max_instances ?? 1));
  const [outputBytes, setOutputBytes] = useState(Number(initial?.limits?.max_output_bytes ?? 3000000)); const [networkBytes, setNetworkBytes] = useState(Number(initial?.limits?.max_network_bytes ?? 1000000000));
  const [source, setSource] = useState(""); const [packageVersion, setPackageVersion] = useState("v1");
  const [privateName, setPrivateName] = useState("provider-config.json"); const [privateContent, setPrivateContent] = useState(""); const [privateVersion, setPrivateVersion] = useState("v1");
  const [capabilities, setCapabilities] = useState<NetworkingCapabilities | null>(null);
  const [message, setMessage] = useState(""); const [busy, setBusy] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    researchRequest<{ networking?: NetworkingCapabilities }>("/capabilities", { signal: controller.signal }).then(value => {
      if (!controller.signal.aborted) setCapabilities(value.networking ?? null);
    }).catch(error => { if (!controller.signal.aborted) setMessage(error instanceof Error ? error.message : "Executor availability is unknown."); });
    return () => controller.abort();
  }, []);
  function choose(value: string) {
    if (busy) return;
    setRunner(value); setMessage("");
    setMetrics(JSON.stringify(NETWORK_RUNNERS.find(item => item.id === value)?.units, null, 2));
    setInstances(value === "real-world-iperf-v1" ? 3 : 1);
    setConfig(JSON.stringify(value === "emulated-netem-v1" ? EMULATED : value === "custom-package-v1" ? { mode: "real-world", package: {}, arguments: [], parameters: {} } : {
      server: { region: "", zone_id: "", instance_type: "t3.medium" }, bottleneck: { region: "", zone_id: "", instance_type: "t3.medium" }, receivers: [{ region: "", zone_id: "", instance_type: "t3.medium" }],
      cca: "cubic", duration_seconds: 60, rate_mbit: 100, buffer_kbytes: 125, notes: "",
    }, null, 2));
  }
  async function upload() {
    setBusy(true); setMessage("");
    try {
      const value = JSON.parse(config);
      const saved = await researchRequest<Record<string, unknown>>(`/studies/${studyId}/network`, { method: "POST", body: JSON.stringify({ action: "upload-package", request_id: crypto.randomUUID(), source, version: packageVersion }) });
      setConfig(JSON.stringify({ ...value, package: saved }, null, 2));
      setMessage("Original package source retained privately with its SHA256. Apply the executable configuration, then save and review the new plan version.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Package persistence was not confirmed."); }
    finally { setBusy(false); }
  }
  async function compile() {
    setBusy(true); setMessage("");
    try {
      const previous = JSON.parse(protocol);
      const value = executableCandidate(document, previous, runner, identity, JSON.parse(config), replications,
        { wall_seconds: wall, max_instances: instances, max_output_bytes: outputBytes, max_network_bytes: networkBytes }, JSON.parse(metrics));
      const compiled = await researchRequest<{ document: Record<string, unknown> }>(`/studies/${studyId}/network`, { method: "POST", body: JSON.stringify({ action: "compile", document: value, original_configuration: config, configuration_identity: identity }) });
      onChange(JSON.stringify(compiled.document, null, 2));
      setMessage("Executable specifications and exact input hashes added to the candidate. Empty scientific-method fields still need your decisions. Save a new plan version before reviews.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Configuration compilation failed."); }
    finally { setBusy(false); }
  }
  async function uploadPrivateInput() {
    setBusy(true); setMessage("");
    try {
      const value = JSON.parse(config); const bytes = new TextEncoder().encode(privateContent);
      if (bytes.length > 24000) throw new Error("Use up to 24 KB for this private text input; larger binary inputs can use the owner API.");
      const original_base64 = btoa(Array.from(bytes, b => String.fromCharCode(b)).join(""));
      const saved = await researchRequest<Record<string, unknown>>(`/studies/${studyId}/network`, { method: "POST", body: JSON.stringify({ action: "upload-input", request_id: crypto.randomUUID(), original_base64, version: privateVersion }) });
      setConfig(JSON.stringify({ ...value, private_inputs: { ...(value.private_inputs ?? {}), [privateName]: saved } }, null, 2));
      setPrivateContent(""); setMessage("Original input retained privately. Only its artifact identity, version and hash enter the protocol; the package receives it through JUMPSERVE_INPUTS.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Private input persistence was not confirmed."); }
    finally { setBusy(false); }
  }
  return <details className="rounded-md border p-4"><summary className="cursor-pointer text-sm font-medium">Automatic networking execution</summary>
    <div className="mt-4 space-y-4 text-sm">
      <p>Choose a built-in networking test or a versioned custom package. The reviewed protocol freezes its configuration, repetitions and resource limits. Each invocation becomes a separate automatic queue job; completion preserves measurements and leaves scientific review pending.</p>
      {!capabilities ? <p role="status">The connected backend has not confirmed networking execution support.</p> : !capabilities.runners.find(item => item.id === runner)?.enabled ? <p role="status">This runner is registered but cloud execution is not enabled in the connected environment.</p> : null}
      <ResearchSelect label="Networking executor" value={runner} onChange={choose} options={NETWORK_RUNNERS.map(item => ({ value: item.id, label: item.name }))} />
      <label className="block space-y-1"><span>Configuration identity</span><Input disabled={busy} value={identity} onChange={e => setIdentity(e.target.value)} /></label>
      <label className="block space-y-1"><span>Networking test configuration JSON</span><Textarea aria-label="Networking test configuration JSON" disabled={busy} className="min-h-48 font-mono text-xs" value={config} onChange={e => setConfig(e.target.value)} /></label>
      {runner === "custom-package-v1" ? <div className="space-y-3 rounded-md border p-3">
        <p>Python scripts receive JUMPSERVE_SPEC and write JUMPSERVE_OUTPUT using the network-observations-v1 contract. Upload original source privately, or enter a public container image pinned by sha256 digest in the configuration. Custom packages run on one isolated EC2 host; external endpoints and required equipment must be specified. Credentials belong in private inputs.</p>
        <label className="block space-y-1"><span>Package version</span><Input disabled={busy} value={packageVersion} onChange={e => setPackageVersion(e.target.value)} /></label>
        <label className="block space-y-1"><span>Original Python experiment source</span><Textarea aria-label="Original Python experiment source" disabled={busy} className="min-h-40 font-mono text-xs" value={source} onChange={e => setSource(e.target.value)} /></label>
        <Button type="button" variant="outline" disabled={busy || !source.trim()} onClick={() => void upload()}>Preserve package source</Button>
        <details className="rounded-md border p-3"><summary className="cursor-pointer">Private provider, VPN or experiment input</summary><div className="mt-3 space-y-3">
          <p>Private files remain outside public protocols and model context. Scripts and containers read them from JUMPSERVE_INPUTS. Specify actual required provider or VPN credentials before queueing; the executor does not invent them.</p>
          <label className="block space-y-1"><span>Private input filename</span><Input disabled={busy} value={privateName} onChange={e => setPrivateName(e.target.value)} /></label>
          <label className="block space-y-1"><span>Private input version</span><Input disabled={busy} value={privateVersion} onChange={e => setPrivateVersion(e.target.value)} /></label>
          <label className="block space-y-1"><span>Original private input text</span><Textarea aria-label="Original private input text" disabled={busy} value={privateContent} onChange={e => setPrivateContent(e.target.value)} /></label>
          <Button type="button" variant="outline" disabled={busy || !privateContent || !privateName || !privateVersion} onClick={() => void uploadPrivateInput()}>Preserve private experiment input</Button>
        </div></details>
      </div> : null}
      <label className="block space-y-1"><span>Recorded metrics and units JSON</span><Textarea aria-label="Recorded metrics and units JSON" disabled={busy} className="font-mono text-xs" value={metrics} onChange={e => setMetrics(e.target.value)} /></label>
      <div className="grid gap-3 sm:grid-cols-2">{[
        ["Replications per configuration", replications, setReplications, 1, 32], ["Execution wall limit (seconds)", wall, setWall, 60, 3600],
        ["Maximum instances per invocation", instances, setInstances, 1, 18], ["Maximum output bytes", outputBytes, setOutputBytes, 1024, 3000000],
        ["Network byte threshold (custom host sampling)", networkBytes, setNetworkBytes, 1024, 10000000000],
      ].map(([label, value, setter, min, max]) => <label key={String(label)} className="block space-y-1"><span>{String(label)}</span><Input disabled={busy} type="number" min={Number(min)} max={Number(max)} value={Number(value)} onChange={event => (setter as (value: number) => void)(Number(event.target.value))} /></label>)}</div>
      <p className="text-xs text-muted-foreground">Defaults are editable execution settings. Dates, sampling rationale, exclusions, dependence and other scientific choices remain unknown until you specify them. Add shared exclusive resource identities in execution.exclusive_resources where trials could interfere. Custom hosts sample network and output counters; thresholds can overshoot between checks. Built-in runners retain their existing traffic controls and do not enforce this network byte threshold. Configured limits are not measured charges.</p>
      <Button type="button" disabled={busy || !capabilities} onClick={() => void compile()}>{busy ? "Preserving configuration…" : "Apply executable configuration to candidate"}</Button>
      {message ? <p role="status">{message}</p> : null}
    </div>
  </details>;
}
