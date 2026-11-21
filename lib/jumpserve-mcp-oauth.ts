import { createHash, randomBytes } from "node:crypto";
import { getConfiguredSiteUrl } from "@/lib/site-url";

export const MCP_SCOPE = "assessments:share";
export const MCP_AUTHORIZE_PATH = "/oauth/jumpserve/authorize";
export const MCP_TOKEN_PATH = "/oauth/jumpserve/token";
export const MCP_RESOURCE_METADATA_PATH = "/.well-known/oauth-protected-resource/mcp";
export const MCP_CLIENTS = {
  "jumpserve-codex": { name: "Codex", port: 17651 },
  "jumpserve-claude-code": { name: "Claude Code", port: 17652 },
} as const;

export function mcpConfig() {
  const issuer = getConfiguredSiteUrl();
  if (process.env.JUMPSERVE_MCP_ENABLED !== "true" || !issuer) return null;
  const url = new URL(issuer);
  if (url.protocol !== "https:" &&
      !(url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname))) return null;
  return { issuer, resource: `${issuer}/mcp`, metadata: `${issuer}${MCP_RESOURCE_METADATA_PATH}` };
}

export function clientInfo(id: string | null) {
  return id === "jumpserve-codex" || id === "jumpserve-claude-code" ? MCP_CLIENTS[id] : null;
}

export function registeredRedirect(clientId: string | null, redirect: string | null): redirect is string {
  const client = clientInfo(clientId);
  return !!client && (redirect === `http://127.0.0.1:${client.port}/callback` ||
    redirect === `http://localhost:${client.port}/callback`);
}

export function parseAuthorizationRequest(query: URLSearchParams, resource: string) {
  const clientId = query.get("client_id");
  const redirectUri = query.get("redirect_uri");
  const challenge = query.get("code_challenge");
  const state = query.get("state");
  const resourceIndicator = query.get("resource");
  if ([...query.keys()].some(key => query.getAll(key).length > 1) ||
      !clientId || !registeredRedirect(clientId, redirectUri) ||
      query.get("response_type") !== "code" || query.get("code_challenge_method") !== "S256" ||
      !challenge || !/^[A-Za-z0-9_-]{43}$/.test(challenge) || !state || state.length > 512 ||
      (query.has("scope") && query.get("scope") !== MCP_SCOPE) ||
      (resourceIndicator !== null && resourceIndicator !== resource)) return null;
  return { clientId, redirectUri, challenge, state };
}

export function opaqueCredential() {
  return randomBytes(32).toString("base64url");
}
export function credentialHash(value: string) {
  return createHash("sha256").update(value).digest("hex");
}
export function verifierChallenge(value: string) {
  return createHash("sha256").update(value).digest("base64url");
}
export function isOpaqueCredential(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{43}$/.test(value);
}

export class BoundedBodyError extends Error {
  readonly status: number;
  constructor(status: number) {
    super(status === 413 ? "Request body is too large." : "Request body is invalid.");
    this.status = status;
  }
}

export async function readBoundedBody(request: Request, maximum: number) {
  const reader = request.body?.getReader();
  if (!reader) throw new BoundedBodyError(400);
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let received = 0;
  let contents = "";
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) return contents + decoder.decode();
      received += value.byteLength;
      if (received > maximum) {
        await reader.cancel();
        throw new BoundedBodyError(413);
      }
      contents += decoder.decode(value, { stream: true });
    }
  } catch (error) {
    if (error instanceof BoundedBodyError) throw error;
    throw new BoundedBodyError(400);
  } finally {
    reader.releaseLock();
  }
}
