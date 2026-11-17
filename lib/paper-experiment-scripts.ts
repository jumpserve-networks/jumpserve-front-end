import { validateExperimentPlan, type ExperimentPlan } from "./paper-experiment-plan";
import type { PaperBreakdown } from "./research-paper-breakdown";
import { terminalCommandsInput, terminalActionRefs, terminalBlockedActionRefs, validateTerminalCommandSet, SHARED_TERMINAL_LAYOUT, TERMINAL_TARGET, type TerminalCommandSet, type TerminalStage } from "./paper-terminal-commands";
import { RESEARCH_WORKFLOW_MODULE_PATH } from "./test-modules";

export const EXPERIMENT_SCRIPTS_VERSION = "paper-experiment-scripts-v1";
export const EXPERIMENT_SCRIPTS_FORMAT = "paper_experiment_scripts_v1";
export const SHARED_SETUP_MAX_CHARACTERS = 200000;
export const EXPERIMENT_SCRIPTS_PATH = `${RESEARCH_WORKFLOW_MODULE_PATH}/api/experiment-scripts`;
export type ExperimentScriptsView = { version: typeof EXPERIMENT_SCRIPTS_VERSION; study_id: string; experiment_index: number; command_layout: typeof SHARED_TERMINAL_LAYOUT; target: typeof TERMINAL_TARGET; stage: TerminalStage; command_set: TerminalCommandSet | null; reason: string | null; generated_at: string | null; prior_pending: number };
export function experimentScriptsInput(study: string, index: number, plan: ExperimentPlan, breakdown: PaperBreakdown) {
  return { ...terminalCommandsInput(study, index, plan, breakdown), phase: EXPERIMENT_SCRIPTS_VERSION, command_layout: SHARED_TERMINAL_LAYOUT };
}
/** Detect the incomplete heredocs observed in live evaluations without executing code. */
export function assertCompleteCommandBody(commands: string) {
  let closing: string | null = null, tabs = false;
  for (const line of commands.split(/\r?\n/)) {
    if (closing !== null) { if ((tabs ? line.replace(/^\t+/, "") : line) === closing) closing = null; continue; }
    const match = line.match(/(?:^|[^<])<<(?!<)(-?)[ \t]*(['"]?)([A-Za-z_][A-Za-z0-9_]*)\2/);
    if (match) { closing = match[3]; tabs = match[1] === "-"; }
  }
  if (closing !== null) throw new Error(`The generated script is unfinished (missing ${closing} heredoc terminator). The original response is retained.`);
}
export function validateExperimentScripts(value: unknown, plan: ExperimentPlan, breakdown: PaperBreakdown, index: number) {
  validateExperimentPlan(plan, breakdown);
  const set = validateTerminalCommandSet(value, terminalActionRefs(plan, index), terminalBlockedActionRefs(plan, index, breakdown), false, [], SHARED_SETUP_MAX_CHARACTERS);
  if (set.setup.prerequisites.length || set.setup.kind !== "terminal" && Object.values(set.actions).some(block => block.kind === "terminal")) throw new Error("Executable experiment steps require the complete shared setup script first.");
  for (const [ref, block] of [["setup", set.setup], ...Object.entries(set.actions), ["cleanup", set.cleanup]] as [string, TerminalCommandSet["setup"]][]) {
    if (block.kind !== "terminal") continue;
    if (ref !== "setup" && (set.setup.kind !== "terminal" || !block.prerequisites.includes("setup"))) throw new Error("Experiment commands must declare the shared setup prerequisite.");
    if (/(?:os\.readlink|\bopen)\s*\(\s*f?["']\/proc\/\{[^}]+\}\/(?:exe|cmdline|ns\/net)["']/.test(block.commands!)) throw new Error("Shared scripts must read privileged process identities through sudo.");
    assertCompleteCommandBody(block.commands!);
  }
  return set;
}
export function validateExperimentScriptsView(value: unknown, study: string, index: number, plan: ExperimentPlan, breakdown: PaperBreakdown): ExperimentScriptsView {
  const v = value as ExperimentScriptsView;
  if (!v || v.version !== EXPERIMENT_SCRIPTS_VERSION || v.study_id !== study || v.experiment_index !== index || v.command_layout !== SHARED_TERMINAL_LAYOUT || v.target !== TERMINAL_TARGET || !Number.isSafeInteger(v.prior_pending) || v.prior_pending < 0 || v.prior_pending > 65 || !["not_generated", "submitting", "processing", "uncertain", "ready", "failed", "cancelled"].includes(v.stage) || v.reason !== null && (typeof v.reason !== "string" || !v.reason.trim() || v.reason.length > 2000) || v.generated_at !== null && !Number.isFinite(Date.parse(v.generated_at)) || (v.stage === "ready") !== (v.generated_at !== null) || (v.stage === "ready") !== (v.command_set !== null)) throw new Error("The saved experiment scripts could not be verified.");
  if (v.command_set) validateExperimentScripts(v.command_set, plan, breakdown, index);
  return v;
}
