import OpenAI from "openai";
import type { Response } from "openai/resources/responses/responses";
import { experimentPlanRequest, PAPER_EXPERIMENT_PLAN_FORMAT } from "./paper-experiment-plan-model";
import { validateExperimentPlan, type ExperimentPlan, type PlanStage } from "./paper-experiment-plan";
import type { PaperBreakdown } from "./research-paper-breakdown";

export type ExperimentPlanRecord = {
  study_id: string; owner_id: string; status: Exclude<PlanStage, "awaiting_confirmation">;
  intake_revision: number; confirmed_at: string; confirmed_breakdown: PaperBreakdown;
  submit_token: string | null; provider_response_id: string | null; request: unknown;
  deadline_at: string; updated_at: string; plan: ExperimentPlan | null; reason: string | null; admitted?: boolean;
};
export type PlanOperations = {
  save: (operation: string, payload: Record<string, unknown>) => Promise<ExperimentPlanRecord>;
  create: (request: ReturnType<typeof experimentPlanRequest>, token: string) => Promise<Response>;
  retrieve: (id: string) => Promise<Response>; cancel: (id: string) => Promise<Response>;
};
const live = (response: Response) => ["queued", "in_progress"].includes(response.status ?? "");
export function readExperimentPlan(response: Response, breakdown: PaperBreakdown, format = response.text?.format?.type === "json_schema" ? response.text.format.name : undefined) {
  if (response.status !== "completed") throw new Error(`OpenAI returned ${response.status ?? "an unknown planning status"}. The original response is retained.`);
  if (response.output.some(item => item.type === "message" && item.content.some(part => part.type === "refusal"))) throw new Error("The model declined to prepare experiment steps.");
  const output = response.output.filter(item => item.type === "message").flatMap(item => item.content).filter(part => part.type === "output_text").map(part => part.text).join("");
  const plan = validateExperimentPlan(JSON.parse(output), breakdown);
  if (format === PAPER_EXPERIMENT_PLAN_FORMAT && plan.experiments.some(experiment => !experiment.stages)) throw new Error("The experiment plan is missing its stages and actionable substeps.");
  if (["paper_experiment_steps_v1", "paper_experiment_steps_v2"].includes(format ?? "") && plan.experiments.some(experiment => experiment.stages)) throw new Error("The response does not match the original flat planning format.");
  return plan;
}

/** Admission, confirmation and the exact prompt commit together before inference. */
export async function confirmAndPlan(payload: Record<string, unknown>, request: ReturnType<typeof experimentPlanRequest> | null, ops: PlanOperations) {
  const row = await ops.save("confirm", { ...payload, request });
  if (!row.admitted || !request) return row;
  let response;
  try { response = await ops.create(request, row.submit_token!); }
  catch (error) {
    const rejected = error instanceof OpenAI.APIError && error.status && error.status >= 400 && error.status < 500 && ![408, 409].includes(error.status);
    return ops.save(rejected ? "failed" : "uncertain", { token: row.submit_token,
      ...(rejected ? { response: { status: error.status, request_id: error.requestID } } : {}),
      reason: rejected ? `OpenAI rejected the planning request (HTTP ${error.status}). The original request is retained.` : "The original planning submission could not be confirmed. It will not be submitted again automatically; its retained request identity needs reconciliation." });
  }
  const acknowledgement = { token: row.submit_token, response_id: response.id, response };
  try { return await ops.save("submitted", acknowledgement); }
  catch { return ops.save("submitted", acknowledgement); }
}

export async function refreshExperimentPlan(row: ExperimentPlanRecord, ops: PlanOperations): Promise<ExperimentPlanRecord> {
  if (row.status === "submitting" && Date.now() - Date.parse(row.updated_at) > 120_000) return ops.save("uncertain", { token: row.submit_token, reason: "The original planning submission could not be confirmed. It will not be submitted again automatically." });
  if (row.status !== "processing" || !row.provider_response_id) return row;
  let response = await ops.retrieve(row.provider_response_id);
  if (response.id !== row.provider_response_id) throw new Error("The response does not match the retained planning call.");
  const expired = Date.parse(row.deadline_at) <= Date.now();
  if (live(response) && expired) response = await ops.cancel(row.provider_response_id);
  if (response.id !== row.provider_response_id) throw new Error("The cancellation response does not match the retained planning call.");
  if (live(response)) return row;
  if (response.status === "cancelled") return ops.save("cancel", { token: row.submit_token, response, reason: expired ? "The original assessment deadline expired." : "Planning was cancelled." });
  let plan: ExperimentPlan;
  try {
    const request = row.request as { text?: { format?: { name?: string } } } | null;
    plan = readExperimentPlan(response, row.confirmed_breakdown, request?.text?.format?.name);
  } catch (error) { return ops.save("failed", { token: row.submit_token, response, reason: error instanceof Error ? error.message : "The experiment steps could not be verified." }); }
  return ops.save("finish", { token: row.submit_token, response_id: response.id, response, plan });
}

export async function cancelExperimentPlan(row: ExperimentPlanRecord, ops: PlanOperations) {
  if (["ready", "failed", "cancelled"].includes(row.status)) return row;
  if (row.status !== "processing" || !row.provider_response_id) throw new Error("The original submission must be reconciled before cancellation can be confirmed. Check status; no replacement call will be submitted.");
  const current = await refreshExperimentPlan(row, ops);
  if (current.status !== "processing") return current;
  const response = await ops.cancel(row.provider_response_id);
  if (response.id !== row.provider_response_id || live(response) || response.status !== "cancelled") throw new Error("Cancellation has not been confirmed. Check the original planning call’s status.");
  return ops.save("cancel", { token: row.submit_token, response, reason: "Owner cancelled experiment planning." });
}
