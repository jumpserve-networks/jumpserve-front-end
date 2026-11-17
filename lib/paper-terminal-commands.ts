import { experimentActions, planningInput, planningSources, validateExperimentPlan, type ExperimentPlan } from "./paper-experiment-plan";
import type { PaperBreakdown } from "./research-paper-breakdown";
import { RESEARCH_WORKFLOW_MODULE_PATH } from "./test-modules";

export const TERMINAL_COMMANDS_VERSION = "paper-terminal-commands-v1";
export const TERMINAL_COMMANDS_PATH = `${RESEARCH_WORKFLOW_MODULE_PATH}/api/terminal-commands`;
export const TERMINAL_TARGET = "ubuntu-debian";
export const TERMINAL_COMMAND_LAYOUT = "per-step-v1";
export const LEGACY_TERMINAL_LAYOUT = "shared-setup-v1";
export const INDIVIDUAL_TERMINAL_LAYOUT = "action-v1";
export const SHARED_TERMINAL_LAYOUT = "shared-setup-v2";
export type TerminalBlock = { kind: "terminal" | "manual" | "blocked"; commands: string | null; prerequisites: string[]; verification: string; notes: string; needs_sudo: boolean };
export type TerminalCommandSet = { setup: TerminalBlock; actions: Record<string, TerminalBlock>; cleanup: TerminalBlock; inputs: { name: string; description: string; secret: boolean }[] };
export type TerminalStage = "not_generated" | "submitting" | "processing" | "uncertain" | "ready" | "failed" | "cancelled";
export type TerminalCommandsView = { version: typeof TERMINAL_COMMANDS_VERSION; study_id: string; experiment_index: number; target: typeof TERMINAL_TARGET; command_layout?: string; stage: TerminalStage; command_set: TerminalCommandSet | null; reason: string | null; generated_at: string | null };
export function terminalActionRefs(plan: ExperimentPlan, index: number): string[] {
  if (!Number.isSafeInteger(index) || index < 1 || index > plan.experiments.length) throw new Error("Choose an existing experiment.");
  const experiment = plan.experiments[index - 1];
  return experiment.stages ? experiment.stages.flatMap((stage, s) => stage.steps.map((_, a) => `${index}.${s + 1}.${a + 1}`)) : experimentActions(experiment).map((_, a) => `${index}.${a + 1}`);
}
export function terminalCommandsInput(study: string, index: number, plan: ExperimentPlan, breakdown: PaperBreakdown) {
  validateExperimentPlan(plan, breakdown); terminalActionRefs(plan, index);
  return { phase: TERMINAL_COMMANDS_VERSION, target: TERMINAL_TARGET, study_id: study, experiment_index: index, confirmed: planningInput(breakdown), experiment: plan.experiments[index - 1] };
}
export function terminalBlockedActionRefs(plan: ExperimentPlan, index: number, breakdown: PaperBreakdown) {
  const refs = terminalActionRefs(plan, index),undefinedCriteria = new Set(planningSources(breakdown).validate.filter(s => s.kind === "claim" && s.criterion?.acceptance === "needs_definition").map(s => s.ref));
  return experimentActions(plan.experiments[index - 1]).flatMap((step, i) => step.validation_ref && undefinedCriteria.has(step.validation_ref) ? [refs[i]] : []);
}
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const text = (v: unknown, max: number): v is string => typeof v === "string" && v.trim().length > 0 && [...v].length <= max;
const exact = (v: Record<string, unknown>, keys: string[]) => Object.keys(v).sort().join("|") === [...keys].sort().join("|");
export function terminalSetupRequired(set: TerminalCommandSet) {
  return set.setup.kind !== "manual" || [...Object.values(set.actions), set.cleanup].some(block => block.prerequisites.includes("setup"));
}
export function validateTerminalCommandSet(value: unknown, refs: string[], blockedRefs: string[] = [], standalone = false, earlierRefs: string[] = [], setupLimit = 64000): TerminalCommandSet {
  const fail = () => new Error("The terminal commands do not match the saved experiment steps.");
  if (!object(value) || !exact(value, ["setup", "actions", "cleanup", "inputs"]) || !object(value.actions) || !exact(value.actions, refs) || !Array.isArray(value.inputs) || value.inputs.length > 16) throw fail();
  const inputs = new Set<string>();
  for (const input of value.inputs) {
    if (!object(input) || !exact(input, ["name", "description", "secret"]) || typeof input.name !== "string" || !/^JUMPSERVE_[A-Z][A-Z0-9_]{0,63}$/.test(input.name) || inputs.has(input.name) || !text(input.description, 600) || typeof input.secret !== "boolean") throw fail();
    inputs.add(input.name);
  }
  const allowed: string[] = [...earlierRefs];
  for (const [ref, block] of [["setup", value.setup], ...refs.map(ref => [ref, (value.actions as Record<string, unknown>)[ref]]), ["cleanup", value.cleanup]] as [string, unknown][]) {
    if (!object(block) || !exact(block, ["kind", "commands", "prerequisites", "verification", "notes", "needs_sudo"]) || !["terminal", "manual", "blocked"].includes(String(block.kind)) || typeof block.needs_sudo !== "boolean" || !text(block.verification, 800) || !text(block.notes, 1200) || !Array.isArray(block.prerequisites) || block.prerequisites.length > 24 || new Set(block.prerequisites).size !== block.prerequisites.length || block.prerequisites.some(r => typeof r !== "string" || !allowed.includes(r))) throw fail();
    if (block.kind === "terminal" ? !text(block.commands, ref === "setup" ? setupLimit : 16000) || block.commands.includes("\u0000") : block.commands !== null || block.needs_sudo) throw fail();
    if (block.kind === "terminal" && /(^|[;\n&|])\s*(sudo\s+)?tc\s+(qdisc|class|filter)\s+(add|change|replace|del|delete)(\s|$)/m.test(block.commands as string)) throw new Error("A command block changes host traffic control without an explicit network namespace. The original response is retained.");
    if (block.kind === "terminal" && /\bpython3-distutils\b/.test(block.commands as string)) throw new Error("The generated commands require an obsolete Python package for this host profile. The original response is retained.");
    if (blockedRefs.includes(ref) && block.kind !== "blocked") throw new Error("A claim with undefined scientific acceptance criteria must remain blocked before observations; command generation cannot define a post-hoc decision rule.");
    if (standalone && (ref === "setup" ? block.kind !== "manual" || block.prerequisites.length !== 0 : block.prerequisites.includes("setup"))) throw new Error("Each step must contain its own commands without a shared setup script.");
    if (standalone && block.kind === "terminal" && /\b(?:experiment_helper|jumpserve_helper)\.py\b|\b(?:python3?|bash|sh)\s+["']?\$\{?HELPER\b|(?:^|[;\n])\s*(?:source|\.)\s+["']?\$(?:\{|[A-Z_])/m.test(block.commands as string)) throw new Error("A step relies on a shared helper instead of supplying its own script. The original response is retained.");
    if (standalone && block.kind === "terminal" && /(?:os\.readlink|\bopen)\s*\(\s*f?["']\/proc\/\{[^}]+\}\/(?:exe|cmdline|ns\/net)["']/.test(block.commands as string)) throw new Error("Privileged process identity reads must use sudo from the ordinary-user script. The original response is retained.");
    allowed.push(ref);
  }
  if (new TextEncoder().encode(JSON.stringify(value)).length > 250000) throw fail();
  return value as TerminalCommandSet;
}
export function validateTerminalCommandsView(value: unknown, study: string, index: number, refs: string[], blockedRefs: string[] = []): TerminalCommandsView {
  const v = value as TerminalCommandsView;
  if (!v || v.version !== TERMINAL_COMMANDS_VERSION || v.study_id !== study || v.experiment_index !== index || v.target !== TERMINAL_TARGET || !["not_generated", "submitting", "processing", "uncertain", "ready", "failed", "cancelled"].includes(v.stage) || v.reason !== null && !text(v.reason, 2000) || v.generated_at !== null && !Number.isFinite(Date.parse(v.generated_at))) throw new Error("Terminal command status could not be verified.");
  if (v.command_set !== null) validateTerminalCommandSet(v.command_set, refs, blockedRefs, v.command_layout === TERMINAL_COMMAND_LAYOUT);
  if ((v.stage === "ready") !== (v.command_set !== null) || v.stage === "ready" && !v.generated_at) throw new Error("The saved terminal commands are incomplete.");
  if (v.stage === "ready" && v.command_layout !== TERMINAL_COMMAND_LAYOUT) throw new Error("The saved commands use an earlier format. Refresh Step 3 before copying commands.");
  return v;
}

/** Copyable Bash wrapper. No server execution; source bodies remain unchanged. */
export function terminalClipboard(block: TerminalBlock, study: string, index: number, layout: typeof TERMINAL_COMMAND_LAYOUT | typeof LEGACY_TERMINAL_LAYOUT | typeof INDIVIDUAL_TERMINAL_LAYOUT | typeof SHARED_TERMINAL_LAYOUT = TERMINAL_COMMAND_LAYOUT) {
  if (block.kind !== "terminal" || !block.commands || !/^[a-f0-9-]{36}$/i.test(study) || !Number.isSafeInteger(index) || index < 1 || index > 8) throw new Error("A saved terminal command block is required.");
  let delimiter = "JUMPSERVE_COMMAND_BLOCK";
  while (block.commands.split(/\r?\n/).includes(delimiter)) delimiter += "_END";
  return [`bash <<'${delimiter}'`, "set -euo pipefail", "umask 077", '[ "$(uname -s)" = Linux ] || { printf >&2 "Run this block on the Ubuntu/Debian Linux research host.\\n"; exit 1; }', `export JUMPSERVE_WORKSPACE="$HOME/.local/share/jumpserve/${study}/experiment-${index}${layout === LEGACY_TERMINAL_LAYOUT ? "" : "/" + layout}"`, `export JUMPSERVE_NAMESPACE_PREFIX="${layout === SHARED_TERMINAL_LAYOUT ? "s" : layout === INDIVIDUAL_TERMINAL_LAYOUT ? "a" : layout === TERMINAL_COMMAND_LAYOUT ? "p" : "j"}${study.replaceAll("-", "").slice(0, 7)}${index}"`, 'mkdir -p "$JUMPSERVE_WORKSPACE"', 'chmod 700 "$JUMPSERVE_WORKSPACE"', 'cd "$JUMPSERVE_WORKSPACE"', block.commands, delimiter].join("\n") + "\n";
}
export function terminalInputsClipboard(inputs: TerminalCommandSet["inputs"]) {
  return ["# Paste in the same Bash terminal used for the experiment blocks.", ...inputs.flatMap(input => {
    if (!/^JUMPSERVE_[A-Z][A-Z0-9_]{0,63}$/.test(input.name)) throw new Error("Invalid terminal input name.");
    return [`read -r ${input.secret ? "-s " : ""}-p '${input.name}: ' ${input.name} </dev/tty`, ...(input.secret ? ["printf '\\n'"] : []), `export ${input.name}`];
  })].join("\n") + "\n";
}
