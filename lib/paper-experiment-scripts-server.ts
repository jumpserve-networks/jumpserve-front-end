import "server-only";
import { qualityScripts, stopPaperQuality } from "./paper-quality-server";
import { intakeDatabase, modelClient } from "./paper-intake-server";
import { ExperimentPlanError } from "./paper-experiment-plan-server";
import type { ExperimentPlanRecord } from "./paper-experiment-plan-runner";
import { generateTerminalCommands, refreshTerminalCommands, cancelTerminalCommands, type TerminalCommandsRecord } from "./paper-terminal-commands-runner";
import { refreshSavedTerminalCommands, cancelSavedTerminalCommands } from "./paper-terminal-commands-server";
import { refreshStepCommands, cancelStepCommands } from "./paper-step-commands-server";
import { SHARED_TERMINAL_LAYOUT, TERMINAL_TARGET } from "./paper-terminal-commands";
import { EXPERIMENT_SCRIPTS_VERSION, type ExperimentScriptsView } from "./paper-experiment-scripts";
import { experimentScriptsRequest } from "./paper-experiment-scripts-model";

function failed(error: { code?: string; message: string }): never {
  throw new ExperimentPlanError(["42P01", "42703", "PGRST202", "PGRST204", "PGRST205"].includes(error.code ?? "") ? "Step 4 needs the shared experiment scripts database update." : `Experiment scripts could not be saved: ${error.message}`, ["42P01", "42703", "PGRST202", "PGRST204", "PGRST205"].includes(error.code ?? "") ? 424 : 409);
}
export async function loadExperimentScripts(study: string, owner: string, index: number) {
  const { data, error } = await (await intakeDatabase()).from("research_experiment_scripts").select("*").eq("study_id", study).eq("owner_id", owner).eq("experiment_index", index).eq("target", TERMINAL_TARGET).maybeSingle();
  if (error) failed(error);
  return data ? qualityScripts(data as TerminalCommandsRecord) : null;
}
function operations(study: string, owner: string, index: number) {
  return { save: async (operation: string, payload: Record<string, unknown>) => {
    const { data, error } = await (await intakeDatabase()).rpc("research_experiment_scripts_control", { p_operation: operation, p_actor: owner, p_study: study, p_index: index, p_payload: payload });
    if (error) failed(error); return data as TerminalCommandsRecord;
  }, create: async (request: ReturnType<typeof experimentScriptsRequest>, token: string) => (await modelClient()).responses.create(request, { headers: { "X-Client-Request-Id": token } }), retrieve: async (id: string) => (await modelClient()).responses.retrieve(id), cancel: async (id: string) => (await modelClient()).responses.cancel(id) };
}
export function experimentScriptsView(row: TerminalCommandsRecord | null, study: string, index: number, prior = 0): ExperimentScriptsView {
  return { version: EXPERIMENT_SCRIPTS_VERSION, study_id: study, experiment_index: index, target: TERMINAL_TARGET, command_layout: SHARED_TERMINAL_LAYOUT, stage: row?.status ?? "not_generated", command_set: row?.command_set ?? null, reason: row?.reason ?? (prior ? "An earlier command request must finish or be cancelled before generating shared scripts. Uncertain submissions retain their original identity." : null), generated_at: row?.generated_at ?? null, prior_pending: prior, ...(row?.quality ? { quality: row.quality } : {}) };
}
/** Reconcile exact earlier calls; these functions never submit inference. */
export async function reconcileEarlierCommands(study: string, owner: string, index: number, cancel = false) {
  const db = await intakeDatabase();
  const results = await Promise.all([
    db.from("research_terminal_commands").select("*").eq("study_id", study).eq("owner_id", owner).eq("experiment_index", index).in("status", ["submitting", "processing", "uncertain"]).limit(1),
    db.from("research_step_commands").select("*").eq("study_id", study).eq("owner_id", owner).eq("experiment_index", index).in("status", ["submitting", "processing", "uncertain"]).limit(64),
  ]);
  for (const result of results) if (result.error) failed(result.error);
  let pending = 0;
  for (const [kind, result] of results.entries()) for (const raw of result.data ?? []) {
    const row = raw as TerminalCommandsRecord;
    const next = cancel && row.status === "processing" ? kind === 0 ? await cancelSavedTerminalCommands(row) : await cancelStepCommands(row as Parameters<typeof cancelStepCommands>[0]) : kind === 0 ? await refreshSavedTerminalCommands(row) : await refreshStepCommands(row as Parameters<typeof refreshStepCommands>[0]);
    if (next && ["submitting", "processing", "uncertain"].includes(next.status)) pending++;
  }
  return pending;
}
export async function prepareExperimentScripts(plan: ExperimentPlanRecord, index: number) {
  if (plan.status !== "ready" || !plan.plan) throw new ExperimentPlanError("Wait for the saved experiment plan before Step 4.", 409);
  return qualityScripts(await generateTerminalCommands(experimentScriptsRequest(plan.study_id, index, plan.plan, plan.confirmed_breakdown), operations(plan.study_id, plan.owner_id, index)));
}
export const refreshExperimentScripts = async (row: TerminalCommandsRecord) => row.quality ? (await loadExperimentScripts(row.study_id, row.owner_id, row.experiment_index))! : qualityScripts(await refreshTerminalCommands(row, operations(row.study_id, row.owner_id, row.experiment_index)));
export const cancelExperimentScripts = async (row: TerminalCommandsRecord) => {
  if (row.quality && row.quality.phase !== "approved") { await stopPaperQuality(row.study_id, row.owner_id, 4, row.experiment_index);return (await loadExperimentScripts(row.study_id, row.owner_id, row.experiment_index))!; }
  return qualityScripts(await cancelTerminalCommands(row, operations(row.study_id, row.owner_id, row.experiment_index)));
};
