import "server-only";
import OpenAI from "openai";
import { intakeDatabase } from "./paper-intake-server";
import { ExperimentPlanError, loadExperimentPlan, refreshPlan } from "./paper-experiment-plan-server";
import { loadExperimentScripts, refreshExperimentScripts } from "./paper-experiment-scripts-server";
import { readWithAssessmentDeletion } from "./assessment-visibility";
import { qualityMetadataFor, qualityMetadataStage, qualityMetadataReason } from "./paper-quality-server";
import { PAPER_WORK_STATUS_VERSION, validatePaperWorkListing, workKey, workPending, type PaperWorkListing, type PaperWorkUnit } from "./paper-work-status";

// Titles provide the bounded experiment count without downloading plans, quotes or scripts.
export const WORK_EXPERIMENT_COLUMNS = Array.from({ length: 8 }, (_, i) => `experiment_${i}:plan->experiments->${i}->>title`).join(",");
type PlanMetadata = { study_id: string; status: PaperWorkUnit["stage"]; updated_at: string; reason: string | null; revision: number; provider_response_id: string | null; [key: string]: unknown };
type ScriptMetadata = { study_id: string; status: PaperWorkUnit["stage"]; updated_at: string; reason: string | null; experiment_index: number; plan_revision: number; link_review_id: string | null; quality_required?: string };
type ReviewMetadata = PlanMetadata & { id: string; base_revision: number };
function unavailable(): never { throw new ExperimentPlanError("Background paper status could not be checked. Saved requests are retained.", 503); }
const countExperiments = (row: PlanMetadata) => Array.from({ length: 8 }, (_, i) => row[`experiment_${i}`]).filter(value => typeof value === "string" && value.length > 0).length;

