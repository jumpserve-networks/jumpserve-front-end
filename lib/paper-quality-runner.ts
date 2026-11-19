import OpenAI from "openai";
import type { Response, ResponseCreateParamsNonStreaming } from "openai/resources/responses/responses";
import { deterministicQualityChecks } from "./paper-quality-checks";
import { PAPER_QUALITY_VERSION, type PaperQualityContext, type PaperQualityChecks, type PaperQualityPhase, type PaperQualityReview, type PaperQualityStep, type PaperQualityProgress, type PaperQualityRound, type QualitySandboxArtifact } from "./paper-quality";
import { validateQualityContext } from "./paper-quality-context";
import { qualityAttachment, qualityReviewRequest, qualityRepairRequest, readQualityReview, sandboxQualityChecks, type QualitySource } from "./paper-quality-model";
import type { PaperAgentRecord } from "./paper-agent";

export type QualityCall = {
  provider_type?: "responses" | "managed_agent";
  id: string; kind: "review" | "repair"; status: "preparing" | "submitting" | "processing" | "uncertain" | "completed" | "failed" | "cancelled";
  submit_token: string; provider_response_id: string | null; request: ResponseCreateParamsNonStreaming | null; updated_at: string;
};
export type QualityWorkflow = {
  id: string; study_id: string; owner_id: string; step: PaperQualityStep; experiment_index: number;
  status: "waiting" | "review_pending" | "repair_pending" | "running" | "approved" | "needs_attention" | "uncertain" | "cancelled";
  phase: PaperQualityPhase; round: PaperQualityRound; source_json: QualitySource; candidate: unknown;
  original_request: ResponseCreateParamsNonStreaming; deadline_at: string; updated_at: string;
  review: PaperQualityReview | null; checks: PaperQualityChecks | null; reason: string | null;
  source_revision: number | null; source_provider_id: string | null;
  call: QualityCall | null; admitted?: boolean; review_context?: PaperQualityContext;
  agent?: PaperAgentRecord | null;
};
export type QualityOperations = {
  save: (operation: string, payload: Record<string, unknown>) => Promise<QualityWorkflow>;
  upload: (attachment: ReturnType<typeof qualityAttachment>) => Promise<string>;
  create: (request: ResponseCreateParamsNonStreaming, token: string) => Promise<Response>;
  retrieve: (id: string) => Promise<Response>; cancel: (id: string) => Promise<Response>;
  parseRepair: (response: Response, row: QualityWorkflow) => unknown;
  sandboxArtifact?: (response: Response, source: QualitySource) => Promise<QualitySandboxArtifact | null>;
  now?: () => number;
  repairRuntime?: "managed-agents-v1";
  agentReady?: () => Promise<void>;
  advanceAgent?: (row: QualityWorkflow, admit: boolean) => Promise<QualityWorkflow>;
};
export class PaperQualityLimitError extends Error {}
const terminal = (row: QualityWorkflow) => ["approved", "needs_attention", "uncertain", "cancelled", "waiting"].includes(row.status);
const pending = (response: Response) => ["queued", "in_progress"].includes(response.status ?? "");
const sourceFor = (row: QualityWorkflow): QualitySource => ({ ...row.source_json, candidate: row.candidate });
const sourceKey = (row: QualityWorkflow) => qualityAttachment(sourceFor(row)).hash;
const identity = (row: QualityWorkflow) => ({ call_id: row.call?.id, token: row.call?.submit_token });
const fail = (ops: QualityOperations, row: QualityWorkflow, reason: string, response?: Response) => ops.save("failed", { ...identity(row), reason: reason.slice(0, 2000), ...(response ? { response } : {}) });

/** Status reads only reconcile known identities. Only an explicit authorized
 * advancement POST may enter this admission path. Every repair needs re-review;
 * the database enforces at most three repairs within the original limits. */
