import {
  isOpaqueCredential, mcpConfig, MCP_SCOPE, readBoundedBody,
  registeredRedirect, verifierChallenge,
} from "@/lib/jumpserve-mcp-oauth";
import { exchangeGrant, resolveMcpClient } from "@/lib/jumpserve-mcp-store";

const headers = { "Cache-Control": "no-store", Pragma: "no-cache" };

function oauthError(error: string, status = 400) {
  return Response.json({ error }, { status, headers });
}

export async function POST(request: Request) {
  const config = mcpConfig();
  if (!config) return new Response(null, { status: 404 });
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/x-www-form-urlencoded" ||
      request.headers.has("authorization")) return oauthError("invalid_request");
  let body: URLSearchParams;
  try {
    body = new URLSearchParams(await readBoundedBody(request, 4096));
  } catch {
    return oauthError("invalid_request");
  }
  if ([...body.keys()].some(key => body.getAll(key).length > 1) || body.has("client_secret") ||
      (body.has("resource") && body.get("resource") !== config.resource)) return oauthError("invalid_request");
  if (body.has("scope") && body.get("scope") !== MCP_SCOPE) return oauthError("invalid_scope");
  const client = body.get("client_id");
  if (!client) return oauthError("invalid_client");
  const grant = body.get("grant_type");
  if (grant !== "authorization_code" && grant !== "refresh_token") return oauthError("unsupported_grant_type");
  const proof = body.get(grant === "authorization_code" ? "code" : "refresh_token");
  if (!isOpaqueCredential(proof)) return oauthError("invalid_grant");
  const redirect = body.get("redirect_uri");
  const verifier = body.get("code_verifier");
  try {
    const clientDetails = await resolveMcpClient(client, config.resource);
    if (!clientDetails) return oauthError("invalid_client");
    if (grant === "authorization_code" &&
        (!registeredRedirect(clientDetails, redirect) || !verifier || !/^[A-Za-z0-9._~-]{43,128}$/.test(verifier))) {
      return oauthError("invalid_grant");
    }
    const tokens = await exchangeGrant({
      grant, proof, client, resource: config.resource,
      redirect, challenge: verifier ? verifierChallenge(verifier) : null,
    });
    return tokens
      ? Response.json({ ...tokens, token_type: "Bearer", expires_in: 3600, scope: MCP_SCOPE }, { headers })
      : oauthError("invalid_grant");
  } catch {
    return oauthError("temporarily_unavailable", 503);
  }
}
