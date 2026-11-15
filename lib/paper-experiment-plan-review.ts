import { isDeepStrictEqual } from "node:util";
import type { Response } from "openai/resources/responses/responses";
import type { ExperimentPlanRecord } from "./paper-experiment-plan-runner";
import { validateExperimentPlan, type ExperimentPlan } from "./paper-experiment-plan";
import { validatePaperBreakdown } from "./research-paper-breakdown";

export type ValidationStepSelection = { claim_ref: string; experiment: number; stage: number; step: number };
export type PlanLinkChange = { experiment: number; stage: number; step: number; from: string; to: null };
export type ExperimentPlanLinkReview = {
  id: string; study_id: string; owner_id: string; base_revision: number; provider_response_id: string;
  keep_validation_steps: ValidationStepSelection[]; plan: ExperimentPlan; changes: PlanLinkChange[];
  reason: string; reviewer_type: "AI" | "human"; created_at: string;
};
type RetainedPlan = ExperimentPlanRecord & { revision: number; response: Response | null };
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const eligibleReason = (value: unknown) => value === "The experiment steps could not be verified against the confirmed paper sections." || typeof value === "string" && value.startsWith("More than one step is assigned to validate-");

/** Explicit operator selection, never a heuristic that silently chooses a claim evaluator.
 * Only duplicated validation_ref annotations can become null. Everything else,
 * including original output, evidence, criteria and scientific instructions, stays fixed. */
export function reviewExperimentPlanLinks(row: RetainedPlan, keep: unknown) {
  if (row.status !== "failed" || row.plan !== null || !eligibleReason(row.reason) || !Number.isSafeInteger(row.revision) || row.revision < 1 ||
      !row.response || row.response.id !== row.provider_response_id || row.response.status !== "completed") throw new Error("A retained completed planning response with a link-validation failure is required.");
  const request = row.request as { text?: { format?: { name?: string } } } | null;
  if (request?.text?.format?.name !== "paper_experiment_steps_v3" || row.response.text?.format?.type === "json_schema" && row.response.text.format.name !== request.text.format.name) throw new Error("The original hierarchical planning format is required.");
  validatePaperBreakdown(row.confirmed_breakdown);
  if (row.response.output.some(item => item.type === "message" && item.content.some(part => part.type === "refusal"))) throw new Error("A refused response cannot be reviewed as a plan.");
  const raw: unknown = JSON.parse(row.response.output.filter(item => item.type === "message").flatMap(item => item.content).filter(part => part.type === "output_text").map(part => part.text).join(""));
  if (!object(raw) || !Array.isArray(raw.experiments) || !Array.isArray(keep) || !keep.length || keep.length > 32) throw new Error("Explicit retained validation-step selections are required.");
  const candidate = structuredClone(raw), changes: PlanLinkChange[] = [], seen = new Set<string>();
  const actions: { action: Record<string, unknown>; experiment: number; stage: number; step: number }[] = [];
  for (const [e, experiment] of (candidate.experiments as unknown[]).entries()) {
    if (!object(experiment) || !Array.isArray(experiment.stages)) throw new Error("The original response must contain hierarchical stages.");
    for (const [s, stage] of experiment.stages.entries()) {
      if (!object(stage) || !Array.isArray(stage.steps)) throw new Error("The original response must contain actionable steps.");
      for (const [a, action] of stage.steps.entries()) {
        if (!object(action)) throw new Error("The original action is invalid.");
        actions.push({ action, experiment: e + 1, stage: s + 1, step: a + 1 });
      }
    }
  }
  for (const selected of keep) {
    if (!object(selected) || Object.keys(selected).sort().join(",") !== "claim_ref,experiment,stage,step" || typeof selected.claim_ref !== "string" || seen.has(selected.claim_ref) ||
        ![selected.experiment, selected.stage, selected.step].every(v => Number.isSafeInteger(v) && Number(v) >= 1 && Number(v) <= 8)) throw new Error("Select one existing dedicated step per duplicated claim.");
    seen.add(selected.claim_ref);
    const occurrences = actions.filter(({ action }) => action.validation_ref === selected.claim_ref);
    if (occurrences.length < 2 || !occurrences.some(a => a.experiment === selected.experiment && a.stage === selected.stage && a.step === selected.step)) throw new Error("The selection must retain an existing duplicated claim assignment.");
    for (const a of occurrences) if (a.experiment !== selected.experiment || a.stage !== selected.stage || a.step !== selected.step) {
      changes.push({ experiment: a.experiment, stage: a.stage, step: a.step, from: selected.claim_ref, to: null });
      a.action.validation_ref = null;
    }
  }
  return { plan: validateExperimentPlan(candidate, row.confirmed_breakdown), changes };
}

export function applyExperimentPlanLinkReview(row: RetainedPlan, review: ExperimentPlanLinkReview): ExperimentPlanRecord {
  if (review.study_id !== row.study_id || review.owner_id !== row.owner_id || review.base_revision !== row.revision || review.provider_response_id !== row.provider_response_id) throw new Error("The reviewed plan does not match the retained confirmation and response.");
  const expected = reviewExperimentPlanLinks(row, review.keep_validation_steps);
  if (!isDeepStrictEqual(review.plan, expected.plan) || !isDeepStrictEqual(review.changes, expected.changes)) throw new Error("The review changed more than the selected duplicate validation links.");
  return { ...row, status: "ready", plan: expected.plan, reason: null, link_review: { id: review.id, original_revision: review.base_revision, reviewed_at: review.created_at, reviewer_type: review.reviewer_type } };
}
