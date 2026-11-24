import { BoundedBodyError, isOpaqueCredential, mcpConfig, MCP_DOWNLOAD_SCOPE, readBoundedBody } from "@/lib/jumpserve-mcp-oauth";
import { connectorActor, connectorMayDownloadSource, localAssessmentSourceTicket, previewAssessment, saveCoachReport, saveGeneratorResult, saveVerifierResult, submitAssessment } from "@/lib/jumpserve-mcp-store";
import { isAssessmentPdfDownloadRequest, isVerifierSaveRequest, serveJumpServeTools } from "@/lib/jumpserve-mcp-server";
import { MAX_VERIFIER_REQUEST_BYTES } from "@/lib/jumpserve-verification";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const config = mcpConfig();
  if (!config) return new Response(null, { status: 404 });
  const origin = request.headers.get("origin");
  if (origin && origin !== config.issuer) return new Response(null, { status: 403 });
  const token = request.headers.get("authorization")?.match(/^Bearer ([A-Za-z0-9_-]+)$/i)?.[1];
  function unauthorized() {
    return new Response(null, { status: 401, headers: {
      "WWW-Authenticate": `Bearer resource_metadata="${config?.metadata}", scope="${MCP_DOWNLOAD_SCOPE}"`,
      "Cache-Control": "no-store",
    } });
  }
  if (!isOpaqueCredential(token)) return unauthorized();
  let actor;
  try {
    actor = await connectorActor(token, config.resource);
  } catch {
    return new Response(null, { status: 503 });
  }
  if (!actor) return unauthorized();
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") {
    return new Response(null, { status: 415 });
  }
  let body: unknown;
  let exceedsAssessmentLimit = false;
  try {
    const json = await readBoundedBody(request, MAX_VERIFIER_REQUEST_BYTES);
    exceedsAssessmentLimit = Buffer.byteLength(json) > 600_000;
    body = JSON.parse(json);
    if (exceedsAssessmentLimit && !isVerifierSaveRequest(body)) throw new BoundedBodyError(413);
  } catch (error) {
    return Response.json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Invalid request body." } },
      { status: error instanceof BoundedBodyError ? error.status : exceedsAssessmentLimit ? 413 : 400 });
  }
  let sourceAccess: Promise<boolean> | undefined;
  const mayDownload = () => sourceAccess ??= connectorMayDownloadSource(token, config.resource);
  if (isAssessmentPdfDownloadRequest(body)) {
    try {
      if (!await mayDownload()) return new Response(null, { status: 403, headers: {
        "WWW-Authenticate": `Bearer error="insufficient_scope", resource_metadata="${config.metadata}", scope="${MCP_DOWNLOAD_SCOPE}"`,
        "Cache-Control": "no-store",
      } });
    } catch {
      return new Response(null, { status: 503 });
    }
  }
  const response = await serveJumpServeTools(request, body, config.issuer, {
    download: async id => {
      if (!await mayDownload()) throw new Error("Reconnect the JumpServe plugin to allow downloading Step 1 PDFs.");
      return localAssessmentSourceTicket(actor, id, 180);
    },
    preview: ({ bundle, hash }, assessmentId) => previewAssessment(actor, bundle, hash, assessmentId),
    saveGenerator: (data, assessmentId) => saveGeneratorResult(actor, assessmentId, data),
    saveVerifier: (data, assessmentId, version) => saveVerifierResult(actor, assessmentId, version, data),
    saveCoach: data => saveCoachReport(actor, data),
    submit: id => submitAssessment(actor, id),
  });
  const headers = new Headers(response.headers);
  headers.set("Cache-Control", "no-store");
  return new Response(response.body, { status: response.status, headers });
}

export function GET() {
  return new Response(null, { status: mcpConfig() ? 405 : 404, headers: { Allow: "POST" } });
}

export const DELETE = GET;
