import {
  BoundedBodyError, issueClientId, loopbackCallback, mcpConfig, MCP_DOWNLOAD_SCOPE, parseMcpScope, readBoundedBody,
} from "@/lib/jumpserve-mcp-oauth";
import { connectorServiceKey } from "@/lib/jumpserve-mcp-store";

const headers = { "Cache-Control": "no-store" };
const grantTypes = ["authorization_code", "refresh_token"];
const responseTypes = ["code"];

function errorResponse(error: string, status = 400) {
  return Response.json({ error }, { status, headers });
}

export async function POST(request: Request) {
  const config = mcpConfig();
  if (!config) return new Response(null, { status: 404 });
  const origin = request.headers.get("origin");
  if (origin && origin !== config.issuer) return new Response(null, { status: 403 });
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") {
    return errorResponse("invalid_client_metadata");
  }
  let body;
  try {
    body = JSON.parse(await readBoundedBody(request, 8192));
  } catch (error) {
    return errorResponse("invalid_client_metadata", error instanceof BoundedBodyError ? error.status : 400);
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) return errorResponse("invalid_client_metadata");
  const redirects = body.redirect_uris;
  if (!Array.isArray(redirects) || redirects.length !== 1 || !loopbackCallback(redirects[0])) {
    return errorResponse("invalid_redirect_uri");
  }
  const scope = body.scope === undefined || body.scope === "" ? MCP_DOWNLOAD_SCOPE : parseMcpScope(body.scope);
  if (!scope || (body.token_endpoint_auth_method !== undefined && body.token_endpoint_auth_method !== "none") ||
      (body.grant_types !== undefined && (!Array.isArray(body.grant_types) ||
        !body.grant_types.includes("authorization_code") || body.grant_types.some((grant: string) => !grantTypes.includes(grant)))) ||
      (body.response_types !== undefined && (!Array.isArray(body.response_types) ||
        body.response_types.length !== 1 || body.response_types[0] !== "code"))) {
    return errorResponse("invalid_client_metadata");
  }
  try {
    // A signed identifier binds the registration to this resource and callback
    // without allowing anonymous registration to create database records.
    const id = issueClientId(redirects[0], config.resource, await connectorServiceKey());
    return Response.json({
      client_id: id,
      redirect_uris: redirects,
      token_endpoint_auth_method: "none",
      grant_types: grantTypes,
      response_types: responseTypes,
      scope,
    }, { status: 201, headers });
  } catch {
    return errorResponse("temporarily_unavailable", 503);
  }
}
