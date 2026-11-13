import "server-only";
import { intakeDatabase, modelClient } from "./paper-intake-server";
import { confirmPaperSections, EXPERIMENT_PLAN_VERSION, type ExperimentPlanView } from "./paper-experiment-plan";
import { experimentPlanRequest } from "./paper-experiment-plan-model";
import { confirmAndPlan, refreshExperimentPlan, cancelExperimentPlan, type ExperimentPlanRecord } from "./paper-experiment-plan-runner";
import { validatePaperBreakdown } from "./research-paper-breakdown";
import type { IntakeRecord } from "./paper-intake-runner";

export class ExperimentPlanError extends Error {
  constructor(message: string, public status: number) { super(message); }
}
function databaseFailure(error: { code?: string; message: string }): never {
  if (["42P01", "PGRST205", "PGRST202"].includes(error.code ?? "")) throw new ExperimentPlanError("Experiment planning needs the phase-two database update.", 424);
  throw new ExperimentPlanError(`Experiment planning could not be saved: ${error.message}`, 409);
}
export async function loadExperimentPlan(study: string, actor: string) {
  const { data, error } = await (await intakeDatabase()).from("research_experiment_plans").select("*").eq("study_id", study).eq("owner_id", actor).maybeSingle();
  if (error) databaseFailure(error);
  return data as ExperimentPlanRecord | null;
}
function operations(study: string, actor: string) {
  return {
    save: async (operation: string, payload: Record<string, unknown>) => {
      const { data, error } = await (await intakeDatabase()).rpc("research_experiment_plan", { p_operation: operation, p_actor: actor, p_study: study, p_payload: payload });
      if (error && operation === "confirm" && error.message === "Plan only from the exact confirmed sections") throw new ExperimentPlanError("Experiment planning needs the hierarchical-steps database update. Your paper has not been confirmed and no model call was sent.", 424);
      if (error) databaseFailure(error);
      return data as ExperimentPlanRecord;
    },
    create: async (request: ReturnType<typeof experimentPlanRequest>, token: string) => (await modelClient()).responses.create(request, { headers: { "X-Client-Request-Id": token } }),
    retrieve: async (id: string) => (await modelClient()).responses.retrieve(id), cancel: async (id: string) => (await modelClient()).responses.cancel(id),
  };
}
export function experimentPlanView(row: ExperimentPlanRecord | null, intake: IntakeRecord & { revision?: number }): ExperimentPlanView {
  return { version: EXPERIMENT_PLAN_VERSION, study_id: intake.study_id, stage: row?.status ?? "awaiting_confirmation", intake_revision: row?.intake_revision ?? intake.revision!,
    confirmed_at: row?.confirmed_at ?? null, confirmed_breakdown: row?.confirmed_breakdown ?? null, plan: row?.plan ?? null, reason: row?.reason ?? null };
}
export const refreshPlan = (row: ExperimentPlanRecord) => refreshExperimentPlan(row, operations(row.study_id, row.owner_id));
export const cancelPlan = (row: ExperimentPlanRecord) => cancelExperimentPlan(row, operations(row.study_id, row.owner_id));
export async function confirmPlan(intake: IntakeRecord, revision: number, sections: unknown) {
  let confirmed;
  try { confirmed = confirmPaperSections(validatePaperBreakdown(intake.breakdown), sections); }
  catch (error) { throw new ExperimentPlanError(error instanceof Error ? error.message : "Review all four paper sections before confirming.", 400); }
  const request = confirmed.sections.experiment.length ? experimentPlanRequest(confirmed) : null;
  return confirmAndPlan({ intake_revision: revision, confirmed_breakdown: confirmed }, request, operations(intake.study_id, intake.owner_id));
}
