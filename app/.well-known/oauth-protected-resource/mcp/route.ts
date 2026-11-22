import { mcpConfig, MCP_SCOPES } from "@/lib/jumpserve-mcp-oauth";

export function GET() {
  const config = mcpConfig();
  if (!config) return new Response(null, { status: 404 });
  return Response.json({
    resource: config.resource,
    resource_name: "JumpServe",
    authorization_servers: [config.issuer],
    scopes_supported: MCP_SCOPES,
    bearer_methods_supported: ["header"],
  }, { headers: { "Cache-Control": "no-store" } });
}
