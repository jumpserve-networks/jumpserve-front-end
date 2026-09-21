"use client";

import { EMULATED_MODULE_PATH } from "@/lib/test-modules";

import { Label } from "@/app/components/ui/label";
import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";
import { Textarea } from "@/app/components/ui/textarea";

import { requireAccessToken } from "@/lib/browser-auth";
import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/app/components/ui/select";
import {
  launchBenchmark,
  defaultConfig,
  AVAILABLE_CCAS,
  AVAILABLE_SCRIPTS,
  AVAILABLE_TOPOLOGIES,
  validateMultiBottleneckConfig,
  type BenchmarkConfig,
} from "@/lib/benchmark-api";

interface SavedConfig {
  id: string;
  name: string;
  description: string | null;
  config: BenchmarkConfig;
}

function parseNumberArray(value: string): number[] {
  return value
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s !== "")
    .map(Number)
    .filter((n) => !isNaN(n));
}

export function BenchmarkForm() {
  const router = useRouter();
  const launchPending = useRef(false);
  const [supabase] = useState(() => createClient());
  const [config, setConfig] = useState<BenchmarkConfig>(defaultConfig());
  const [savedConfigs, setSavedConfigs] = useState<SavedConfig[]>([]);
  const [configName, setConfigName] = useState("");
  const [configDescription, setConfigDescription] = useState("");
  const [selectedConfigId, setSelectedConfigId] = useState<string | null>(null);
  const [isLaunching, setIsLaunching] = useState(false);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  // Raw text inputs for comma-separated fields
  const [delaysText, setDelaysText] = useState(
    config.client_delays_ms.join(", "),
  );
  const [fileSizesText, setFileSizesText] = useState(
    config.client_file_sizes_mbytes.join(", "),
  );
  const [startDelaysText, setStartDelaysText] = useState(
    config.client_start_delays_ms.join(", "),
  );
  const [experimentName, setExperimentName] = useState("");
  const [tagsText, setTagsText] = useState("");
  const [notes, setNotes] = useState("");
  const [ratesText, setRatesText] = useState("100, 50");
  const [buffersText, setBuffersText] = useState("125, 125");
  const [groupsText, setGroupsText] = useState("1, 1");
  const multiBottleneck = config.script === "netem_multi_bottleneck.py";

  const loadConfigs = useCallback(async () => {
    const { data } = await supabase
      .from("benchmark_configs")
      .select("id, name, description, config")
      .order("created_at", { ascending: false });
    return data as SavedConfig[] | null;
  }, [supabase]);

  useEffect(() => {
    let active = true;
    void loadConfigs().then((data) => {
      if (active && data) setSavedConfigs(data);
    });
    return () => { active = false; };
  }, [loadConfigs]);

  function applyConfig(saved: SavedConfig) {
    setConfig(saved.config);
    setDelaysText(saved.config.client_delays_ms.join(", "));
    setFileSizesText(saved.config.client_file_sizes_mbytes.join(", "));
    setStartDelaysText(saved.config.client_start_delays_ms.join(", "));
    setRatesText((saved.config.bottleneck_rates_mbit ?? [100, 50]).join(", "));
    setBuffersText((saved.config.bottleneck_buffers_kbytes ?? [125, 125]).join(", "));
    setGroupsText((saved.config.client_groups ?? [Math.ceil(saved.config.num_clients / 2), Math.floor(saved.config.num_clients / 2)]).join(", "));
    setExperimentName(saved.config.experiment_name ?? "");
    setTagsText((saved.config.tags ?? []).join(", "));
    setNotes(saved.config.notes ?? "");
    setMessage(null);
  }

  async function handleSaveConfig() {
    if (!configName.trim()) return;
    const finalConfig = buildFinalConfig();
    if (!finalConfig) return;

    const row = {
      name: configName.trim(),
      config: finalConfig,
      ...(configDescription.trim() ? { description: configDescription.trim() } : {}),
    };

    const { error } = await supabase.from("benchmark_configs").insert(row);

    if (error) {
      setMessage({ type: "error", text: `Failed to save: ${error.message}` });
    } else {
      setMessage({ type: "success", text: "Config saved!" });
      setConfigName("");
      setConfigDescription("");
      const data = await loadConfigs();
      if (data) setSavedConfigs(data);
    }
  }

  async function handleDeleteConfig() {
    if (!selectedConfigId) return;
    const { error } = await supabase
      .from("benchmark_configs")
      .delete()
      .eq("id", selectedConfigId);
    if (error) {
      setMessage({ type: "error", text: `Failed to delete: ${error.message}` });
    } else {
      setSelectedConfigId(null);
      setMessage({ type: "success", text: "Config deleted" });
      const data = await loadConfigs();
      if (data) setSavedConfigs(data);
    }
  }

  function buildFinalConfig(): BenchmarkConfig | null {
    const delays = parseNumberArray(delaysText);
    const fileSizes = parseNumberArray(fileSizesText);
    const startDelays = parseNumberArray(startDelaysText);
    const numClients = config.num_clients;

    if (delays.length !== numClients) {
      setMessage({
        type: "error",
        text: `Expected ${numClients} delay values, got ${delays.length}`,
      });
      return null;
    }
    if (config.client_ccas.length !== numClients) {
      setMessage({
        type: "error",
        text: `Expected ${numClients} CCA selections, got ${config.client_ccas.length}`,
      });
      return null;
    }
    if (fileSizes.length !== numClients) {
      setMessage({
        type: "error",
        text: `Expected ${numClients} file size values, got ${fileSizes.length}`,
      });
      return null;
    }

    // Pad start delays with 0s if not enough
    const paddedStartDelays =
      startDelays.length >= numClients
        ? startDelays.slice(0, numClients)
        : [
            ...startDelays,
            ...Array(numClients - startDelays.length).fill(0),
          ];

    const finalConfig: BenchmarkConfig = {
      ...config,
      client_delays_ms: delays,
      client_file_sizes_mbytes: fileSizes,
      client_start_delays_ms: paddedStartDelays,
    };
    if (multiBottleneck) {
      // Keep invalid entries visible to validation instead of dropping them.
      const parsePair = (text: string) => text.split(",").map((part) => part.trim() === "" ? NaN : Number(part));
      finalConfig.bottleneck_rates_mbit = parsePair(ratesText);
      finalConfig.bottleneck_buffers_kbytes = parsePair(buffersText);
      if (config.topology === "dumbbell") finalConfig.client_groups = parsePair(groupsText);
      else delete finalConfig.client_groups;
      const error = validateMultiBottleneckConfig(finalConfig);
      if (error) {
        setMessage({ type: "error", text: error });
        return null;
      }
    } else {
      delete finalConfig.topology;
      delete finalConfig.bottleneck_rates_mbit;
      delete finalConfig.bottleneck_buffers_kbytes;
      delete finalConfig.client_groups;
    }
    if (experimentName.trim()) finalConfig.experiment_name = experimentName.trim();
    if (tagsText.trim()) {
      finalConfig.tags = tagsText.split(",").map((t) => t.trim()).filter(Boolean);
    }
    if (notes.trim()) finalConfig.notes = notes.trim();
    return finalConfig;
  }

  async function handleLaunch() {
    if (launchPending.current) return;
    setMessage(null);
    const finalConfig = buildFinalConfig();
    if (!finalConfig) return;

    launchPending.current = true;
    setIsLaunching(true);
    try {
      const result = await launchBenchmark(finalConfig, await requireAccessToken());
      router.push(`${EMULATED_MODULE_PATH}/benchmarks/${encodeURIComponent(result.jobId)}`);
    } catch (err: unknown) {
      setMessage({ type: "error", text: err instanceof Error ? err.message : "Failed to launch benchmark. Please try again." });
      launchPending.current = false;
      setIsLaunching(false);
    }
  }

  function handleCcaToggle(cca: string) {
    const current = [...config.client_ccas];
    const numClients = config.num_clients;

    // Add or remove CCA (fill up to numClients)
    if (current.length < numClients) {
      setConfig({ ...config, client_ccas: [...current, cca] });
    } else {
      // Replace the last one
      const updated = [...current];
      updated[updated.length - 1] = cca;
      setConfig({ ...config, client_ccas: updated });
    }
  }

  function handleCcaTextChange(text: string) {
    const ccas = text
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter((s) => s !== "");
    setConfig({ ...config, client_ccas: ccas });
  }

  const inputClasses =
    "w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground transition focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/30";
  const labelClasses =
    "block text-sm font-medium text-foreground dark:text-muted-foreground mb-1";

  return (
    <div className="space-y-6">
      {/* Load saved config */}
      {savedConfigs.length > 0 && (
        <div>
          <Label htmlFor="benchmark-saved-config" className={labelClasses}>Load Saved Config</Label>
          <div className="flex gap-2">
            <Select
              items={savedConfigs.map((saved) => ({
                value: saved.id,
                label: `${saved.name}${saved.description ? ` — ${saved.description}` : ""}`,
              }))}
              value={selectedConfigId}
              onValueChange={(value) => {
                const found = savedConfigs.find((c) => c.id === value);
                if (found) {
                  setSelectedConfigId(found.id);
                  applyConfig(found);
                }
              }}
            >
              <SelectTrigger id="benchmark-saved-config" className="w-full min-w-0">
                <SelectValue placeholder="Select a config..." />
              </SelectTrigger>
              <SelectContent alignItemWithTrigger={false} align="start">
                {savedConfigs.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}{c.description ? ` — ${c.description}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="ghost"
              size="sm"
              type="button"
              onClick={handleDeleteConfig}
              disabled={!selectedConfigId}
              className="h-auto whitespace-normal whitespace-nowrap rounded-lg border border-red-300 bg-card px-3 py-2 text-sm font-medium text-red-600 transition hover:bg-red-50 disabled:opacity-30 dark:border-red-500/40 dark:text-red-400 dark:hover:bg-red-500/10"
              title="Delete selected config"
            >
              Delete
            </Button>
          </div>
        </div>
      )}

      {/* Script */}
      <div>
        <Label htmlFor="benchmark-script" className={labelClasses}>Benchmark Script</Label>
        <Select
          items={AVAILABLE_SCRIPTS}
          value={config.script}
          onValueChange={(value) => {
            if (value !== null) setConfig({ ...config, script: value });
          }}
        >
          <SelectTrigger id="benchmark-script" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent alignItemWithTrigger={false} align="start">
            {AVAILABLE_SCRIPTS.map((s) => (
              <SelectItem key={s.value} value={s.value}>
                {s.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Number of clients */}
      <div>
        <Label htmlFor="benchmark-num-clients" className={labelClasses}>Number of Clients</Label>
        <Input id="benchmark-num-clients"
          type="number"
          min={1}
          max={10}
          className={inputClasses}
          value={config.num_clients}
          onChange={(e) =>
            setConfig({ ...config, num_clients: parseInt(e.target.value) || 2 })
          }
        />
      </div>

      {/* Client delays */}
      <div>
        <Label htmlFor="benchmark-delays" className={labelClasses}>
          Client Delays (ms, comma-separated)
        </Label>
        <Input id="benchmark-delays"
          type="text"
          className={inputClasses}
          value={delaysText}
          onChange={(e) => setDelaysText(e.target.value)}
          placeholder="10, 60"
        />
        <p className="mt-1 text-xs text-muted-foreground">
          One value per client
        </p>
      </div>

      {/* Client CCAs */}
      <div>
        <Label htmlFor="benchmark-ccas" className={labelClasses}>
          Client CCAs (comma-separated)
        </Label>
        <Input id="benchmark-ccas"
          type="text"
          className={inputClasses}
          value={config.client_ccas.join(", ")}
          onChange={(e) => handleCcaTextChange(e.target.value)}
          placeholder="cubic, bbr"
        />
        <div className="mt-2 flex flex-wrap gap-1.5">
          {AVAILABLE_CCAS.map((cca) => (
            <Button
              variant="ghost"
              size="sm"
              key={cca}
              type="button"
              onClick={() => handleCcaToggle(cca)}
              className={`h-auto whitespace-normal rounded-full px-2.5 py-0.5 text-xs font-medium transition ${
                config.client_ccas.includes(cca)
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              }`}
            >
              {cca}
            </Button>
          ))}
        </div>
      </div>

      {/* File sizes */}
      <div>
        <Label htmlFor="benchmark-file-sizes" className={labelClasses}>
          Client File Sizes (MB, comma-separated)
        </Label>
        <Input id="benchmark-file-sizes"
          type="text"
          className={inputClasses}
          value={fileSizesText}
          onChange={(e) => setFileSizesText(e.target.value)}
          placeholder="10, 10"
        />
      </div>

      {/* Start delays */}
      <div>
        <Label htmlFor="benchmark-start-delays" className={labelClasses}>
          Client Start Delays (ms, comma-separated)
        </Label>
        <Input id="benchmark-start-delays"
          type="text"
          className={inputClasses}
          value={startDelaysText}
          onChange={(e) => setStartDelaysText(e.target.value)}
          placeholder="0, 0"
        />
      </div>

      {multiBottleneck ? (
        <div className="space-y-4">
          <div>
            <Label htmlFor="benchmark-topology" className={labelClasses}>Network Topology</Label>
            <Select
              items={AVAILABLE_TOPOLOGIES}
              value={config.topology ?? null}
              onValueChange={(value) => {
                if (value === "parking-lot" || value === "dumbbell") setConfig({ ...config, topology: value });
              }}
            >
              <SelectTrigger id="benchmark-topology" className="w-full">
                <SelectValue placeholder="Choose a topology..." />
              </SelectTrigger>
              <SelectContent alignItemWithTrigger={false} align="start">
                {AVAILABLE_TOPOLOGIES.map((topology) => (
                  <SelectItem key={topology.value} value={topology.value}>{topology.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="benchmark-link-rates" className={labelClasses}>Bottleneck Rates (Mbit/s, comma-separated)</Label>
            <Input id="benchmark-link-rates" className={inputClasses} value={ratesText} onChange={(e) => setRatesText(e.target.value)} />
            <p className="mt-1 text-xs text-muted-foreground">Two values, one per bottleneck.</p>
          </div>
          <div>
            <Label htmlFor="benchmark-link-buffers" className={labelClasses}>Buffer Sizes (KB, comma-separated)</Label>
            <Input id="benchmark-link-buffers" className={inputClasses} value={buffersText} onChange={(e) => setBuffersText(e.target.value)} />
          </div>
          {config.topology === "dumbbell" && (
            <div>
              <Label htmlFor="benchmark-client-groups" className={labelClasses}>Client Group Sizes (comma-separated)</Label>
              <Input id="benchmark-client-groups" className={inputClasses} value={groupsText} onChange={(e) => setGroupsText(e.target.value)} />
              <p className="mt-1 text-xs text-muted-foreground">Two positive group sizes adding up to {config.num_clients}. Clients are assigned in order.</p>
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            This runner records throughput; RTT, congestion window, and in-flight packet graphs are not available.
            {config.topology === "parking-lot" && " Parking-lot shaping is experimental: currently only the first bottleneck rate and buffer are applied."}
          </p>
        </div>
      ) : (
        <>
          {/* Bottleneck rate */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="benchmark-rate" className={labelClasses}>Bottleneck Rate (Mbit/s)</Label>
              <Input id="benchmark-rate"
                type="number"
                min={1}
                max={10000}
                className={inputClasses}
                value={config.bottleneck_all_client_rate_mbit}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    bottleneck_all_client_rate_mbit: parseFloat(e.target.value) || 100,
                  })
                }
              />
            </div>
            <div>
              <Label htmlFor="benchmark-buffer" className={labelClasses}>Buffer Size (KB)</Label>
              <Input id="benchmark-buffer"
                type="number"
                min={0}
                max={100000}
                className={inputClasses}
                value={config.bottleneck_buffer_kbytes}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    bottleneck_buffer_kbytes: parseFloat(e.target.value) || 125,
                  })
                }
              />
            </div>
          </div>

          {/* Metrics source */}
          <div>
            <Label htmlFor="benchmark-metrics-source" className={labelClasses}>Metrics Source</Label>
            <Select
              items={[
                { value: "kernel", label: "Kernel" },
                { value: "ss", label: "SS (out-of-band)" },
              ]}
              value={config.snapshot_metrics_source}
              onValueChange={(value) => {
                if (value !== null) setConfig({ ...config, snapshot_metrics_source: value });
              }}
            >
              <SelectTrigger id="benchmark-metrics-source" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent alignItemWithTrigger={false} align="start">
                <SelectItem value="kernel">Kernel</SelectItem>
                <SelectItem value="ss">SS (out-of-band)</SelectItem>
              </SelectContent>
            </Select>
          </div>

        </>
      )}

      {/* Experiment metadata */}
      <div className="border-t border-border pt-4">
        <p className="mb-3 text-sm font-medium text-muted-foreground">
          Experiment Metadata (optional)
        </p>
        <div className="space-y-3">
          <div>
            <Label htmlFor="benchmark-name" className={labelClasses}>Experiment Name</Label>
            <Input id="benchmark-name"
              type="text"
              className={inputClasses}
              value={experimentName}
              onChange={(e) => setExperimentName(e.target.value)}
              placeholder="e.g. bbr-fairness-sweep-v2"
            />
          </div>
          <div>
            <Label htmlFor="benchmark-tags" className={labelClasses}>Tags (comma-separated)</Label>
            <Input id="benchmark-tags"
              type="text"
              className={inputClasses}
              value={tagsText}
              onChange={(e) => setTagsText(e.target.value)}
              placeholder="e.g. fairness, bbr, paper-fig3"
            />
          </div>
          <div>
            <Label htmlFor="benchmark-notes" className={labelClasses}>Notes</Label>
            <Textarea id="benchmark-notes"
              className={inputClasses + " resize-none"}
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="What are you testing and why?"
            />
          </div>
        </div>
      </div>

      {/* Save config */}
      <div className="space-y-2">
        <div className="flex gap-2">
          <Input
            type="text"
            className={inputClasses}
            aria-label="Config name"
            value={configName}
            onChange={(e) => setConfigName(e.target.value)}
            placeholder="Config name..."
          />
          <Button
            variant="ghost"
            size="sm"
            type="button"
            onClick={handleSaveConfig}
            disabled={!configName.trim()}
            className="h-auto whitespace-normal whitespace-nowrap rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium text-foreground transition hover:bg-muted disabled:opacity-50 dark:text-muted-foreground dark:hover:bg-accent"
          >
            Save Config
          </Button>
        </div>
        <Input
          type="text"
          className={inputClasses}
          aria-label="Config description"
          value={configDescription}
          onChange={(e) => setConfigDescription(e.target.value)}
          placeholder="Description (optional) — e.g. 2-client fairness test at 100 Mbit"
        />
      </div>

      {/* Launch */}
      <Button
        variant="ghost"
        size="sm"
        type="button"
        onClick={handleLaunch}
        disabled={isLaunching}
        className="h-auto whitespace-normal w-full rounded-lg bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:cursor-wait disabled:opacity-60"
      >
        {isLaunching ? "Launching..." : "Run Benchmark"}
      </Button>

      {/* Message */}
      {message && (
        <div
          className={`rounded-lg px-4 py-3 text-sm ${
            message.type === "success"
              ? "border border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-200"
              : "border border-red-200 bg-red-50 text-red-800 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-200"
          }`}
        >
          {message.text}
        </div>
      )}
    </div>
  );
}
