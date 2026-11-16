"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Button } from "@/app/components/ui/button";
import { requireAccessToken } from "@/lib/browser-auth";
import type { ExperimentPlan } from "@/lib/paper-experiment-plan";
import type { PaperBreakdown } from "@/lib/research-paper-breakdown";
import { TERMINAL_TARGET, terminalActionRefs } from "@/lib/paper-terminal-commands";
import { STEP_COMMANDS_PATH, validateStepCommandsList, validateStepCommandsView, type StepCommandsList, type StepCommandsView } from "@/lib/paper-step-commands";
import { CommandBlock, TerminalInputs } from "./paper-terminal-commands";

type Context = { assessmentId: string; ownerId: string; index: number; plan: ExperimentPlan; breakdown: PaperBreakdown; saved: StepCommandsList | null; error: string | null };
const StepContext = createContext<Context | null>(null);
export function PaperStepCommands({ assessmentId, ownerId, index, plan, breakdown, children }: Omit<Context, "saved" | "error"> & { children: ReactNode }) {
  const [saved, setSaved] = useState<StepCommandsList | null>(null),[error, setError] = useState<string | null>(null),[reload, setReload] = useState(0);
  const refs = useMemo(() => terminalActionRefs(plan, index), [plan, index]);
  useEffect(() => {
    const controller = new AbortController();let active = true;
    async function load() {
      try {
        const token = await requireAccessToken("Sign in to view saved step commands.", ownerId);
        if (!active) return;
        const response = await fetch(`${STEP_COMMANDS_PATH}?id=${assessmentId}&experiment=${index}`, { cache: "no-store", signal: AbortSignal.any([controller.signal, AbortSignal.timeout(110000)]), headers: { Authorization: `Bearer ${token}` } });
        const value = await response.json();if (!response.ok) throw new Error(value.error ?? "Saved step commands are unavailable.");
        const result = validateStepCommandsList(value, assessmentId, index, refs);
        if (active) { setSaved(result);setError(null); }
      } catch (failure) { if (active) setError(failure instanceof Error ? failure.message : "Saved step commands are unavailable."); }
    }
    void load();return () => { active = false;controller.abort(); };
  }, [assessmentId, ownerId, index, refs, reload]);
  return <StepContext.Provider value={{ assessmentId, ownerId, index, plan, breakdown, saved, error }}>
    {error ? <div className="space-y-2 text-sm"><p role="alert">{error}</p><Button size="xs" variant="outline" onClick={() => setReload(value => value + 1)}>Check saved commands</Button></div> : null}
    {children}
  </StepContext.Provider>;
}
type StepRender = (parts: { button: ReactNode; result: ReactNode }) => ReactNode;
export function PaperStepCommand({ number, children }: { number: string; children: StepRender }) {
  const context = useContext(StepContext);
  return context ? <PrivateStepCommand number={number} context={context}>{children}</PrivateStepCommand> : children({ button: null, result: null });
}
function PrivateStepCommand({ number, context, children }: { number: string; context: Context; children: StepRender }) {
  const { assessmentId, ownerId, index, plan, breakdown, saved } = context;
  const [view, setView] = useState<StepCommandsView | null>(null),[busy, setBusy] = useState(false),[error, setError] = useState<string | null>(null),[expanded, setExpanded] = useState(false),[uncertain, setUncertain] = useState(false);
  const [operation, setOperation] = useState<"generate" | "cancel" | null>(null);
  const sequence = useRef(0),controller = useRef<AbortController | null>(null),inFlight = useRef(false);
  const stage = uncertain ? "uncertain" : view?.stage ?? saved?.actions.find(action => action.action_ref === number)?.stage ?? "not_generated";
  const perform = useCallback(async (action?: "generate" | "cancel") => {
    if (inFlight.current) return;
    inFlight.current = true;const current = ++sequence.current;controller.current?.abort();const request = new AbortController();controller.current = request;setBusy(true);setOperation(action ?? null);setError(null);
    try {
      const token = await requireAccessToken("Sign in to generate step commands.", ownerId);
      if (request.signal.aborted) return;
      const response = await fetch(`${STEP_COMMANDS_PATH}?id=${assessmentId}&experiment=${index}&step=${number}`, { method: action ? "POST" : "GET", cache: "no-store", signal: AbortSignal.any([request.signal, AbortSignal.timeout(110000)]), headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, ...(action ? { body: JSON.stringify({ action, study_id: assessmentId, experiment_index: index, action_ref: number, target: TERMINAL_TARGET }) } : {}) });
      const value = await response.json();if (!response.ok) throw new Error(value.error ?? "Step commands are unavailable.");
      const result = validateStepCommandsView(value, assessmentId, index, number, plan, breakdown);
      if (sequence.current === current && !request.signal.aborted) { setView(result);setUncertain(false);if (result.stage === "ready") setExpanded(true); }
    } catch (failure) {
      if (sequence.current === current && !request.signal.aborted) { setError(failure instanceof Error ? failure.message : "Step commands are unavailable.");if (action === "generate") setUncertain(true); }
    } finally { if (sequence.current === current) { inFlight.current = false;setOperation(null);setBusy(false); } }
  }, [assessmentId, ownerId, index, number, plan, breakdown]);
  useEffect(() => () => { sequence.current++;controller.current?.abort();inFlight.current = false; }, [perform]);
  useEffect(() => {
    if (busy || !["submitting", "processing"].includes(stage)) return;
    const timer = setTimeout(() => void perform(), 5000);return () => clearTimeout(timer);
  }, [stage, busy, perform]);
  const pending = ["submitting", "processing"].includes(stage) || busy && operation === "generate";
  const label = pending ? "Generating Terminal Commands…" : stage === "not_generated" ? "Generate Terminal Commands" : stage === "ready" ? expanded ? "Hide Terminal Commands" : "View Terminal Commands" : "Check Saved Commands";
  const commandSet = view?.command_set;
  return children({
    button: <Button size="xs" variant="outline" className="shrink-0" disabled={busy || pending || !saved || !!context.error} aria-label={`${label} for step ${number}`} onClick={() => { if (stage === "ready" && commandSet) setExpanded(value => !value);else void perform(stage === "not_generated" ? "generate" : undefined); }}>{busy && !pending ? "Checking…" : label}</Button>,
    result: <>
      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
      {pending ? <div className="space-y-2 text-sm"><p role="status">Generating terminal commands for step {number}…</p>{stage === "processing" ? <Button size="xs" variant="outline" disabled={busy} aria-label={`Cancel terminal commands for step ${number}`} onClick={() => void perform("cancel")}>Cancel generation</Button> : null}</div> : null}
      {view?.reason ? <p className="text-xs text-muted-foreground">{view.reason}</p> : null}
      {expanded && commandSet ? <div className="space-y-3">
        <p className="text-xs text-muted-foreground">Ubuntu/Debian Linux research host · Review commands before running.</p>
        {commandSet.inputs.length ? <TerminalInputs inputs={commandSet.inputs} /> : null}
        <CommandBlock block={commandSet.actions[number]} label={`step ${number}`} study={assessmentId} index={index} individual />
        {commandSet.cleanup.kind === "terminal" ? <CommandBlock block={commandSet.cleanup} label={`cleanup for step ${number}`} study={assessmentId} index={index} individual /> : null}
      </div> : null}
    </>,
  });
}
