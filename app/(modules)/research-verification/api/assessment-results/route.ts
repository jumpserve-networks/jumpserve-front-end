import { prepareAssessmentBundle } from "@/lib/jumpserve-assessment-bundle";
import { prepareCoachReport } from "@/lib/jumpserve-coach";
import { BoundedBodyError, isOpaqueCredential, mcpConfig, readBoundedBody } from "@/lib/jumpserve-mcp-oauth";
import { connectorActor, previewAssessment, readLocalAssessmentSource, reserveLocalAssessmentSource, saveCoachReport, saveGeneratorResult, saveVerifierResult } from "@/lib/jumpserve-mcp-store";
import { isVerifierVersion, MAX_VERIFIER_REQUEST_BYTES, prepareVerifierResult } from "@/lib/jumpserve-verification";
import { isPaperSha256 } from "@/lib/local-assessment-source";
import { isResearchId } from "@/lib/research-experiment-queue";
import { PAPER_UPLOAD_MAX_BYTES } from "@/lib/research-paper-upload";

export const runtime = "nodejs";

function reply(value: unknown, status = 200) {
  return Response.json(value, { status, headers: { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" } });
}

export async function POST(request: Request) {
  const config = mcpConfig();
  if (!config) return reply({ error: "Private evaluation saves are unavailable." }, 404);
  const token = request.headers.get("authorization")?.match(/^Bearer (\S+)$/i)?.[1];
  if (!isOpaqueCredential(token)) return reply({ error: "Authorize the CLI to save private evaluation results." }, 401);
  let owner;
  try {
    owner = await connectorActor(token, config.resultsResource);
  } catch {
    return reply({ error: "JumpServe could not verify your sign-in." }, 503);
  }
  if (!owner) return reply({ error: "Authorize the CLI to save private evaluation results." }, 401);
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") {
    return reply({ error: "A JSON request is required." }, 415);
  }

  let input;
  try {
    input = JSON.parse(await readBoundedBody(request, MAX_VERIFIER_REQUEST_BYTES));
  } catch (error) {
    return reply({ error: "Invalid private evaluation request." }, error instanceof BoundedBodyError ? error.status : 400);
  }
  if (!input || typeof input !== "object" || Array.isArray(input)) return reply({ error: "Invalid private evaluation request." }, 400);
  const fields = Object.keys(input).sort().join(",");
  const { action, assessment_id } = input;
  const saved = (ids: Record<string, string>) => reply({ status: "saved_private", ...ids });

  try {
    if (action === "check" && fields === "action") return reply({ status: "ready" });
    if (action === "coach" && fields === "action,report") {
      return saved({ coach_report_id: await saveCoachReport(owner, prepareCoachReport(input.report)) });
    }
    if (!isResearchId(assessment_id)) return reply({ error: "A valid assessment ID is required." }, 400);

    if ((action === "reserve" || action === "verify") && fields === "action,assessment_id,byte_count,sha256") {
      const { sha256, byte_count } = input;
      if (!isPaperSha256(sha256) || !Number.isSafeInteger(byte_count) || byte_count < 1 || byte_count > PAPER_UPLOAD_MAX_BYTES) {
        return reply({ error: "Valid PDF metadata is required." }, 400);
      }
      if (action === "reserve") {
        const ticket = await reserveLocalAssessmentSource(owner, assessment_id, { sha256, byte_count });
        if (!ticket) return reply({ error: "This assessment ID is unavailable for the selected PDF." }, 409);
        return reply(ticket.status === "pending" ? { status: ticket.status, upload_url: ticket.uploadUrl } : ticket);
      }
      const source = await readLocalAssessmentSource(owner, assessment_id);
      return source?.sha256 === sha256 && source.byte_count === byte_count ? reply({ status: "ready" })
        : reply({ error: "JumpServe could not verify the uploaded PDF." }, 404);
    }
    if (action === "generator" && fields === "action,assessment_id,bundle") {
      const result = prepareAssessmentBundle(input.bundle);
      const attached = result.bundle.paper.pdf_copy ? result
        : prepareAssessmentBundle({ ...result.bundle, paper: { ...result.bundle.paper, pdf_copy: true } });
      await previewAssessment(owner, attached.bundle, attached.hash, assessment_id);
      // Keep the exact artifact available to the Verifier when the private preview adds the PDF attachment flag.
      return saved({ assessment_id, generator_result_id: await saveGeneratorResult(owner, assessment_id, result) });
    }
    if (action === "verifier" && fields === "action,assessment_id,assessment_json,scorecard,verifier_version" && isVerifierVersion(input.verifier_version)) {
      const data = prepareVerifierResult(input.assessment_json, input.scorecard);
      return saved({ verification_id: await saveVerifierResult(owner, assessment_id, input.verifier_version, data) });
    }
    return reply({ error: "Unknown or invalid private evaluation operation." }, 400);
  } catch (error) {
    return reply({ error: error instanceof Error ? error.message : "JumpServe could not save the private evaluation." }, 409);
  }
}
