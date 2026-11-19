"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Button } from "@/app/components/ui/button";
import { requireAccessToken } from "@/lib/browser-auth";
import { INDIVIDUAL_TERMINAL_LAYOUT, SHARED_TERMINAL_LAYOUT, TERMINAL_COMMANDS_PATH, TERMINAL_TARGET, terminalActionRefs, terminalBlockedActionRefs, terminalClipboard, terminalInputsClipboard, terminalSetupRequired, validateTerminalCommandsView, type TerminalBlock, type TerminalCommandSet, type TerminalCommandsView } from "@/lib/paper-terminal-commands";
import type { ExperimentPlan } from "@/lib/paper-experiment-plan";
import type { PaperBreakdown } from "@/lib/research-paper-breakdown";

const CommandContext = createContext<{ set: TerminalCommandSet; study: string; index: number } | null>(null);
export function TerminalInputs({ inputs }: { inputs: TerminalCommandSet["inputs"] }) {
  const [message, setMessage] = useState("");const commands = terminalInputsClipboard(inputs);
  async function copy() { try { await navigator.clipboard.writeText(commands);setMessage("Input commands copied."); } catch { setMessage("Select and copy the input commands below."); } }
  return <div className="space-y-2">
    <h4 className="font-medium">Inputs to configure on the research host</h4>
    <ul className="list-disc space-y-1 pl-5">{inputs.map(input => <li key={input.name}><code>{input.name}</code>: {input.description}{input.secret ? " Keep this value private." : ""}</li>)}</ul>
    <p className="text-xs text-muted-foreground">Paste these prompts into the same Bash terminal first. The browser does not receive the values you enter there.</p>
    <Button size="xs" variant="outline" onClick={() => void copy()}>Copy input commands</Button><span role="status" className="ml-2 text-xs">{message}</span>
    <pre tabIndex={0} className="overflow-auto bg-muted/40 p-3 font-mono text-xs whitespace-pre"><code>{commands}</code></pre>
  </div>;
}
export function CommandBlock({ block, label, study, index, individual = false, layout, initiallyOpen = false }: { block: TerminalBlock; label: string; study: string; index: number; individual?: boolean; layout?: typeof SHARED_TERMINAL_LAYOUT; initiallyOpen?: boolean }) {
  const [message, setMessage] = useState("");
  const commands = block.kind === "terminal" ? terminalClipboard(block, study, index, layout ?? (individual ? INDIVIDUAL_TERMINAL_LAYOUT : undefined)) : null;
  async function copy() {
    try { await navigator.clipboard.writeText(commands!);setMessage("Commands copied."); }
    catch { setMessage("Copy failed. Select and copy the command text below."); }
  }
  return <details open={initiallyOpen} className="space-y-2 text-sm">
    <summary className="cursor-pointer text-xs font-medium focus-visible:outline-2 focus-visible:outline-offset-2">{commands ? `Terminal commands · ${label}` : `${block.kind === "manual" ? "Manual action" : "Commands blocked"} · ${label}`}</summary>
    <div className="space-y-2 pt-2">
      <p className="text-xs text-muted-foreground">{block.notes}</p>
      {block.prerequisites.length ? <p className="text-xs">Requires: {block.prerequisites.join(", ")}</p> : null}
      {commands ? <>
        <div className="flex flex-wrap items-center gap-3"><Button size="xs" variant="outline" onClick={() => void copy()} aria-label={`Copy commands for ${label}`}>Copy commands</Button><span className="text-xs text-muted-foreground">Bash · {block.needs_sudo ? "Uses sudo" : "No sudo"}</span><span role="status" className="text-xs">{message}</span></div>
        <pre tabIndex={0} aria-label={`Commands for ${label}`} className="max-h-96 overflow-auto bg-muted/40 p-3 font-mono text-xs whitespace-pre [overflow-wrap:normal]"><code>{commands}</code></pre>
      </> : null}
      <p className="text-xs"><span className="font-medium">Completion check:</span> {block.verification}</p>
    </div>
  </details>;
}
export function PaperTerminalActionCommands({ number }: { number: string }) {
  const context = useContext(CommandContext),block = context?.set.actions[number];
  return context && block ? <CommandBlock block={block} label={`step ${number}`} study={context.study} index={context.index} /> : null;
}
export function PaperTerminalCommands({ assessmentId, ownerId, index, plan, breakdown, children }: { assessmentId: string; ownerId: string; index: number; plan: ExperimentPlan; breakdown: PaperBreakdown; children: ReactNode }) {
  const [view, setView] = useState<TerminalCommandsView | null>(null),[busy, setBusy] = useState(false),[error, setError] = useState<string | null>(null);
  const sequence = useRef(0),controller = useRef<AbortController | null>(null);
  const refs = useMemo(() => terminalActionRefs(plan, index), [plan, index]);
  const blockedRefs = useMemo(() => terminalBlockedActionRefs(plan, index, breakdown), [plan, index, breakdown]);
  const perform = useCallback(async (action?: "cancel") => {
    const current = ++sequence.current;controller.current?.abort();const request = new AbortController();controller.current = request;setBusy(true);setError(null);
    try {
      const token = await requireAccessToken("Sign in to generate terminal commands.", ownerId);
      if (request.signal.aborted) return;
      const signal = AbortSignal.any([request.signal, AbortSignal.timeout(110000)]);
      async function send(operation?: "generate" | "cancel") {
        const response = await fetch(`${TERMINAL_COMMANDS_PATH}?id=${assessmentId}&experiment=${index}`, { method: operation ? "POST" : "GET", cache: "no-store", signal, headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, ...(operation ? { body: JSON.stringify({ action: operation, study_id: assessmentId, experiment_index: index, target: TERMINAL_TARGET }) } : {}) });
        const value = await response.json();if (!response.ok) throw new Error(value.error ?? `Terminal commands are unavailable (HTTP ${response.status}).`);
        return validateTerminalCommandsView(value, assessmentId, index, refs, blockedRefs);
      }
      let saved = await send(action);
      // Leaving Step 3 must also fence a late read from starting generation.
      if (sequence.current !== current || request.signal.aborted) return;
      if (!action && saved.stage === "not_generated") saved = await send("generate");
      if (sequence.current === current) setView(saved);
    } catch (failure) { if (sequence.current === current && !request.signal.aborted) setError(failure instanceof Error ? failure.message : "Terminal commands are unavailable."); }
    finally { if (sequence.current === current) setBusy(false); }
  }, [assessmentId, ownerId, index, refs, blockedRefs]);
  const cancelPending = useCallback(() => { sequence.current++;controller.current?.abort(); }, []);
  useEffect(() => {
    void perform();return cancelPending;
  }, [perform, cancelPending]);
  useEffect(() => {
    if (busy || !(error || view && ["submitting", "processing"].includes(view.stage))) return;
    const timer = setTimeout(() => void perform(), error ? 15000 : 5000);return () => clearTimeout(timer);
  }, [busy, view, error, perform]);
  const commandSet = view?.command_set;
  return <CommandContext.Provider value={commandSet ? { set: commandSet, study: assessmentId, index } : null}>
      <section aria-label={`Terminal commands for experiment ${index}`} className="space-y-3 text-sm">
        <p className="text-xs text-muted-foreground">Ubuntu/Debian Linux research host · Review generated commands before running. JumpServe does not execute them.</p>
        {error ? <p role="alert">{error}</p> : null}
        {!view && busy ? <p role="status">Preparing terminal commands…</p> : null}
        {view?.reason ? <p className="text-xs text-muted-foreground">{view.reason}</p> : null}
        {view && ["submitting", "processing"].includes(view.stage) ? <p role="status">Generating commands for each numbered step…</p> : null}
        {view?.stage === "processing" ? <Button size="sm" variant="outline" disabled={busy} onClick={() => void perform("cancel")}>Cancel command generation</Button> : null}
        {commandSet ? <>
          {commandSet.inputs.length ? <TerminalInputs inputs={commandSet.inputs} /> : null}
          {terminalSetupRequired(commandSet) ? <CommandBlock block={commandSet.setup} label="saved setup" study={assessmentId} index={index} /> : null}
        </> : null}
      </section>
    {children}
    {commandSet ? <CommandBlock block={commandSet.cleanup} label="experiment cleanup" study={assessmentId} index={index} /> : null}
  </CommandContext.Provider>;
}
