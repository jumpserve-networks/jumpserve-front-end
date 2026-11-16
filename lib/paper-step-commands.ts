import { experimentActions, validateExperimentPlan, planningInput, type ExperimentPlan } from "./paper-experiment-plan";
import type { PaperBreakdown } from "./research-paper-breakdown";
import { INDIVIDUAL_TERMINAL_LAYOUT, TERMINAL_TARGET, terminalActionRefs, terminalBlockedActionRefs, validateTerminalCommandSet, type TerminalCommandSet, type TerminalStage } from "./paper-terminal-commands";
import { RESEARCH_WORKFLOW_MODULE_PATH } from "./test-modules";

export const STEP_COMMANDS_VERSION = "paper-step-commands-v1";
export const STEP_COMMANDS_FORMAT = "paper_step_commands_v1";
export const STEP_COMMANDS_PATH = `${RESEARCH_WORKFLOW_MODULE_PATH}/api/step-commands`;
export type StepCommandSummary = { action_ref: string; stage: TerminalStage; reason: string | null; generated_at: string | null };
export type StepCommandsView = StepCommandSummary & { version: typeof STEP_COMMANDS_VERSION; study_id: string; experiment_index: number; command_set: TerminalCommandSet | null };
export type StepCommandsList = { version: typeof STEP_COMMANDS_VERSION; study_id: string; experiment_index: number; actions: StepCommandSummary[] };
export function selectedCommandStep(plan: ExperimentPlan, index: number, ref: string) {
  const refs = terminalActionRefs(plan, index), position = refs.indexOf(ref);
  if (position < 0) throw new Error("Choose an existing numbered experiment step.");
  return { action: experimentActions(plan.experiments[index - 1])[position], earlier: refs.slice(0, position) };
}
export function stepCommandsInput(study: string, index: number, ref: string, plan: ExperimentPlan, breakdown: PaperBreakdown) {
  validateExperimentPlan(plan, breakdown);
  const { action, earlier } = selectedCommandStep(plan, index, ref);
  return { phase: STEP_COMMANDS_VERSION, target: TERMINAL_TARGET, command_layout: INDIVIDUAL_TERMINAL_LAYOUT, study_id: study, experiment_index: index, action_ref: ref, confirmed: planningInput(breakdown), experiment: plan.experiments[index - 1], selected_action: action, earlier_action_refs: earlier, artifact_contract: "step-manifest-v1" };
}
export function validateStepCommandSet(value: unknown, plan: ExperimentPlan, breakdown: PaperBreakdown, index: number, ref: string) {
  const { earlier } = selectedCommandStep(plan, index, ref);
  const blocked = terminalBlockedActionRefs(plan, index, breakdown).filter(r => r === ref);
  const set = validateTerminalCommandSet(value, [ref], blocked, true, earlier);
  if (new TextEncoder().encode(JSON.stringify(set)).length > 100000) throw new Error("The generated step commands exceed their storage limit.");
  if (blocked.length && set.cleanup.kind === "terminal") throw new Error("An action with undefined scientific criteria cannot generate executable cleanup.");
  return set;
}
export function validateStepCommandSummary(value: unknown, ref: string): StepCommandSummary {
  const v = value as StepCommandSummary;
  if (!v || v.action_ref !== ref || !["not_generated", "submitting", "processing", "uncertain", "ready", "failed", "cancelled"].includes(v.stage) ||
      v.reason !== null && (typeof v.reason !== "string" || !v.reason.trim() || v.reason.length > 2000) || v.generated_at !== null && !Number.isFinite(Date.parse(v.generated_at)) || (v.stage === "ready") !== (v.generated_at !== null)) throw new Error("The saved step command status could not be verified.");
  return v;
}
export function validateStepCommandsView(value: unknown, study: string, index: number, ref: string, plan: ExperimentPlan, breakdown: PaperBreakdown): StepCommandsView {
  const v = value as StepCommandsView;
  if (!v || v.version !== STEP_COMMANDS_VERSION || v.study_id !== study || v.experiment_index !== index) throw new Error("The saved commands do not belong to this step.");
  validateStepCommandSummary(v, ref);
  if (v.command_set !== null) validateStepCommandSet(v.command_set, plan, breakdown, index, ref);
  if ((v.stage === "ready") !== (v.command_set !== null)) throw new Error("The saved step commands are incomplete.");
  return v;
}
export function validateStepCommandsList(value: unknown, study: string, index: number, refs: string[]): StepCommandsList {
  const v = value as StepCommandsList;
  if (!v || v.version !== STEP_COMMANDS_VERSION || v.study_id !== study || v.experiment_index !== index || !Array.isArray(v.actions) || v.actions.length !== refs.length) throw new Error("Saved step commands could not be checked.");
  v.actions.forEach((item, position) => validateStepCommandSummary(item, refs[position]));
  return v;
}
