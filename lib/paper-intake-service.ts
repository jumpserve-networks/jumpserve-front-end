import OpenAI from "openai";
import type { Response } from "openai/resources/responses/responses";
import { PAPER_INTAKE_MODEL, PAPER_INTAKE_RESERVATION_CENTS, paperModelRequest, serializePaperText } from "./paper-intake-model";
import { extractPaperPDF } from "./paper-intake-pdf";
import { refreshPaperIntake, type IntakeOperations, type IntakeRecord } from "./paper-intake-runner";

export type PaperArtifact = { id: string; sha256: string; byte_count: number; storage_path: string; media_type: string; provenance: Record<string, unknown> };
export type PaperPreparationOperations = IntakeOperations & {
  readOriginal: (row: IntakeRecord) => Promise<Uint8Array>;
  retainArtifact: (row: IntakeRecord, id: string, bytes: Uint8Array, mediaType: string, kind: string) => Promise<PaperArtifact>;
  create: (request: ReturnType<typeof paperModelRequest>, token: string) => Promise<Response>;
};

/** Shared orchestration. The web adapter verifies Google; the CLI uses operator MCP access. */
export async function preparePaperIntake(row: IntakeRecord, ops: PaperPreparationOperations) {
  if (row.status !== "uploaded") return refreshPaperIntake(row, ops);
  const bytes = await ops.readOriginal(row);
  const paper = await extractPaperPDF(bytes, row);
  const request = paperModelRequest(paper);
  const artifacts = [await ops.retainArtifact(row, row.original_artifact_id, bytes, "application/pdf", "paper-original-upload"), await ops.retainArtifact(row, row.text_artifact_id, new TextEncoder().encode(serializePaperText(paper)), "application/json", "paper-text-extraction")];
  const admitted = await ops.save("begin", row, { model_id: PAPER_INTAKE_MODEL, request, paper_text: paper, artifacts, reserved_cents: PAPER_INTAKE_RESERVATION_CENTS });
  if (!admitted.admitted) return admitted;
  let response;
  try { response = await ops.create(request, admitted.submit_token!); }
  catch (error) {
    if (error instanceof OpenAI.APIError && error.status && error.status >= 400 && error.status < 500 && ![408, 409].includes(error.status)) return ops.save("failed", admitted, { token: admitted.submit_token, response: { status: error.status, request_id: error.requestID }, reason: `OpenAI rejected the paper request (HTTP ${error.status}). Check the server's model access, API key and quota. The request will not be submitted again automatically.` });
    return ops.save("uncertain", admitted, { token: admitted.submit_token, reason: "The original OpenAI submission was not confirmed. It will not be submitted again automatically; reconcile the retained request identity before any replacement." });
  }
  const payload = { token: admitted.submit_token, response_id: response.id, response };
  try { return await ops.save("submitted", admitted, payload); }
  catch { return ops.save("submitted", admitted, payload); } // Acknowledge only; no inference retry.
}
