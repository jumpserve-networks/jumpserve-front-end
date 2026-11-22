import { BoundedBodyError, isOpaqueCredential, mcpConfig, MCP_SCOPE, readBoundedBody } from "@/lib/jumpserve-mcp-oauth";
import { connectorActor, previewAssessment, submitAssessment } from "@/lib/jumpserve-mcp-store";
import { serveJumpServeTools } from "@/lib/jumpserve-mcp-server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const config = mcpConfig();
  if (!config) return new Response(null, { status: 404 });
  const origin = request.headers.get("origin");
  if (origin && origin !== config.issuer) return new Response(null, { status: 403 });
  const token = request.headers.get("authorization")?.match(/^Bearer ([A-Za-z0-9_-]+)$/i)?.[1];
  function unauthorized() {
    return new Response(null, { status: 401, headers: {
      "WWW-Authenticate": `Bearer resource_metadata="${config?.metadata}", scope="${MCP_SCOPE}"`,
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
  try {
    body = JSON.parse(await readBoundedBody(request, 600_000));
  } catch (error) {
    return Response.json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Invalid request body." } },
      { status: error instanceof BoundedBodyError ? error.status : 400 });
  }
  const response = await serveJumpServeTools(request, body, config.issuer, {
    preview: ({ bundle, hash }, assessmentId) => previewAssessment(actor, bundle, hash, assessmentId),
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
