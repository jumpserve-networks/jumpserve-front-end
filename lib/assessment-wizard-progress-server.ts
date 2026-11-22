import "server-only";
import { intakeDatabase } from "./paper-intake-server";
import { readWithAssessmentDeletion } from "./assessment-visibility";
import { ASSESSMENT_PROGRESS_VERSION, validateProgressIds, type AssessmentStep, type AssessmentWizardProgress } from "./assessment-wizard-progress";

type Result = { data: unknown; count: number | null; error: unknown };
function rows(result: Result, ids: string[], field: "id" | "study_id") {
  if (result.error || !Array.isArray(result.data) || result.count !== result.data.length || result.data.length > ids.length) throw new Error("Assessment steps could not be checked.");
  const records = new Map<string, Record<string, unknown>>();
  for (const row of result.data) {
    if (!row || typeof row[field] !== "string" || !ids.includes(row[field]) || records.has(row[field])) throw new Error("Assessment steps could not be checked.");
    records.set(row[field], row);
  }
  return records;
}

/** A bounded public projection. Private source text, plans and owner IDs never
 * leave the server. Reads cannot reconcile model calls or start work. */
export async function readAssessmentWizardProgress(ids: string[]): Promise<AssessmentWizardProgress> {
  validateProgressIds(ids);
  const db = await intakeDatabase();
  const active = rows(await readWithAssessmentDeletion(filterDeleted => {
    const query = db.from("research_studies").select("id", { count: "exact" }).in("id", ids).eq("study_kind", "paper").limit(ids.length + 1);
    return filterDeleted ? query.is("deleted_at", null) : query;
  }), ids, "id");
  const activeIds = [...active.keys()];
  const steps = new Map<string, AssessmentStep>();
  if (activeIds.length) {
    const [intakes, plans, reviews, workflows, skillAssessments] = await Promise.all([
      db.from("research_paper_intakes").select("study_id,status", { count: "exact" }).in("study_id", activeIds).limit(activeIds.length + 1),
      db.from("research_experiment_plans").select("study_id,status,revision", { count: "exact" }).in("study_id", activeIds).limit(activeIds.length + 1),
      db.from("research_paper_reviews").select("study_id,status,local_steps:coverage->local_codex_steps,local_version:metadata->local_codex_assessment->>version", { count: "exact" }).in("study_id", activeIds).limit(activeIds.length + 1),
      db.from("research_autonomy_workflows").select("study_id", { count: "exact" }).in("study_id", activeIds).limit(activeIds.length + 1),
      db.from("research_skill_submissions").select("study_id,first_run_id:bundle->runs->0->>id,first_setup_claim:bundle->wizard->experiments->0->claim_ids->>0", { count: "exact" }).in("study_id", activeIds).limit(activeIds.length + 1),
    ]);
    const intakeRows = rows(intakes, activeIds, "study_id"), planRows = rows(plans, activeIds, "study_id"), reviewRows = rows(reviews, activeIds, "study_id"), workflowRows = rows(workflows, activeIds, "study_id");
    // Instances installed before the connector migration can still list legacy progress.
    const skillRows = ["42P01", "PGRST205"].includes(skillAssessments.error?.code ?? "") ? new Map() : rows(skillAssessments, activeIds, "study_id");
    const failedIds = activeIds.filter(id => planRows.get(id)?.status === "failed");
    let linkReviews = new Map<string, Record<string, unknown>>();
    if (failedIds.length) {
      const result = await db.from("research_experiment_plan_link_reviews").select("study_id,base_revision", { count: "exact" }).in("study_id", failedIds).limit(failedIds.length + 1);
      if (!result.error || !["42P01", "PGRST205"].includes(result.error.code ?? "")) linkReviews = rows(result, failedIds, "study_id");
      for (const [id, review] of linkReviews) if (!Number.isSafeInteger(review.base_revision) || review.base_revision !== planRows.get(id)?.revision) throw new Error("Reviewed assessment steps could not be checked.");
    }
    for (const id of activeIds) {
      const intake = intakeRows.get(id)?.status, plan = planRows.get(id)?.status, review = reviewRows.get(id)?.status;
      if (intake !== undefined && !["uploaded", "submitting", "processing", "uncertain", "ready", "failed", "cancelled"].includes(String(intake)) ||
          plan !== undefined && !["submitting", "processing", "uncertain", "ready", "failed", "cancelled"].includes(String(plan)) ||
          review !== undefined && !["preparing", "ready", "failed", "confirmed"].includes(String(review))) throw new Error("Assessment steps could not be checked.");
      const local = reviewRows.get(id);
      const localComplete = review === "confirmed" && local?.local_version === "local-codex-assessment-v1" && JSON.stringify(local.local_steps) === "[2,3,4]";
      const skill = skillRows.get(id);
      if (skill?.first_run_id) steps.set(id, 5);
      else if (skill?.first_setup_claim || localComplete || workflowRows.has(id) || plan === "ready" || linkReviews.has(id)) steps.set(id, 4);
      else if (plan !== undefined || review === "confirmed") steps.set(id, 3);
      else if (intake === "uploaded") steps.set(id, 1);
      else if (intake !== undefined || review !== undefined) steps.set(id, 2);
    }
  }
  return { version: ASSESSMENT_PROGRESS_VERSION, access: "public-read-only", assessments: ids.map(id => ({ id, step: steps.get(id) ?? null })) };
}