export async function advancePaperQuality(row: QualityWorkflow, ops: QualityOperations, admit = false): Promise<QualityWorkflow> {
  if (row.call?.provider_type === "managed_agent" && ["running", "uncertain"].includes(row.status)) {
    if (!ops.advanceAgent) throw new Error("The managed repair adapter is unavailable; the original session is retained.");
    return ops.advanceAgent(row, admit);
  }
  if (terminal(row)) return row;
  const now = (ops.now ?? Date.now)();
  if (row.status === "running") {
    const call = row.call;
    if (!call) throw new Error("The retained quality call is missing.");
    if (!call.provider_response_id) {
      if (now - Date.parse(call.updated_at) > 120000) return ops.save("uncertain", { ...identity(row), reason: "The original quality submission was not acknowledged. Reconcile it before continuing." });
      return row;
    }
    let response = await ops.retrieve(call.provider_response_id);
    if (response.id !== call.provider_response_id) throw new Error("The response does not match the original quality call.");
    if (pending(response) && Date.parse(row.deadline_at) <= now) response = await ops.cancel(call.provider_response_id);
    if (response.id !== call.provider_response_id) throw new Error("The cancellation does not match the original quality call.");
    if (pending(response)) return row;
    if (response.status === "cancelled") return ops.save("cancel", { ...identity(row), response, reason: "The original quality call was cancelled or its assessment deadline expired." });
    // Retryable storage/provider reads must not turn an otherwise completed
    // review into a failed inference or cause another inference admission.
    const artifact = row.step === 4 && call.kind === "review" && response.status === "completed" ? await ops.sandboxArtifact?.(response, sourceFor(row)) : undefined;
    let operation: string, payload: Record<string, unknown>;
    try {
      if (call.kind === "repair") {
        const candidate = ops.parseRepair(response, row), source = { ...sourceFor(row), candidate }, checks = deterministicQualityChecks(source);
        // A structurally invalid replacement cannot be presented or used as input
        // for another repair. The original response and diagnostics are retained.
        if (!checks.passed) return fail(ops, row, checks.findings.map(f => f.evidence).join(" "), response);
        operation = "repaired";payload = { ...identity(row), response, candidate, checks };
      } else {
      const review = readQualityReview(response, frozenQualityContext(call.request)), source = sourceFor(row), deterministic = deterministicQualityChecks(source);
      const sandbox = row.step === 4 ? sandboxQualityChecks(response, source, artifact) : null;
      const checks: PaperQualityChecks = { ...deterministic, passed: deterministic.passed && (!sandbox || sandbox.passed), findings: [...deterministic.findings, ...(sandbox?.findings ?? [])], ...(sandbox?.sandbox ? { sandbox: sandbox.sandbox } : {}) };
      operation = "reviewed";payload = { ...identity(row), response, review, checks };
      }
    } catch (error) {
      return fail(ops, row, error instanceof Error ? error.message : "The retained quality result could not be verified.", response);
    }
    return ops.save(operation, payload);
  }
  if (!admit) return row;
  if (Date.parse(row.deadline_at) <= now) return fail(ops, row, "The original assessment deadline expired before quality checking could continue.");
  if (row.status === "repair_pending" && ops.repairRuntime) {
    if (!ops.agentReady || !ops.advanceAgent) throw new Error("The managed repair adapter and database capability are required before admission.");
    await ops.agentReady();
  }
  // Read-only capability/context check BEFORE reserving a call. The admission
  // returns a fresh snapshot under the database lock; never submit stale history.
  const contextRow = await ops.save("context", {});
  validateQualityContext(contextRow.review_context!);
  let admitted: QualityWorkflow;
  try { admitted = await ops.save("admit", { source_sha256: sourceKey(row), review_context_version: "paper-quality-context-v1", ...(row.status === "repair_pending" && ops.repairRuntime ? { repair_runtime: ops.repairRuntime, repair_recovery_version: 1 } : {}) }); }
  catch (error) { if (error instanceof PaperQualityLimitError) return fail(ops, row, error.message);throw error; }
  if (!admitted.admitted) return admitted;
  if (row.status === "repair_pending" && ops.repairRuntime && admitted.call?.provider_type !== "managed_agent") return fail(ops, admitted, "The application and database managed-runtime contracts do not match. No managed session or replacement model response was submitted.");
  if (admitted.call?.provider_type === "managed_agent") {
    if (!ops.advanceAgent) throw new Error("The managed repair adapter is unavailable.");
    return ops.advanceAgent(admitted, true);
  }
  let prepared = admitted;
  try {
    const source = sourceFor(admitted), call = admitted.call;
    if (!call || call.status !== "preparing") throw new Error("The reserved quality-call identity is missing.");
    const context = validateQualityContext(admitted.review_context!);
    let request: ResponseCreateParamsNonStreaming;
    if (call.kind === "review") {
      const file = admitted.step === 4 ? await ops.upload(qualityAttachment(source)) : undefined;
      request = qualityReviewRequest(source, file, context);
    } else {
      if (!admitted.review || !admitted.checks) throw new Error("Repair requires the retained findings and checks.");
      request = qualityRepairRequest(source, admitted.original_request, admitted.review, admitted.checks, context);
    }
    prepared = await ops.save("request", { ...identity(admitted), request });
    if (prepared.call?.status !== "submitting") throw new Error("The quality request was not frozen before submission.");
    const response = await ops.create(request, prepared.call.submit_token);
    const payload = { ...identity(prepared), response_id: response.id, response };
    try { return await ops.save("submitted", payload); }
    catch { return await ops.save("submitted", payload); } // ACK only; never repeat inference.
  } catch (error) {
    const rejected = error instanceof OpenAI.APIError && error.status && error.status >= 400 && error.status < 500 && ![408, 409].includes(error.status);
    if (rejected) return fail(ops, prepared, "OpenAI rejected the quality request (HTTP " + error.status + "). The original request is retained.");
    return ops.save("uncertain", { ...identity(prepared), reason: "The original attachment or model submission was not acknowledged. It will not be repeated automatically." });
  }
}
/** In-flight legacy calls keep their original format. New reviews are verified
 * against the exact context frozen before their one provider submission. */
