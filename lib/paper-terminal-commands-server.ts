import "server-only";
import { intakeDatabase, modelClient } from "./paper-intake-server";
import { TERMINAL_COMMANDS_VERSION, TERMINAL_TARGET, type TerminalCommandsView } from "./paper-terminal-commands";
import { terminalCommandsRequest } from "./paper-terminal-commands-model";
import { generateTerminalCommands, refreshTerminalCommands, cancelTerminalCommands, type TerminalCommandsRecord } from "./paper-terminal-commands-runner";
import type { ExperimentPlanRecord } from "./paper-experiment-plan-runner";
import { ExperimentPlanError } from "./paper-experiment-plan-server";

function databaseError(error: { code?: string; message: string }): never {
  if (["42P01", "PGRST205", "PGRST202"].includes(error.code ?? "")) throw new ExperimentPlanError("Terminal command generation needs its database update.", 424);
  throw new ExperimentPlanError(`Terminal commands could not be saved: ${error.message}`, 409);
}
export async function loadTerminalCommands(study: string, owner: string, index: number) {
  const { data, error } = await (await intakeDatabase()).from("research_terminal_commands").select("*").eq("study_id", study).eq("owner_id", owner).eq("experiment_index", index).eq("target", TERMINAL_TARGET).maybeSingle();
  if (error) databaseError(error);
  return data as TerminalCommandsRecord | null;
}
function operations(study: string, owner: string, index: number) {
  return { save: async (operation: string, payload: Record<string, unknown>) => {
    const { data, error } = await (await intakeDatabase()).rpc("research_terminal_commands_control", { p_operation: operation, p_actor: owner, p_study: study, p_index: index, p_payload: payload });
    if (error) databaseError(error);return data as TerminalCommandsRecord;
  }, create: async (request: ReturnType<typeof terminalCommandsRequest>, token: string) => (await modelClient()).responses.create(request, { headers: { "X-Client-Request-Id": token } }), retrieve: async (id: string) => (await modelClient()).responses.retrieve(id), cancel: async (id: string) => (await modelClient()).responses.cancel(id) };
}
export function terminalCommandsView(row: TerminalCommandsRecord | null, study: string, index: number): TerminalCommandsView {
  return { version: TERMINAL_COMMANDS_VERSION, study_id: study, experiment_index: index, target: TERMINAL_TARGET, stage: row?.status ?? "not_generated", command_set: row?.command_set ?? null, reason: row?.reason ?? null, generated_at: row?.generated_at ?? null };
}
export async function prepareTerminalCommands(plan: ExperimentPlanRecord, index: number) {
  if (plan.status !== "ready" || !plan.plan) throw new ExperimentPlanError("Wait for the saved experiment steps before generating commands.", 409);
  const request = terminalCommandsRequest(plan.study_id, index, plan.plan, plan.confirmed_breakdown);
  return generateTerminalCommands(request, operations(plan.study_id, plan.owner_id, index));
}
export const refreshSavedTerminalCommands = (row: TerminalCommandsRecord) => refreshTerminalCommands(row, operations(row.study_id, row.owner_id, row.experiment_index));
export const cancelSavedTerminalCommands = (row: TerminalCommandsRecord) => cancelTerminalCommands(row, operations(row.study_id, row.owner_id, row.experiment_index));
