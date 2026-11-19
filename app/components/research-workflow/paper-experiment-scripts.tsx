"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/app/components/ui/button";
import { requireAccessToken } from "@/lib/browser-auth";
import type { ExperimentPlan } from "@/lib/paper-experiment-plan";
import type { PaperBreakdown } from "@/lib/research-paper-breakdown";
import { EXPERIMENT_SCRIPTS_PATH, validateExperimentScriptsView, type ExperimentScriptsView } from "@/lib/paper-experiment-scripts";
import { SHARED_TERMINAL_LAYOUT, TERMINAL_TARGET } from "@/lib/paper-terminal-commands";
import { CommandBlock, TerminalInputs } from "./paper-terminal-commands";
import { PaperExperimentPlanOutline } from "./paper-experiment-plan-outline";
import { usePaperWork } from "./paper-work-provider";
import { PaperQualityHistoryMenu, PaperQualityHistoryProvider } from "./paper-quality-history-dialog";
import type { PaperQualityProgress } from "@/lib/paper-quality";

type Props = { assessmentId: string; ownerId: string; index: number; plan: ExperimentPlan; breakdown: PaperBreakdown; title?: string; onQualityChange?: (index: number, quality: PaperQualityProgress | undefined) => void };
export function PaperExperimentScripts({ assessmentId, ownerId, index, plan, breakdown, title = "Paper assessment", onQualityChange }: Props) {
  const work = usePaperWork();
  const [view, setView] = useState<ExperimentScriptsView | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null);
  const sequence = useRef(0), controller = useRef<AbortController | null>(null);
  const perform = useCallback(async (action?: "generate" | "cancel" | "cancel_previous") => {
    const current = ++sequence.current;controller.current?.abort();const request = new AbortController();controller.current = request;setBusy(true);setError(null);
    try {
      const saved = await work.perform({ id: assessmentId, title, step: 4, index, total: plan.experiments.length, resume: !action }, async lifecycle => {
      const token = await requireAccessToken("Sign in to generate experiment scripts.", ownerId);
      lifecycle.throwIfAborted();
      const signal = AbortSignal.any([lifecycle, AbortSignal.timeout(110000)]);
      async function send(operation?: "generate" | "cancel" | "cancel_previous") {
        signal.throwIfAborted();
        const response = await fetch(`${EXPERIMENT_SCRIPTS_PATH}?id=${assessmentId}&experiment=${index}`, { method: operation ? "POST" : "GET", cache: "no-store", signal, headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, ...(operation ? { body: JSON.stringify({ action: operation, study_id: assessmentId, experiment_index: index, target: TERMINAL_TARGET }) } : {}) });
        const value = await response.json();if (!response.ok) throw new Error(value.error ?? `Experiment scripts are unavailable (HTTP ${response.status}).`);
        signal.throwIfAborted();
        return validateExperimentScriptsView(value, assessmentId, index, plan, breakdown);
      }
      let saved = await send(action);
      if (!action && saved.stage === "not_generated" && saved.prior_pending === 0) saved = await send("generate");
      return saved;
      });
      if (sequence.current === current && !request.signal.aborted) { setView(saved);onQualityChange?.(index, saved.quality); }
    } catch (failure) { if (sequence.current === current && !request.signal.aborted) setError(failure instanceof Error ? failure.message : "Experiment scripts are unavailable."); }
    finally { if (sequence.current === current) setBusy(false); }
  }, [assessmentId, ownerId, index, plan, breakdown, title, work, onQualityChange]);
  useEffect(() => {
    const requests = sequence, activeController = controller;
    void perform();
    return () => { requests.current++;activeController.current?.abort(); };
  }, [perform]);
  useEffect(() => {
    if (busy || !(error || view && (view.quality?.history_unavailable || ["not_generated", "submitting", "processing"].includes(view.stage) || view.prior_pending > 0))) return;
    const timer = setTimeout(() => void perform(), error || view?.quality?.history_unavailable ? 15000 : 5000);return () => clearTimeout(timer);
  }, [busy, view, error, perform]);
  const set = view?.command_set;
  const before = <section aria-label={`Shared setup for experiment ${index}`} className="space-y-3 text-sm" aria-busy={busy || view?.stage === "processing"}>
    {error ? <p role="alert" className="text-destructive">{error}</p> : null}
    {!onQualityChange ? <div className="flex justify-end"><PaperQualityHistoryMenu /></div> : null}
    {!view && busy || view && !view.quality && ["submitting", "processing"].includes(view.stage) ? <p role="status">Generating shared setup and run commands…</p> : null}
    {view?.reason && !view.quality ? <p className="text-muted-foreground">{view.reason}</p> : null}
    {view?.stage === "processing" ? <Button size="sm" variant="outline" disabled={busy} onClick={() => void perform("cancel")}>Cancel script generation</Button> : null}
    {view && view.prior_pending > 0 ? <Button size="sm" variant="outline" disabled={busy} onClick={() => void perform("cancel_previous")}>Cancel earlier command generation</Button> : null}
    {set ? <>
      {set.inputs.length ? <TerminalInputs inputs={set.inputs} /> : null}
      <h4 className="font-semibold">Shared setup script</h4>
      <p className="text-muted-foreground">Run this setup first on the Ubuntu/Debian host, then run the numbered commands below.</p>
      <CommandBlock block={set.setup} label="shared setup" study={assessmentId} index={index} layout={SHARED_TERMINAL_LAYOUT} initiallyOpen />
    </> : null}
  </section>;
  const outline = <PaperExperimentPlanOutline plan={plan} breakdown={breakdown} experimentIndex={index} beforeActions={before} renderCommands={number => set?.actions[number] ? <CommandBlock block={set.actions[number]} label={`step ${number}`} study={assessmentId} index={index} layout={SHARED_TERMINAL_LAYOUT} /> : null} afterActions={set ? <CommandBlock block={set.cleanup} label="experiment cleanup" study={assessmentId} index={index} layout={SHARED_TERMINAL_LAYOUT} /> : null} />;
  return onQualityChange ? outline : <PaperQualityHistoryProvider quality={view?.quality} step={4}>{outline}</PaperQualityHistoryProvider>;
}
