import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { getConfiguredSiteUrl } from "@/lib/site-url";

export const MCP_SCOPE = "assessments:share";
export const MCP_SOURCE_SCOPE = "assessments:read-source";
export const MCP_DOWNLOAD_SCOPE = `${MCP_SCOPE} ${MCP_SOURCE_SCOPE}`;
export const MCP_SCOPES = [MCP_SCOPE, MCP_SOURCE_SCOPE];

export function parseMcpScope(value: unknown) {
  if (value === MCP_SCOPE) return MCP_SCOPE;
  if (value === MCP_DOWNLOAD_SCOPE || value === `${MCP_SOURCE_SCOPE} ${MCP_SCOPE}`) return MCP_DOWNLOAD_SCOPE;
  return null;
}
export const MCP_AUTHORIZE_PATH = "/oauth/jumpserve/authorize";
export const MCP_TOKEN_PATH = "/oauth/jumpserve/token";
export const MCP_REGISTRATION_PATH = "/oauth/jumpserve/register";
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

function fixedClient(id: string | null) {
  return id === "jumpserve-codex" || id === "jumpserve-claude-code" ? MCP_CLIENTS[id] : null;
}

// Codex can append a server-specific callback ID. Public native clients may
// select a new loopback port at login, and code exchange binds the exact URI.
export function loopbackCallback(uri: unknown) {
  if (typeof uri !== "string") return null;
  const callback = /^http:\/\/(127\.0\.0\.1|localhost)(?::([1-9][0-9]{0,4}))?(\/callback(?:\/[A-Za-z0-9_-]{12})?)$/.exec(uri);
  if (!callback || callback[0] !== uri) return null;
  const [, host, textPort, path] = callback;
  const port = textPort ? Number(textPort) : null;
  if (port !== null && (port < 1024 || port > 65535)) return null;
  return { host, port, path };
}

const registrationId = /^js1\.([A-Za-z0-9_-]{1,100})\.([A-Za-z0-9_-]{22})\.([A-Za-z0-9_-]{43})$/;
export function isRegisteredClientId(id: string | null) {
  return id !== null && registrationId.test(id);
}

function registrationSignature(payload: string, resource: string, key: string) {
  return createHmac("sha256", key).update("jumpserve-mcp-registration-v1\0")
    .update(resource).update("\0").update(payload).digest("base64url");
}

export function issueClientId(redirectUri: string, resource: string, key: string) {
  const payload = Buffer.from(redirectUri).toString("base64url") + "." + randomBytes(16).toString("base64url");
  return `js1.${payload}.${registrationSignature(payload, resource, key)}`;
}

type McpClient = { name: string } & (
  { redirect: NonNullable<ReturnType<typeof loopbackCallback>> } | { port: number }
);

export function clientInfo(id: string | null, resource: string, key?: string): McpClient | null {
  const fixed = fixedClient(id);
  if (fixed) return fixed;
  const match = id && key ? registrationId.exec(id) : null;
  if (!match || match[0] !== id || !key) return null;
  const [, encodedRedirect, nonce, signature] = match;
  const expected = registrationSignature(encodedRedirect + "." + nonce, resource, key);
  if (!timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
  const redirect = loopbackCallback(Buffer.from(encodedRedirect, "base64url").toString("utf8"));
  return redirect ? { name: "an MCP client", redirect } : null;
}

export function registeredRedirect(client: McpClient | null, redirect: string | null): redirect is string {
  if (!client || !redirect) return false;
  const callback = loopbackCallback(redirect);
  if (callback?.port == null) return false;
  return "redirect" in client
    ? callback.host === client.redirect.host && callback.path === client.redirect.path
    : callback.port === client.port && callback.path === "/callback";
}

export function parseAuthorizationRequest(query: URLSearchParams, resource: string, client: McpClient | null = fixedClient(query.get("client_id"))) {
  const clientId = query.get("client_id");
  const redirectUri = query.get("redirect_uri");
  const challenge = query.get("code_challenge");
  const state = query.get("state");
  const resourceIndicator = query.get("resource");
  const scope = query.has("scope") ? parseMcpScope(query.get("scope")) : MCP_DOWNLOAD_SCOPE;
  if ([...query.keys()].some(key => query.getAll(key).length > 1) ||
      !client || !clientId || !registeredRedirect(client, redirectUri) ||
      query.get("response_type") !== "code" || query.get("code_challenge_method") !== "S256" ||
      !challenge || !/^[A-Za-z0-9_-]{43}$/.test(challenge) || !state || state.length > 512 ||
      !scope ||
      (resourceIndicator !== null && resourceIndicator !== resource)) return null;
  return { clientId, clientName: client.name, redirectUri, challenge, state, readSources: scope === MCP_DOWNLOAD_SCOPE };
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
