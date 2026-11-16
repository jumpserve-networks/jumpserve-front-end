import "server-only";
import { isDeepStrictEqual } from "node:util";
import { intakeDatabase, modelClient } from "./paper-intake-server";
import { ExperimentPlanError } from "./paper-experiment-plan-server";
import type { ExperimentPlanRecord } from "./paper-experiment-plan-runner";
import { generateTerminalCommands, refreshTerminalCommands, cancelTerminalCommands, type TerminalCommandsRecord } from "./paper-terminal-commands-runner";
import { terminalActionRefs, INDIVIDUAL_TERMINAL_LAYOUT, TERMINAL_TARGET } from "./paper-terminal-commands";
import { STEP_COMMANDS_VERSION, selectedCommandStep, validateStepCommandSummary, type StepCommandsView, type StepCommandSummary, type StepCommandsList } from "./paper-step-commands";
import { stepCommandsRequest } from "./paper-step-commands-model";

type StepRecord = TerminalCommandsRecord & { action_ref: string; plan_revision: number; link_review_id: string | null };
function databaseError(error: { code?: string; message: string }): never {
  if (["42P01", "42703", "PGRST204", "PGRST205", "PGRST202"].includes(error.code ?? "")) throw new ExperimentPlanError("Individual step commands need their database update.", 424);
  throw new ExperimentPlanError(`Step commands could not be saved: ${error.message}`, 409);
}
function source(plan: ExperimentPlanRecord) {
  const revision = (plan as ExperimentPlanRecord & { revision: number }).revision;
  if (plan.status !== "ready" || !plan.plan || !Number.isSafeInteger(revision) || revision < 1) throw new ExperimentPlanError("A saved experiment plan is required.", 409);
  return { revision, review: plan.link_review?.id ?? null };
}
function sameSource(plan: ExperimentPlanRecord, row: { plan_revision: number; link_review_id: string | null }) {
  const expected = source(plan);
  if (row.plan_revision !== expected.revision || row.link_review_id !== expected.review) throw new ExperimentPlanError("The saved commands belong to a different plan revision.", 409);
}
export function stepCommandsView(row: TerminalCommandsRecord | null, study: string, index: number, ref: string): StepCommandsView {
  return { version: STEP_COMMANDS_VERSION, study_id: study, experiment_index: index, action_ref: ref, stage: row?.status ?? "not_generated", command_set: row?.command_set ?? null, reason: row?.reason ?? null, generated_at: row?.generated_at ?? null };
}
export async function stepCommandsList(plan: ExperimentPlanRecord, index: number): Promise<StepCommandsList> {
  source(plan);const refs = terminalActionRefs(plan.plan!, index);
  const { data, count, error } = await (await intakeDatabase()).from("research_step_commands").select("action_ref,status,reason,generated_at,plan_revision,link_review_id", { count: "exact" }).eq("study_id", plan.study_id).eq("owner_id", plan.owner_id).eq("experiment_index", index).eq("target", TERMINAL_TARGET).limit(refs.length + 1);
  if (error) databaseError(error);
  if (!Array.isArray(data) || count !== data.length || data.length > refs.length) throw new ExperimentPlanError("Saved step commands could not be checked.", 503);
  const summaries = new Map<string, StepCommandSummary>();
  for (const row of data) {
    if (!refs.includes(row.action_ref) || summaries.has(row.action_ref)) throw new ExperimentPlanError("Saved step commands do not match this experiment.", 409);
    sameSource(plan, row);
    summaries.set(row.action_ref, validateStepCommandSummary({ action_ref: row.action_ref, stage: row.status, reason: row.reason, generated_at: row.generated_at }, row.action_ref));
  }
  return { version: STEP_COMMANDS_VERSION, study_id: plan.study_id, experiment_index: index, actions: refs.map(ref => summaries.get(ref) ?? { action_ref: ref, stage: "not_generated", reason: null, generated_at: null }) };
}
export async function loadStepCommands(plan: ExperimentPlanRecord, index: number, ref: string) {
  source(plan);selectedCommandStep(plan.plan!, index, ref);
  const { data, error } = await (await intakeDatabase()).from("research_step_commands").select("*").eq("study_id", plan.study_id).eq("owner_id", plan.owner_id).eq("experiment_index", index).eq("action_ref", ref).eq("target", TERMINAL_TARGET).maybeSingle();
  if (error) databaseError(error);
  if (!data) return null;
  sameSource(plan, data);
  if (data.action_ref !== ref || data.command_layout !== INDIVIDUAL_TERMINAL_LAYOUT || !isDeepStrictEqual(data.source_plan, plan.plan) || !isDeepStrictEqual(data.confirmed_breakdown, plan.confirmed_breakdown)) throw new ExperimentPlanError("The saved step source could not be verified.", 409);
  return data as StepRecord;
}
function operations(study: string, owner: string, index: number, ref: string) {
  return {
    save: async (operation: string, payload: Record<string, unknown>) => {
      const { data, error } = await (await intakeDatabase()).rpc("research_step_commands_control", { p_operation: operation, p_actor: owner, p_study: study, p_index: index, p_ref: ref, p_payload: payload });
      if (error) databaseError(error);return data as StepRecord;
    },
    create: async (request: ReturnType<typeof stepCommandsRequest>, token: string) => (await modelClient()).responses.create(request, { headers: { "X-Client-Request-Id": token } }),
    retrieve: async (id: string) => (await modelClient()).responses.retrieve(id), cancel: async (id: string) => (await modelClient()).responses.cancel(id),
  };
}
export async function prepareStepCommands(plan: ExperimentPlanRecord, index: number, ref: string) {
  source(plan);
  return generateTerminalCommands(stepCommandsRequest(plan.study_id, index, ref, plan.plan!, plan.confirmed_breakdown), operations(plan.study_id, plan.owner_id, index, ref));
}
export const refreshStepCommands = (row: StepRecord) => refreshTerminalCommands(row, operations(row.study_id, row.owner_id, row.experiment_index, row.action_ref));
export const cancelStepCommands = (row: StepRecord) => cancelTerminalCommands(row, operations(row.study_id, row.owner_id, row.experiment_index, row.action_ref));
