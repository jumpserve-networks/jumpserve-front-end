import { mcpConfig, MCP_AUTHORIZE_PATH, MCP_REGISTRATION_PATH, MCP_SCOPE, MCP_TOKEN_PATH } from "@/lib/jumpserve-mcp-oauth";

export function GET() {
  const config = mcpConfig();
  if (!config) return new Response(null, { status: 404 });
  return Response.json({
    issuer: config.issuer,
    authorization_endpoint: config.issuer + MCP_AUTHORIZE_PATH,
    token_endpoint: config.issuer + MCP_TOKEN_PATH,
    registration_endpoint: config.issuer + MCP_REGISTRATION_PATH,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    token_endpoint_auth_methods_supported: ["none"],
    code_challenge_methods_supported: ["S256"],
    scopes_supported: [MCP_SCOPE],
  }, { headers: { "Cache-Control": "no-store" } });
}
