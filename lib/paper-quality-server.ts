import "server-only";
import { isDeepStrictEqual } from "node:util";
import type { Response } from "openai/resources/responses/responses";
import { PAPER_QUALITY_VERSION, qualityReason, validateQualityReview, type PaperQualityProgress, type PaperQualityStep } from "./paper-quality";
import { advancePaperQuality, cancelPaperQuality, qualityProgress, PaperQualityLimitError, type QualityWorkflow } from "./paper-quality-runner";
import { deterministicQualityChecks, type QualityIntakeCandidate } from "./paper-quality-checks";
import { qualityAttachment, retrieveQualitySandboxArtifact, type QualitySource } from "./paper-quality-model";
import { readPaperExtraction, type IntakeRecord } from "./paper-intake-runner";
import { extractionBreakdown } from "./paper-intake-model";
import { readExperimentPlan, type ExperimentPlanRecord } from "./paper-experiment-plan-runner";
import { readTerminalCommands, type TerminalCommandsRecord } from "./paper-terminal-commands-runner";
import type { ExperimentPlan } from "./paper-experiment-plan";
import type { TerminalCommandSet } from "./paper-terminal-commands";
import type { PaperBreakdown } from "./research-paper-breakdown";

export class PaperQualityError extends Error { status: number;constructor(message: string, status = 503) { super(message);this.status = status; } }
async function database() { return (await import("./paper-intake-server")).intakeDatabase(); }
async function model() { return (await import("./paper-intake-server")).modelClient(); }
const marked = (row: { policy_snapshot?: unknown }) => Boolean(row.policy_snapshot && typeof row.policy_snapshot === "object" && (row.policy_snapshot as { quality_review?: unknown }).quality_review === true);
function dbFailure(error: { code?: string } | null) { if (error) throw new PaperQualityError(["42P01", "PGRST205", "PGRST202"].includes(error.code ?? "") ? "Paper quality checking needs the database review-gate update." : "Quality-check evidence could not be saved. Original work is retained.", ["42P01", "PGRST205", "PGRST202"].includes(error.code ?? "") ? 424 : 503); }
export async function loadPaperQuality(study: string, owner: string, step: PaperQualityStep, index = 0): Promise<QualityWorkflow | null> {
  const db = await database(), result = await db.from("research_paper_quality_workflows").select("*").eq("study_id", study).eq("owner_id", owner).eq("step", step).eq("experiment_index", index).maybeSingle();
  dbFailure(result.error);if (!result.data) return null;
  let call = null;
  if (result.data.current_call_id) { const current = await db.from("research_paper_quality_calls").select("*").eq("id", result.data.current_call_id).eq("workflow_id", result.data.id).eq("owner_id", owner).maybeSingle();dbFailure(current.error);if (!current.data) throw new PaperQualityError("The original quality call is missing.");call = current.data; }
  return { ...result.data, call } as QualityWorkflow;
}
function operations(row: QualityWorkflow) {
  return {
    save: async (operation: string, payload: Record<string, unknown>) => {
      const { data, error } = await (await database()).rpc("research_paper_quality_control", { p_operation: operation, p_actor: row.owner_id, p_workflow: row.id, p_payload: payload });
      if (operation === "admit" && error?.code === "P0001" && /original assessment (budget|deadline)/i.test(error.message)) throw new PaperQualityLimitError("The original assessment budget or deadline does not allow another quality call. No replacement request was sent.");
      dbFailure(error);return data as QualityWorkflow;
    },
    upload: async (attachment: ReturnType<typeof qualityAttachment>) => {
      const file = await (await model()).files.create({ file: new File([attachment.text], attachment.filename, { type: "application/json" }), purpose: "user_data", expires_after: { anchor: "created_at", seconds: 86400 } });return file.id;
    },
    create: async (request: Parameters<Awaited<ReturnType<typeof model>>["responses"]["create"]>[0], token: string) => (await model()).responses.create(request, { headers: { "X-Client-Request-Id": token } }) as Promise<Response>,
    retrieve: async (id: string) => (await model()).responses.retrieve(id, { include: ["code_interpreter_call.outputs"] }), cancel: async (id: string) => (await model()).responses.cancel(id),
    sandboxArtifact: async (response: Response, source: QualitySource) => retrieveQualitySandboxArtifact(await model(), response, source),
    parseRepair: (response: Response, current: QualityWorkflow): unknown => {
      if (current.step === 2) {
        const paper = current.source_json.paper as NonNullable<IntakeRecord["paper_text"]>, extraction = readPaperExtraction(response, paper), original = current.source_json.candidate as QualityIntakeCandidate;
        return { breakdown: extractionBreakdown(extraction, paper, original.breakdown.source_id, original.breakdown.text_artifact_id, String(current.original_request.instructions)), title: extraction.title?.text ?? null, authors: extraction.authors.map(a => a.name), domain: extraction.domain?.text ?? null };
      }
      const breakdown = current.source_json.confirmed_breakdown as PaperBreakdown;
      if (current.step === 3) return readExperimentPlan(response, breakdown, current.original_request.text?.format?.type === "json_schema" ? current.original_request.text.format.name : undefined);
      return readTerminalCommands(response, { source_plan: current.source_json.plan as ExperimentPlan, confirmed_breakdown: breakdown, experiment_index: current.experiment_index, command_layout: "shared-setup-v2" });
    },
  };
}
export async function drivePaperQuality(row: QualityWorkflow, admit = false) { return advancePaperQuality(row, operations(row), admit); }
export async function stopPaperQuality(study: string, owner: string, step: PaperQualityStep, index = 0) {
  const row = await loadPaperQuality(study, owner, step, index);
  if (!row) throw new PaperQualityError("No retained quality workflow exists.", 409);
  return cancelPaperQuality(row, operations(row));
}
export type QualityGated = { quality?: PaperQualityProgress };
const stage = (q: Pick<QualityWorkflow, "status">) => q.status === "approved" ? "ready" : q.status === "uncertain" ? "uncertain" : q.status === "cancelled" ? "cancelled" : q.status === "needs_attention" ? "failed" : "processing";
export type QualityMetadata = Pick<QualityWorkflow, "study_id" | "step" | "experiment_index" | "status" | "phase" | "round" | "reason" | "source_revision" | "source_provider_id"> & { candidate_title: string | null; [key: string]: unknown };
export const qualityMetadataStage = (q: QualityMetadata | undefined) => q ? stage(q) : "processing";
export const qualityMetadataReason = (q: QualityMetadata | undefined, step: PaperQualityStep) => q?.status === "approved" ? null : q?.reason ?? qualityReason(q?.phase ?? "waiting", step, q?.round);
export async function qualityMetadataFor(owner: string, studies: string[]): Promise<QualityMetadata[]> {
  if (!studies.length) return [];
  const titles = Array.from({ length: 8 }, (_, i) => `experiment_${i}:candidate->experiments->${i}->>title`).join(",");
  const { data, error } = await (await database()).from("research_paper_quality_workflows").select("study_id,step,experiment_index,status,phase,round,reason,source_revision,source_provider_id,candidate_title:candidate->>title," + titles).eq("owner_id", owner).in("study_id", [...new Set(studies)]).limit(10001);
  dbFailure(error);if (!data || data.length > 10000) throw new PaperQualityError("The bounded quality status listing could not be read.");return data as unknown as QualityMetadata[];
}
async function gate(row: { study_id: string; owner_id: string; status: string; policy_snapshot?: unknown; revision?: number; provider_response_id?: string | null; paper_text?: unknown; confirmed_breakdown?: unknown; source_plan?: unknown }, step: PaperQualityStep, index: number, original: unknown) {
  if (!marked(row) || !["ready", "failed"].includes(row.status)) return null;
  let q = await loadPaperQuality(row.study_id, row.owner_id, step, index);
  if (!q) throw new PaperQualityError("The required quality approval record is missing.");
  if (q.status === "running") q = await drivePaperQuality(q, false); // Original-call reconciliation only.
  if (q.source_json && (!isDeepStrictEqual(q.source_json.candidate, original) || q.source_revision !== row.revision || q.source_provider_id !== row.provider_response_id || q.study_id !== row.study_id || q.owner_id !== row.owner_id || q.step !== step || q.experiment_index !== index || step === 2 && !isDeepStrictEqual(q.source_json.paper, row.paper_text) || step !== 2 && !isDeepStrictEqual(q.source_json.confirmed_breakdown, row.confirmed_breakdown) || step === 4 && !isDeepStrictEqual(q.source_json.plan, row.source_plan))) throw new PaperQualityError("The quality review belongs to a different original draft.");
  if (q.status === "approved") {
    const source = { ...q.source_json, candidate: q.candidate }, hash = qualityAttachment(source).hash;
    if (!q.review || validateQualityReview(q.review).decision !== "pass" || q.checks?.passed !== true || q.checks.source_sha256 !== hash || !deterministicQualityChecks(source).passed || step === 4 && (q.checks.sandbox?.result.passed !== true || q.checks.sandbox.result.source_sha256 !== hash)) throw new PaperQualityError("The approved output no longer passes its source checks.");
  }
  return q;
}
export async function qualityIntake(row: IntakeRecord & { policy_snapshot?: unknown }): Promise<IntakeRecord & QualityGated> {
  if (row.quality) return row;
  const q = await gate(row, 2, 0, { breakdown: row.breakdown, title: row.title, authors: row.authors, domain: row.domain });
  if (!q) return row;
  const quality = qualityProgress(q);
  if (q.status === "approved") return { ...row, ...(q.candidate as QualityIntakeCandidate), quality };
  return { ...row, status: stage(q), breakdown: null, title: null, domain: null, authors: [], reason: q.reason ?? qualityReason(q.phase, 2, q.round), quality };
}
export async function qualityPlan(row: ExperimentPlanRecord & { policy_snapshot?: unknown; revision?: number }): Promise<ExperimentPlanRecord & QualityGated> {
  const q = await gate(row, 3, 0, row.plan);if (!q) return row;
  return { ...row, status: stage(q), plan: q.status === "approved" ? q.candidate as ExperimentPlan : null, reason: q.reason ?? (q.status === "approved" ? null : qualityReason(q.phase, 3, q.round)), quality: qualityProgress(q) };
}
export async function qualityScripts(row: TerminalCommandsRecord & { policy_snapshot?: unknown; revision?: number }): Promise<TerminalCommandsRecord & QualityGated> {
  const q = await gate(row, 4, row.experiment_index, row.command_set);if (!q) return row;
  return { ...row, status: stage(q), command_set: q.status === "approved" ? q.candidate as TerminalCommandSet : null, generated_at: q.status === "approved" ? row.generated_at : null, reason: q.reason ?? (q.status === "approved" ? null : qualityReason(q.phase, 4, q.round)), quality: qualityProgress(q) };
}
/** Bounded owner-scoped POST continuation. Unknown submissions never enter the
 * candidate set; only their saved identities can be reconciled explicitly. */
export async function advanceOwnerPaperQuality(owner: string, cursor = 0) {
  const db = await database();
  const result = await db.from("research_paper_quality_workflows").select("study_id,step,experiment_index").eq("owner_id", owner).in("status", ["review_pending", "repair_pending", "running"]).order("updated_at").order("id").range(cursor, cursor + 1);
  dbFailure(result.error);
  let advanced = 0, unavailable = 0;
  for (const item of result.data ?? []) {
    try {
      const q = await loadPaperQuality(item.study_id, owner, item.step as PaperQualityStep, item.experiment_index);
      if (q) { await drivePaperQuality(q, true);advanced++; }
    } catch { unavailable++; } // Keep this identity; allow other saved work to progress.
  }
  return { version: PAPER_QUALITY_VERSION, advanced, unavailable, next_cursor: (result.data?.length ?? 0) < 2 ? 0 : cursor + 2 };
}