/** Discover saved work; refresh a fair, bounded slice of original calls. Never admits inference. */
export async function ownerPaperWork(owner: string, cursor: number): Promise<PaperWorkListing> {
  const db = await intakeDatabase();
  const owned = await readWithAssessmentDeletion(filter => {
    const query = db.from("research_study_owners").select("study_id,active_study:research_studies!inner(id)").eq("owner_id", owner).limit(1001);
    return filter ? query.is("active_study.deleted_at", null) : query;
  });
  if (owned.error || !owned.data || owned.data.length > 1000) unavailable();
  const ids = owned.data.map(row => row.study_id as string);
  if (!ids.length) return { version: PAPER_WORK_STATUS_VERSION, study_ids: [], units: [], next_cursor: 0 };
  const [studies, plans, scripts, intakes] = await Promise.all([
    db.from("research_studies").select("id,title").in("id", ids).eq("study_kind", "paper").limit(1001),
    db.from("research_experiment_plans").select(`study_id,status,updated_at,reason,revision,provider_response_id,quality_required:policy_snapshot->>quality_review,${WORK_EXPERIMENT_COLUMNS}`).eq("owner_id", owner).in("study_id", ids).limit(1001),
    db.from("research_experiment_scripts").select("study_id,experiment_index,status,updated_at,reason,plan_revision,link_review_id,quality_required:policy_snapshot->>quality_review").eq("owner_id", owner).eq("target", "ubuntu-debian").in("study_id", ids).limit(8001),
    db.from("research_paper_intakes").select("study_id,quality_required:policy_snapshot->>quality_review").eq("owner_id", owner).in("study_id", ids).limit(1001),
  ]);
  if (studies.error || plans.error || scripts.error || intakes.error || !studies.data || !plans.data || !scripts.data || !intakes.data || studies.data.length > 1000 || plans.data.length > 1000 || scripts.data.length > 8000 || intakes.data.length > 1000) unavailable();
  const paperIds = studies.data.map(row => row.id as string), titles = new Map(studies.data.map(row => [row.id as string, row.title as string]));
  const metadata = plans.data as unknown as PlanMetadata[], packages = scripts.data as unknown as ScriptMetadata[];
  const quality = await qualityMetadataFor(owner, [...metadata, ...packages, ...intakes.data].filter(r => r.quality_required === "true").map(r => r.study_id));
  const failed = metadata.filter(row => row.status === "failed").map(row => row.study_id);
  const reviews = failed.length ? await db.from("research_experiment_plan_link_reviews").select(`id,study_id,base_revision,provider_response_id,updated_at:created_at,${WORK_EXPERIMENT_COLUMNS}`).eq("owner_id", owner).in("study_id", failed).limit(1001) : { data: [], error: null };
  if (reviews.error || !reviews.data || reviews.data.length > 1000) unavailable();
  const units: PaperWorkUnit[] = [];
  for (const plan of metadata) {
    const title = titles.get(plan.study_id); if (!title) continue;
    const review = (reviews.data as unknown as ReviewMetadata[]).find(row => row.study_id === plan.study_id && row.base_revision === plan.revision && row.provider_response_id === plan.provider_response_id);
    const source = review ?? plan, stage = review ? "ready" : plan.status;
    const q = quality.find(q => q.study_id === plan.study_id && q.step === 3);
    const gated = plan.quality_required === "true" && stage === "ready";
    units.push({ id: plan.study_id, title, step: 3, index: 1, total: 1, stage: gated ? qualityMetadataStage(q) : stage, reason: gated ? qualityMetadataReason(q, 3) : review ? null : plan.reason, updated_at: source.updated_at });
    const recorded = packages.filter(row => row.study_id === plan.study_id);
    const total = countExperiments(gated && q?.status === "approved" ? q as unknown as PlanMetadata : source);
    if (!recorded.length || !total) continue;
    for (let index = 1; index <= total; index++) {
      const row = recorded.find(item => item.experiment_index === index);
      const sameSource = !row || row.plan_revision === plan.revision && row.link_review_id === (review?.id ?? null);
      const q = quality.find(q => q.study_id === plan.study_id && q.step === 4 && q.experiment_index === index), gated = row?.quality_required === "true" && row.status === "ready";
      units.push({ id: plan.study_id, title, step: 4, index, total, stage: !sameSource ? "failed" : gated ? qualityMetadataStage(q) : row?.status ?? "not_generated", reason: !sameSource ? "These scripts belong to an earlier experiment plan. Their original records are retained." : gated ? qualityMetadataReason(q, 4) : row?.reason ?? null, updated_at: row?.updated_at ?? source.updated_at });
    }
  }
  const pending = units.filter(unit => workPending(unit.stage)).sort((a, b) => workKey(a).localeCompare(workKey(b)));
  const start = pending.length ? cursor % pending.length : 0;
  await Promise.all(Array.from({ length: Math.min(2, pending.length) }, async (_, offset) => {
    const unit = pending[(start + offset) % pending.length];
    try {
      if (unit.step === 3) {
        const saved = await loadExperimentPlan(unit.id, owner);
        if (!saved) unavailable();
        const current = await refreshPlan(saved);unit.stage = current.status;unit.reason = current.reason;unit.updated_at = current.updated_at;
      } else {
        const saved = await loadExperimentScripts(unit.id, owner, unit.index);
        if (!saved) unavailable();
        const current = await refreshExperimentScripts(saved);unit.stage = current.status;unit.reason = current.reason;unit.updated_at = current.updated_at;
      }
    } catch (error) {
      unit.status_error = error instanceof OpenAI.APIError ? `Model status could not be checked (HTTP ${error.status ?? "unavailable"}). The original request is retained.` : "The saved request status is temporarily unavailable and will be checked again.";
    }
  }));
  return validatePaperWorkListing({ version: PAPER_WORK_STATUS_VERSION, study_ids: paperIds, units, next_cursor: pending.length ? (start + Math.min(2, pending.length)) % pending.length : 0, review_pending: quality.some(q => ["review_pending", "repair_pending", "running"].includes(q.status)) });
}
