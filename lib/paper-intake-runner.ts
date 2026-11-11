import type { Response } from "openai/resources/responses/responses";
import { extractionBreakdown, validatePaperExtraction, type PaperText } from "./paper-intake-model";
import { paperIntakePending, type PaperIntakeStage } from "./paper-intake";

export type IntakeRecord = {
  study_id: string; owner_id: string; filename: string; sha256: string; byte_count: number;
  source_id: string; original_artifact_id: string; text_artifact_id: string;
  status: PaperIntakeStage; submit_token: string | null; provider_response_id: string | null;
  request: unknown; paper_text: PaperText | null; created_at: string; updated_at: string; deadline_at: string;
  title: string | null; domain: string | null; authors: string[]; breakdown: unknown; reason: string | null;
};
export type IntakeOperations = {
  save: (operation: string, row: IntakeRecord, payload: Record<string, unknown>) => Promise<IntakeRecord>;
  retrieve: (id: string) => Promise<Response>;
  cancel: (id: string) => Promise<Response>;
};

// This path only reads an existing provider response. It never resubmits inference.
export async function refreshPaperIntake(row: IntakeRecord, ops: IntakeOperations): Promise<IntakeRecord> {
  if (row.status === "submitting" && Date.now() - Date.parse(row.updated_at) > 120_000) {
    return ops.save("uncertain", row, { token: row.submit_token, reason: "The original submission could not be confirmed. It will not be submitted again automatically." });
  }
  if (row.status !== "processing" || !row.provider_response_id) return row;
  if (Date.parse(row.deadline_at) <= Date.now()) {
    const response = await ops.cancel(row.provider_response_id);
    return ops.save("failed", row, { token: row.submit_token, response, reason: "The original paper preparation deadline expired." });
  }
  const response = await ops.retrieve(row.provider_response_id);
  if (response.id !== row.provider_response_id) throw new Error("The model response identity does not match this paper.");
  if (["queued", "in_progress"].includes(response.status ?? "")) return row;
  if (response.status !== "completed") return ops.save("failed", row, { token: row.submit_token, response, reason: String(response.error?.code) === "credit_balance_exhausted" ? "The OpenAI API project has no credits remaining. Add credits before submitting a new assessment. This request is retained and will not be repeated automatically." : `OpenAI returned ${response.status ?? "an unknown status"}. The original response is retained.` });
  let extraction;
  try {
    if (!row.paper_text || response.output.some(item => item.type === "message" && item.content.some(part => part.type === "refusal"))) throw new Error("The model declined to prepare this breakdown.");
    const output = response.output.filter(item => item.type === "message").flatMap(item => item.content).filter(part => part.type === "output_text").map(part => part.text).join("");
    extraction = validatePaperExtraction(JSON.parse(output), row.paper_text);
  } catch (error) {
    return ops.save("failed", row, { token: row.submit_token, response, reason: error instanceof Error ? error.message : "The model output could not be verified." });
  }
  // Saving can be retried by retrieving this same response; no new inference.
  const breakdown = extractionBreakdown(extraction, row.paper_text!, row.source_id, row.text_artifact_id);
  return ops.save("finish", row, { response_id: response.id, response, breakdown, title: extraction.title?.text ?? null, domain: extraction.domain?.text ?? null, authors: extraction.authors.map(a => a.name), authors_page: extraction.authors.length && extraction.authors.every(a => a.page === 1) ? 1 : null });
}

export async function cancelPaperIntake(row: IntakeRecord, ops: IntakeOperations) {
  if (!paperIntakePending(row.status) && row.status !== "uncertain") return row;
  // Do not lose a submitted-but-unacknowledged identity during a concurrent cancel.
  if (row.status === "submitting") throw new Error("The submission is being confirmed. Check status before cancelling.");
  const response = row.provider_response_id ? await ops.cancel(row.provider_response_id) : undefined;
  return ops.save("cancel", row, response ? { response } : {});
}
