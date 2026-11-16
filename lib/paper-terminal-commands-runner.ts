import OpenAI from "openai";
import type { Response } from "openai/resources/responses/responses";
import type { ExperimentPlan } from "./paper-experiment-plan";
import type { PaperBreakdown } from "./research-paper-breakdown";
import { TERMINAL_COMMAND_LAYOUT, terminalActionRefs, terminalBlockedActionRefs, validateTerminalCommandSet, type TerminalCommandSet, type TerminalStage } from "./paper-terminal-commands";
import { TERMINAL_COMMANDS_FORMAT, terminalCommandsRequest } from "./paper-terminal-commands-model";
import { STEP_COMMANDS_FORMAT, validateStepCommandSet } from "./paper-step-commands";

export type TerminalCommandsRecord = { study_id: string; owner_id: string; experiment_index: number; command_layout?: string; action_ref?: string; status: Exclude<TerminalStage, "not_generated">; source_plan: ExperimentPlan; confirmed_breakdown: PaperBreakdown; request: unknown; response?: Response | null; provider_response_id: string | null; submit_token: string; updated_at: string; deadline_at: string; command_set: TerminalCommandSet | null; reason: string | null; generated_at: string | null; admitted?: boolean };
export type TerminalOperations = { save: (operation: string, payload: Record<string, unknown>) => Promise<TerminalCommandsRecord>; create: (request: ReturnType<typeof terminalCommandsRequest>, token: string) => Promise<Response>; retrieve: (id: string) => Promise<Response>; cancel: (id: string) => Promise<Response> };
export function readTerminalCommands(response: Response, row: Pick<TerminalCommandsRecord, "source_plan" | "confirmed_breakdown" | "experiment_index" | "command_layout" | "action_ref">) {
  if (response.status !== "completed") throw new Error(`OpenAI returned ${response.status ?? "an unknown status"}. The original command-generation response is retained.`);
  if (response.text?.format?.type === "json_schema" && response.text.format.name !== (row.action_ref ? STEP_COMMANDS_FORMAT : TERMINAL_COMMANDS_FORMAT)) throw new Error("The response does not match the retained command format.");
  if (response.output.some(item => item.type === "message" && item.content.some(part => part.type === "refusal"))) throw new Error("The model declined to generate terminal commands.");
  const raw = response.output.filter(item => item.type === "message").flatMap(item => item.content).filter(part => part.type === "output_text").map(part => part.text).join("");
  if (row.action_ref) return validateStepCommandSet(JSON.parse(raw), row.source_plan, row.confirmed_breakdown, row.experiment_index, row.action_ref);
  return validateTerminalCommandSet(JSON.parse(raw), terminalActionRefs(row.source_plan, row.experiment_index), terminalBlockedActionRefs(row.source_plan, row.experiment_index, row.confirmed_breakdown), row.command_layout === TERMINAL_COMMAND_LAYOUT);
}
export async function generateTerminalCommands(request: ReturnType<typeof terminalCommandsRequest>, ops: TerminalOperations) {
  const row = await ops.save("generate", { request });
  if (!row.admitted) return row;
  let response;
  try { response = await ops.create(request, row.submit_token); }
  catch (error) {
    const rejected = error instanceof OpenAI.APIError && error.status && error.status >= 400 && error.status < 500 && ![408, 409].includes(error.status);
    return ops.save(rejected ? "failed" : "uncertain", { token: row.submit_token, ...(rejected ? { response: { status: error.status, request_id: error.requestID } } : {}), reason: rejected ? `OpenAI rejected command generation (HTTP ${error.status}). The original request is retained.` : "The original command-generation submission could not be confirmed. It will not be submitted again automatically; check its saved status." });
  }
  const payload = { token: row.submit_token, response_id: response.id, response };
  try { return await ops.save("submitted", payload); } catch { return ops.save("submitted", payload); }
}
const live = (response: Response) => ["queued", "in_progress"].includes(response.status ?? "");
export async function refreshTerminalCommands(row: TerminalCommandsRecord, ops: TerminalOperations): Promise<TerminalCommandsRecord> {
  if (row.status === "submitting" && Date.now() - Date.parse(row.updated_at) > 120000) return ops.save("uncertain", { token: row.submit_token, reason: "The original command-generation submission could not be confirmed. It will not be repeated automatically." });
  if (row.status !== "processing" || !row.provider_response_id) return row;
  let response = await ops.retrieve(row.provider_response_id);
  if (response.id !== row.provider_response_id) throw new Error("The command response does not match its original call.");
  if (live(response) && Date.parse(row.deadline_at) <= Date.now()) response = await ops.cancel(row.provider_response_id);
  if (response.id !== row.provider_response_id) throw new Error("The command cancellation does not match its original call.");
  if (live(response)) return row;
  if (response.status === "cancelled") return ops.save("cancel", { token: row.submit_token, response, reason: "Command generation was cancelled or its original deadline expired." });
  let command_set;
  try { command_set = readTerminalCommands(response, row); }
  catch (error) { return ops.save("failed", { token: row.submit_token, response, reason: error instanceof Error ? error.message : "Terminal commands could not be verified." }); }
  return ops.save("finish", { token: row.submit_token, response_id: response.id, response, command_set });
}
export async function cancelTerminalCommands(row: TerminalCommandsRecord, ops: TerminalOperations) {
  if (["ready", "failed", "cancelled"].includes(row.status)) return row;
  if (row.status !== "processing" || !row.provider_response_id) throw new Error("Reconcile the original submission before cancellation; no replacement call will be made.");
  const current = await refreshTerminalCommands(row, ops);
  if (current.status !== "processing") return current;
  const response = await ops.cancel(row.provider_response_id);
  if (response.id !== row.provider_response_id || response.status !== "cancelled") throw new Error("Command cancellation is not confirmed. Check the saved request status.");
  return ops.save("cancel", { token: row.submit_token, response, reason: "Owner cancelled terminal command generation." });
}
