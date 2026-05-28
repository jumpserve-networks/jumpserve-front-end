"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  launchBenchmark,
  defaultConfig,
  AVAILABLE_CCAS,
  AVAILABLE_SCRIPTS,
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

export function BenchmarkForm({ userEmail }: { userEmail?: string }) {
  const [supabase] = useState(() => createClient());
  const [config, setConfig] = useState<BenchmarkConfig>(defaultConfig());
  const [savedConfigs, setSavedConfigs] = useState<SavedConfig[]>([]);
  const [configName, setConfigName] = useState("");
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

  useEffect(() => {
    loadConfigs();
  }, []);

  async function loadConfigs() {
    const { data } = await supabase
      .from("benchmark_configs")
      .select("id, name, description, config")
      .order("created_at", { ascending: false });
    if (data) setSavedConfigs(data);
  }

  function applyConfig(saved: SavedConfig) {
    setConfig(saved.config);
    setDelaysText(saved.config.client_delays_ms.join(", "));
    setFileSizesText(saved.config.client_file_sizes_mbytes.join(", "));
    setStartDelaysText(saved.config.client_start_delays_ms.join(", "));
    setMessage(null);
  }

  async function handleSaveConfig() {
    if (!configName.trim()) return;
    const finalConfig = buildFinalConfig();
    if (!finalConfig) return;

    const { error } = await supabase.from("benchmark_configs").insert({
      name: configName.trim(),
      config: finalConfig,
    });

    if (error) {
      setMessage({ type: "error", text: `Failed to save: ${error.message}` });
    } else {
      setMessage({ type: "success", text: "Config saved!" });
      setConfigName("");
      loadConfigs();
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

    const finalConfig: any = {
      ...config,
      client_delays_ms: delays,
      client_file_sizes_mbytes: fileSizes,
      client_start_delays_ms: paddedStartDelays,
    };
    if (experimentName.trim()) finalConfig.experiment_name = experimentName.trim();
    if (tagsText.trim()) {
      finalConfig.tags = tagsText.split(",").map((t) => t.trim()).filter(Boolean);
    }
    if (notes.trim()) finalConfig.notes = notes.trim();
    return finalConfig;
  }

  async function handleLaunch() {
    setMessage(null);
    const finalConfig = buildFinalConfig();
    if (!finalConfig) return;

    setIsLaunching(true);
    try {
      const result = await launchBenchmark(finalConfig, userEmail);
      setMessage({
        type: "success",
        text: `Benchmark launched! Job ID: ${result.jobId.slice(0, 8)}...`,
      });
    } catch (err: any) {
      setMessage({ type: "error", text: err.message });
    } finally {
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
    "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 transition focus:border-rose-400 focus:outline-none focus:ring-2 focus:ring-rose-400/30 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:focus:border-rose-400";
  const labelClasses =
    "block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1";

  return (
    <div className="space-y-6">
      {/* Load saved config */}
      {savedConfigs.length > 0 && (
        <div>
          <label className={labelClasses}>Load Saved Config</label>
          <select
            className={inputClasses}
            defaultValue=""
            onChange={(e) => {
              const found = savedConfigs.find((c) => c.id === e.target.value);
              if (found) applyConfig(found);
            }}
          >
            <option value="" disabled>
              Select a config...
            </option>
            {savedConfigs.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Script */}
      <div>
        <label className={labelClasses}>Benchmark Script</label>
        <select
          className={inputClasses}
          value={config.script}
          onChange={(e) => setConfig({ ...config, script: e.target.value })}
        >
          {AVAILABLE_SCRIPTS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </div>

      {/* Number of clients */}
      <div>
        <label className={labelClasses}>Number of Clients</label>
        <input
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
        <label className={labelClasses}>
          Client Delays (ms, comma-separated)
        </label>
        <input
          type="text"
          className={inputClasses}
          value={delaysText}
          onChange={(e) => setDelaysText(e.target.value)}
          placeholder="10, 60"
        />
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          One value per client
        </p>
      </div>

      {/* Client CCAs */}
      <div>
        <label className={labelClasses}>
          Client CCAs (comma-separated)
        </label>
        <input
          type="text"
          className={inputClasses}
          value={config.client_ccas.join(", ")}
          onChange={(e) => handleCcaTextChange(e.target.value)}
          placeholder="cubic, bbr"
        />
        <div className="mt-2 flex flex-wrap gap-1.5">
          {AVAILABLE_CCAS.map((cca) => (
            <button
              key={cca}
              type="button"
              onClick={() => handleCcaToggle(cca)}
              className={`rounded-full px-2.5 py-0.5 text-xs font-medium transition ${
                config.client_ccas.includes(cca)
                  ? "bg-rose-500 text-white"
                  : "bg-slate-200 text-slate-600 hover:bg-slate-300 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600"
              }`}
            >
              {cca}
            </button>
          ))}
        </div>
      </div>

      {/* File sizes */}
      <div>
        <label className={labelClasses}>
          Client File Sizes (MB, comma-separated)
        </label>
        <input
          type="text"
          className={inputClasses}
          value={fileSizesText}
          onChange={(e) => setFileSizesText(e.target.value)}
          placeholder="10, 10"
        />
      </div>

      {/* Start delays */}
      <div>
        <label className={labelClasses}>
          Client Start Delays (ms, comma-separated)
        </label>
        <input
          type="text"
          className={inputClasses}
          value={startDelaysText}
          onChange={(e) => setStartDelaysText(e.target.value)}
          placeholder="0, 0"
        />
      </div>

      {/* Bottleneck rate */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelClasses}>Bottleneck Rate (Mbit/s)</label>
          <input
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
          <label className={labelClasses}>Buffer Size (KB)</label>
          <input
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
        <label className={labelClasses}>Metrics Source</label>
        <select
          className={inputClasses}
          value={config.snapshot_metrics_source}
          onChange={(e) =>
            setConfig({ ...config, snapshot_metrics_source: e.target.value })
          }
        >
          <option value="kernel">Kernel</option>
          <option value="ss">SS (out-of-band)</option>
        </select>
      </div>

      {/* Experiment metadata */}
      <div className="border-t border-slate-200 pt-4 dark:border-slate-700">
        <p className="mb-3 text-sm font-medium text-slate-600 dark:text-slate-400">
          Experiment Metadata (optional)
        </p>
        <div className="space-y-3">
          <div>
            <label className={labelClasses}>Experiment Name</label>
            <input
              type="text"
              className={inputClasses}
              value={experimentName}
              onChange={(e) => setExperimentName(e.target.value)}
              placeholder="e.g. bbr-fairness-sweep-v2"
            />
          </div>
          <div>
            <label className={labelClasses}>Tags (comma-separated)</label>
            <input
              type="text"
              className={inputClasses}
              value={tagsText}
              onChange={(e) => setTagsText(e.target.value)}
              placeholder="e.g. fairness, bbr, paper-fig3"
            />
          </div>
          <div>
            <label className={labelClasses}>Notes</label>
            <textarea
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
      <div className="flex gap-2">
        <input
          type="text"
          className={inputClasses}
          value={configName}
          onChange={(e) => setConfigName(e.target.value)}
          placeholder="Config name to save..."
        />
        <button
          type="button"
          onClick={handleSaveConfig}
          disabled={!configName.trim()}
          className="whitespace-nowrap rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
        >
          Save Config
        </button>
      </div>

      {/* Launch */}
      <button
        type="button"
        onClick={handleLaunch}
        disabled={isLaunching}
        className="w-full rounded-lg bg-rose-500 px-6 py-3 text-sm font-semibold text-white shadow-md transition hover:bg-rose-600 disabled:cursor-wait disabled:opacity-60"
      >
        {isLaunching ? "Launching..." : "Run Benchmark"}
      </button>

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
