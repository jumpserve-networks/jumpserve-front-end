import { isDeepStrictEqual } from "node:util";
import { extractionBreakdown } from "./paper-intake-model";
import { readPaperExtraction, type IntakeRecord } from "./paper-intake-runner";
import { validatePaperBreakdown } from "./research-paper-breakdown";

/** Operator recovery only: no inference, altered response, edited evidence or reset limits. */
export function retainedPaperRevalidation(row: IntakeRecord & { response?: unknown }) {
  if (!row.paper_text || !row.provider_response_id || !row.response || typeof row.response !== "object" ||
      !("id" in row.response) || row.response.id !== row.provider_response_id ||
      !("status" in row.response) || row.response.status !== "completed") throw new Error("The original completed response and retained paper text are required.");
  if (row.status !== "ready" && (row.status !== "failed" || row.reason !== "Document provenance or implementation choices are invalid.")) throw new Error("Only the retained source-format validation failure can be revalidated.");
  const request = row.request as { instructions?: unknown; text?: { format?: { name?: string } } } | null;
  if (typeof request?.instructions !== "string" || !request.instructions.trim()) throw new Error("The original saved prompt is required.");
  const response = row.response as Parameters<typeof readPaperExtraction>[0];
  if (request.text?.format?.name && response.text?.format?.type === "json_schema" && response.text.format.name !== request.text.format.name) throw new Error("The response format does not match the original request.");
  const extraction = readPaperExtraction(response, row.paper_text);
  const breakdown = validatePaperBreakdown(extractionBreakdown(extraction, row.paper_text, row.source_id, row.text_artifact_id, request.instructions));
  if (row.status === "ready" && !isDeepStrictEqual(row.breakdown, breakdown)) throw new Error("The ready assessment already contains different retained evidence.");
  return { response_id: response.id, response, breakdown, title: extraction.title?.text ?? null, domain: extraction.domain?.text ?? null, authors: extraction.authors.map(author => author.name), authors_page: extraction.authors.length && extraction.authors.every(author => author.page === 1) ? 1 : null };
}