export function frozenQualityContext(request: ResponseCreateParamsNonStreaming | null): PaperQualityContext | undefined {
  if (request?.text?.format?.type !== "json_schema" || request.text.format.name !== "paper_quality_review_v2") return undefined;
  if (typeof request.input !== "string") throw new Error("The original review context is missing.");
  return validateQualityContext(JSON.parse(request.input).review_context);
}
export async function cancelPaperQuality(row: QualityWorkflow, ops: QualityOperations): Promise<QualityWorkflow> {
  if (["approved", "needs_attention", "cancelled"].includes(row.status)) return row;
  if (row.status === "uncertain" || row.call && !row.call.provider_response_id && row.status === "running") throw new Error("Reconcile the original quality submission before confirming cancellation.");
  if (!row.call || row.status !== "running") return ops.save("cancel", { reason: "Owner cancelled quality checking before its next call." });
  const response = await ops.cancel(row.call.provider_response_id!);
  if (response.id !== row.call.provider_response_id || response.status !== "cancelled") throw new Error("Quality cancellation has not been confirmed. Check the original saved call.");
  return ops.save("cancel", { ...identity(row), response, reason: "Owner cancelled quality checking." });
}
export function qualityProgress(row: QualityWorkflow): PaperQualityProgress {
  const findings = [...(row.review?.findings ?? []), ...(row.checks?.findings ?? [])];
  return { version: PAPER_QUALITY_VERSION, phase: row.phase, round: row.round, findings: findings.filter((f, i) => findings.findIndex(other => other.id === f.id) === i).slice(0, 30) };
}
