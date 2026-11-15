import "server-only";
import { intakeDatabase, modelClient } from "./paper-intake-server";
import { confirmPaperSections, EXPERIMENT_PLAN_VERSION, type ExperimentPlanView } from "./paper-experiment-plan";
import { experimentPlanRequest } from "./paper-experiment-plan-model";
import { confirmAndPlan, refreshExperimentPlan, cancelExperimentPlan, type ExperimentPlanRecord } from "./paper-experiment-plan-runner";
import { validatePaperBreakdown, type PaperBreakdown } from "./research-paper-breakdown";
import type { IntakeRecord } from "./paper-intake-runner";
import { applyExperimentPlanLinkReview, type ExperimentPlanLinkReview } from "./paper-experiment-plan-review";

export class ExperimentPlanError extends Error {
  public status: number;
  constructor(message: string, status: number) { super(message); this.status = status; }
}
function databaseFailure(error: { code?: string; message: string }): never {
  if (["42P01", "PGRST205", "PGRST202"].includes(error.code ?? "")) throw new ExperimentPlanError("Experiment planning needs the phase-two database update.", 424);
  throw new ExperimentPlanError(`Experiment planning could not be saved: ${error.message}`, 409);
}
export async function loadExperimentPlan(study: string, actor: string) {
  const { data, error } = await (await intakeDatabase()).from("research_experiment_plans").select("*").eq("study_id", study).eq("owner_id", actor).maybeSingle();
  if (error) databaseFailure(error);
  return data ? effectiveExperimentPlan(data as ExperimentPlanRecord) : null;
}
/** Reviewed link corrections overlay the immutable failed call and its original evidence. */
async function effectiveExperimentPlan(row: ExperimentPlanRecord) {
  if (row.status !== "failed") return row;
  const { data, error } = await (await intakeDatabase()).from("research_experiment_plan_link_reviews").select("*").eq("study_id", row.study_id).eq("owner_id", row.owner_id).maybeSingle();
  if (error && ["42P01", "PGRST205"].includes(error.code ?? "")) return row;
  if (error) databaseFailure(error);
  return data ? applyExperimentPlanLinkReview(row as Parameters<typeof applyExperimentPlanLinkReview>[0], data as ExperimentPlanLinkReview) : row;
}
function operations(study: string, actor: string) {
  return {
    save: async (operation: string, payload: Record<string, unknown>) => {
      const { data, error } = await (await intakeDatabase()).rpc("research_experiment_plan", { p_operation: operation, p_actor: actor, p_study: study, p_payload: payload });
      if (error && operation === "confirm" && error.message === "Plan only from the exact confirmed sections") {
        const confirmed = payload.confirmed_breakdown as PaperBreakdown;
        const dependencies = Object.values(confirmed.sections).some(items => items.some(item => item.depends_on !== undefined));
        throw new ExperimentPlanError(`Experiment planning needs the ${dependencies ? "paper-dependencies" : "hierarchical-steps"} database update. Your paper has not been confirmed and no model call was sent.`, 424);
      }
      if (error) databaseFailure(error);
      return effectiveExperimentPlan(data as ExperimentPlanRecord);
    },
    create: async (request: ReturnType<typeof experimentPlanRequest>, token: string) => (await modelClient()).responses.create(request, { headers: { "X-Client-Request-Id": token } }),
    retrieve: async (id: string) => (await modelClient()).responses.retrieve(id), cancel: async (id: string) => (await modelClient()).responses.cancel(id),
  };
}
export function experimentPlanView(row: ExperimentPlanRecord | null, intake: IntakeRecord & { revision?: number }): ExperimentPlanView {
  return { version: EXPERIMENT_PLAN_VERSION, study_id: intake.study_id, stage: row?.status ?? "awaiting_confirmation", intake_revision: row?.intake_revision ?? intake.revision!,
    confirmed_at: row?.confirmed_at ?? null, confirmed_breakdown: row?.confirmed_breakdown ?? null, plan: row?.plan ?? null, reason: row?.reason ?? null, ...(row?.link_review ? { link_review: row.link_review } : {}) };
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
